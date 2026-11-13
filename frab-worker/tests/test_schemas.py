"""Schema validation tests: valid objects pass, malformed ones raise."""

from __future__ import annotations

import pytest

from frab_worker.schemas import (
    DetectiveOutput,
    Evidence,
    Finding,
    FinalInvestigationResult,
    JuristOutput,
    Recommendation,
    RegulatoryContext,
    SchemaError,
    ScribeOutput,
    WatchmanOutput,
)


def test_recommendation_enum_includes_insufficient_evidence():
    assert Recommendation.INSUFFICIENT_EVIDENCE in Recommendation.ALL
    assert len(Recommendation.ALL) == 5


def test_watchman_output_validates():
    w = WatchmanOutput(
        triage="REQUIRES_CONTEXTUAL_INVESTIGATION",
        investigation_tier="HIGH",
        investigation_depth="FULL",
        risk_score=0.87,
    )
    w.validate()  # no raise
    assert w.to_dict()["investigation_tier"] == "HIGH"


def test_watchman_bad_tier_raises():
    w = WatchmanOutput("X", "CRITICAL", "FULL")
    with pytest.raises(SchemaError):
        w.validate()


def test_detective_finding_must_reference_known_evidence():
    ev = Evidence("E-001", "AMOUNT_DEVIATION", "6x baseline", 6.0, "behavior_baseline")
    good = DetectiveOutput(evidence=[ev], findings=[Finding("Big txn", ["E-001"])])
    good.validate()  # ok

    bad = DetectiveOutput(evidence=[ev], findings=[Finding("Big txn", ["E-999"])])
    with pytest.raises(SchemaError):
        bad.validate()


def test_finding_without_evidence_raises():
    with pytest.raises(SchemaError):
        Finding("ungrounded claim", []).validate()


def test_duplicate_evidence_id_raises():
    ev1 = Evidence("E-001", "A", "d", 1, "s")
    ev2 = Evidence("E-001", "B", "d", 2, "s")
    with pytest.raises(SchemaError):
        DetectiveOutput(evidence=[ev1, ev2]).validate()


def test_jurist_context_requires_source():
    j = JuristOutput(
        observed_pattern="STRUCTURING",
        regulatory_context=[RegulatoryContext("", "", "text", "why")],
    )
    with pytest.raises(SchemaError):
        j.validate()


def test_scribe_bad_recommendation_raises():
    s = ScribeOutput("summary", recommendation="DELETE_ACCOUNT")
    with pytest.raises(SchemaError):
        s.validate()


def test_final_result_roundtrip_and_validate():
    r = FinalInvestigationResult(
        case_id="CASE0001",
        status="COMPLETE",
        risk_level="HIGH",
        recommendation="ESCALATE",
        investigation_tier="HIGH",
    )
    r.validate()
    d = r.to_dict()
    assert d["recommendation"]["action"] == "ESCALATE"
    assert d["risk"]["level"] == "HIGH"
