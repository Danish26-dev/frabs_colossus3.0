"""End-to-end scenario tests against the oracle (demo_runs.csv).

Maps each scenario's expected_action to an expected minimum risk LEVEL and
checks the deterministic pipeline lands there. The oracle is used ONLY for
comparison here — it is never fed into the worker.

KNOWN GAPS (tracked as xfail, not hidden):
  SCN03 STRUCTURING_PATTERN  and  SCN08 REPEATED_CASHOUT
  are SEQUENCE patterns, not single-transaction scalar features. They require
  dedicated pattern detectors (detect_pattern) which are Phase-1 Detective
  scope, not Phase-0 features. Documented here so they surface every test run.
"""

from __future__ import annotations

import pytest

from frab_worker.features import extract_features
from frab_worker.patterns import classify, pattern_severity
from frab_worker.scoring import compute_risk_score

# expected_action -> the risk level the deterministic layer should reach
ACTION_TO_MIN_LEVEL = {
    "ESCALATE": "HIGH",
    "MONITOR": "MEDIUM",
    "CLOSE_FALSE_POSITIVE": "LOW",
}

_LEVEL_RANK = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}

ALL_SCENARIOS = [f"SCN{i:02d}" for i in range(1, 11)]


def _assess(scenario_id, bank, cfg, oracle):
    scn = oracle[scenario_id]
    tx = scn["trigger_transaction_id"]
    feats = extract_features(tx, bank, cfg)
    pattern = classify(tx, bank)
    pattern_dict = {"detected": pattern.detected, "pattern": pattern.pattern,
                    "confidence": pattern.confidence, "note": pattern.note,
                    "severity": pattern_severity(pattern.pattern)}
    return compute_risk_score(feats, cfg, pattern=pattern_dict), scn


@pytest.mark.parametrize("scenario_id", ALL_SCENARIOS)
def test_scenario_level_matches_oracle(scenario_id, bank, cfg, oracle):
    rs, scn = _assess(scenario_id, bank, cfg, oracle)
    expected_level = ACTION_TO_MIN_LEVEL[scn["expected_action"]]

    if scn["expected_action"] == "CLOSE_FALSE_POSITIVE":
        # false positive must land LOW exactly
        assert rs.level == "LOW", (
            f"{scenario_id} should be LOW (false positive) but got "
            f"{rs.level} (score={rs.score:.3f})"
        )
    else:
        assert _LEVEL_RANK[rs.level] >= _LEVEL_RANK[expected_level], (
            f"{scenario_id} expected >= {expected_level} but got "
            f"{rs.level} (score={rs.score:.3f})"
        )


def test_scn08_repeated_cashout_is_monitor_not_escalate(bank, cfg, oracle):
    """Repeated cash-out is a MONITOR-tier layering indicator, not an automatic
    ESCALATE. Per-pattern severity must keep it at MEDIUM, not over-escalate."""
    rs, _ = _assess("SCN08", bank, cfg, oracle)
    assert rs.level == "MEDIUM", f"expected MEDIUM, got {rs.level}"


def test_scn10_flagship_false_positive(bank, cfg, oracle):
    """The flagship: high-value transfer that IS a false positive because the
    beneficiary is established with 5 prior similar transfers. Must NOT escalate."""
    rs, _ = _assess("SCN10", bank, cfg, oracle)
    assert rs.level == "LOW"
    assert rs.components  # has a full breakdown
    bn = next(c for c in rs.components if c.name == "beneficiary_novelty")
    assert bn.value == 0.0  # established beneficiary is the deciding evidence


def test_every_conclusion_has_evidence(bank, cfg, oracle):
    """Governing rule: every component carries the raw evidence behind it."""
    for scenario_id in ALL_SCENARIOS:
        rs, _ = _assess(scenario_id, bank, cfg, oracle)
        for c in rs.components:
            assert isinstance(c.evidence, dict) and c.evidence, (
                f"{scenario_id}/{c.name} has no evidence"
            )
