"""End-to-end pipeline tests: Supervisor through all scenarios, grounding,
events, tier routing, and partial-failure handling."""

from __future__ import annotations

import pytest

from frab_worker.supervisor import Supervisor
from frab_worker.validator import validate_result

ALL_SCENARIOS = [f"SCN{i:02d}" for i in range(1, 11)]

# expected final recommendation per scenario (CLOSE_FALSE_POSITIVE -> CLOSE)
EXPECTED_RECOMMENDATION = {
    "SCN01": "ESCALATE", "SCN02": "ESCALATE", "SCN03": "ESCALATE",
    "SCN04": "ESCALATE", "SCN05": "MONITOR", "SCN06": "ESCALATE",
    "SCN07": "ESCALATE", "SCN08": "MONITOR", "SCN09": "ESCALATE",
    "SCN10": "CLOSE",
}


@pytest.fixture(scope="module")
def sup(bank, cfg):
    return Supervisor(bank=bank, cfg=cfg)


@pytest.mark.parametrize("scenario_id", ALL_SCENARIOS)
def test_pipeline_recommendation_matches_oracle(scenario_id, sup, oracle):
    scn = oracle[scenario_id]
    res = sup.investigate(scn["case_id"], scn["trigger_transaction_id"])
    assert res.status == "COMPLETE"
    assert res.recommendation == EXPECTED_RECOMMENDATION[scenario_id], (
        f"{scenario_id}: got {res.recommendation}"
    )


@pytest.mark.parametrize("scenario_id", ALL_SCENARIOS)
def test_pipeline_result_is_grounded(scenario_id, sup, bank, cfg, oracle):
    scn = oracle[scenario_id]
    res = sup.investigate(scn["case_id"], scn["trigger_transaction_id"])
    report = validate_result(res, bank, cfg, scn["trigger_transaction_id"])
    assert report.grounded, f"{scenario_id} grounding issues: {report.issues}"


def test_flagship_scn10_closes_as_false_positive(sup, oracle):
    scn = oracle["SCN10"]
    res = sup.investigate(scn["case_id"], scn["trigger_transaction_id"])
    assert res.recommendation == "CLOSE"
    assert res.risk_level == "LOW"
    assert res.observed_pattern == "NONE"


def test_tier_routing(sup, oracle):
    """HIGH scenarios use FULL depth (network present); MONITOR uses LIGHT."""
    high = sup.investigate("CASE0007", oracle["SCN07"]["trigger_transaction_id"])
    assert high.investigation_tier == "HIGH"
    assert high.network  # network trace ran on FULL path

    med = sup.investigate("CASE0008", oracle["SCN08"]["trigger_transaction_id"])
    assert med.investigation_tier == "MEDIUM"
    # network graph is now always built (money-trace renders on every case);
    # the fan-in EVIDENCE is what's gated to the full path, not the graph itself.
    assert med.network.get("found") is True


def test_events_emitted_in_order(bank, cfg, oracle):
    events = []
    sup = Supervisor(bank=bank, cfg=cfg, event_sink=events.append)
    sup.investigate("CASE0007", oracle["SCN07"]["trigger_transaction_id"])
    names = [e["event"] for e in events]
    assert names[0] == "CASE_STARTED"
    assert names[-1] == "INVESTIGATION_COMPLETE"
    assert "WATCHMAN_COMPLETED" in names
    assert "DETECTIVE_COMPLETED" in names
    assert "JURIST_COMPLETED" in names
    assert "SCRIBE_COMPLETED" in names
    assert any(n == "EVIDENCE_DISCOVERED" for n in names)


def test_partial_when_jurist_fails(bank, cfg, oracle, monkeypatch):
    """If Jurist raises, the investigation degrades to PARTIAL, not a crash,
    and does not fabricate regulatory context."""
    sup = Supervisor(bank=bank, cfg=cfg)

    def boom(*a, **k):
        raise RuntimeError("regulatory retrieval down")

    monkeypatch.setattr(sup.jurist, "run", boom)
    res = sup.investigate("CASE0007", oracle["SCN07"]["trigger_transaction_id"])
    assert res.status == "PARTIAL"
    assert "JURIST" in res.failed_stages
    assert res.regulatory_context == []
    # HIGH risk without regulatory context -> insufficient evidence, not a
    # fabricated escalation
    assert res.recommendation == "INSUFFICIENT_EVIDENCE"


def test_failed_when_detective_fails(bank, cfg, oracle, monkeypatch):
    sup = Supervisor(bank=bank, cfg=cfg)

    def boom(*a, **k):
        raise RuntimeError("data source unavailable")

    monkeypatch.setattr(sup.detective, "run", boom)
    res = sup.investigate("CASE0007", oracle["SCN07"]["trigger_transaction_id"])
    assert res.status == "FAILED"
    assert res.recommendation == "INSUFFICIENT_EVIDENCE"


def test_grounding_catches_tampered_score(sup, bank, cfg, oracle):
    """A result whose score was altered (as if the LLM invented it) is rejected."""
    scn = oracle["SCN01"]
    res = sup.investigate(scn["case_id"], scn["trigger_transaction_id"])
    res.risk_score = 0.123  # tamper
    report = validate_result(res, bank, cfg, scn["trigger_transaction_id"])
    assert not report.grounded
    assert any("risk_score mismatch" in i for i in report.issues)
