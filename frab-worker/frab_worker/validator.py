"""Evidence-grounding validator (Phase 1).

The deterministic enforcement of the governing rule:

    Every important number and conclusion must trace to deterministic
    computation or a specific evidence ID; the LLM is never the source of truth.

Scope (deliberately bounded): this validates STRUCTURED and NUMERIC claims —
reference integrity, enum validity, and that the reported score equals the
independently recomputed deterministic score. It does NOT attempt full semantic
validation of free-text narrative (an open-ended NLP problem); narrative is
allowed to be narrative. Numeric + reference-integrity checks give the bulk of
the credibility for a fraction of the effort.

Returns a GroundingReport (list of issues). An empty report means the result is
fully grounded.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .data_access import BankData
from .features import extract_features
from .patterns import classify, pattern_severity
from .schemas import FinalInvestigationResult, Recommendation, RiskLevel
from .scoring import compute_risk_score


@dataclass
class GroundingReport:
    issues: list[str] = field(default_factory=list)

    @property
    def grounded(self) -> bool:
        return not self.issues

    def add(self, msg: str) -> None:
        self.issues.append(msg)


def validate_result(
    result: FinalInvestigationResult,
    bank: BankData,
    cfg: dict[str, Any],
    trigger_transaction_id: str,
) -> GroundingReport:
    """Check a FinalInvestigationResult against the deterministic ground truth."""
    report = GroundingReport()

    # 1. schema-level validity
    try:
        result.validate()
    except Exception as exc:  # noqa: BLE001
        report.add(f"schema: {exc}")

    # 2. recommendation + level enums
    if result.recommendation not in Recommendation.ALL:
        report.add(f"recommendation not in enum: {result.recommendation}")
    if result.risk_level not in RiskLevel.ALL:
        report.add(f"risk_level not in enum: {result.risk_level}")

    # 3. every finding references known evidence IDs
    evidence_ids = {e["evidence_id"] for e in result.evidence}
    for f in result.findings:
        for ref in f.get("evidence_refs", []):
            if ref not in evidence_ids:
                report.add(f"finding references unknown evidence {ref}: {f.get('statement')!r}")
        if not f.get("evidence_refs"):
            report.add(f"ungrounded finding: {f.get('statement')!r}")

    # 4. the reported risk score/level must equal the recomputed deterministic value
    #    (this is the core "LLM didn't invent the number" check)
    if result.status != "FAILED":
        feats = extract_features(trigger_transaction_id, bank, cfg)
        pat = classify(trigger_transaction_id, bank)
        pat_dict = {"detected": pat.detected, "pattern": pat.pattern,
                    "confidence": pat.confidence, "note": pat.note,
                    "severity": pattern_severity(pat.pattern)}
        recomputed = compute_risk_score(feats, cfg, pattern=pat_dict)
        if abs(recomputed.score - result.risk_score) > 1e-6:
            report.add(
                f"risk_score mismatch: result={result.risk_score} "
                f"recomputed={recomputed.score}"
            )
        if recomputed.level != result.risk_level:
            report.add(
                f"risk_level mismatch: result={result.risk_level} "
                f"recomputed={recomputed.level}"
            )
        # observed pattern must match the deterministic classifier
        if result.observed_pattern != pat.pattern:
            report.add(
                f"observed_pattern mismatch: result={result.observed_pattern} "
                f"deterministic={pat.pattern}"
            )

    # 5. numeric claims inside evidence must be internally consistent
    #    (e.g. amount_deviation ratio == trigger/avg)
    for e in result.evidence:
        ev = e.get("value", {})
        if e.get("type") == "AMOUNT_DEVIATION" and isinstance(ev, dict):
            avg = ev.get("historical_avg_outgoing")
            amt = ev.get("trigger_amount")
            ratio = ev.get("ratio")
            if avg and amt and ratio is not None:
                if abs((amt / avg) - ratio) > 0.05:
                    report.add(
                        f"{e['evidence_id']} ratio claim {ratio} != {amt}/{avg}"
                    )

    return report
