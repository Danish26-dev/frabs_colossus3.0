"""Agent output schemas (Phase 1).

Every agent produces a structured, validated object — never free text that the
next stage has to parse loosely. These schemas are the contract between agents
and the backbone the evidence-grounding validator checks against.

Enums are plain string constants (kept simple for JSON).
Each dataclass provides:
  * to_dict() — JSON-serializable output
  * validate() — raises SchemaError on structural violations
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


class SchemaError(ValueError):
    """Raised when an agent output violates its schema."""


# --- enums -----------------------------------------------------------------

class Recommendation:
    CLOSE = "CLOSE"
    MONITOR = "MONITOR"
    ESCALATE = "ESCALATE"
    BLOCK = "BLOCK"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    ALL = {CLOSE, MONITOR, ESCALATE, BLOCK, INSUFFICIENT_EVIDENCE}


class InvestigationTier:
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    ALL = {LOW, MEDIUM, HIGH}


class InvestigationStatus:
    COMPLETE = "COMPLETE"
    PARTIAL = "PARTIAL"
    FAILED = "FAILED"
    ALL = {COMPLETE, PARTIAL, FAILED}


class RiskLevel:
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    ALL = {LOW, MEDIUM, HIGH}


# --- evidence --------------------------------------------------------------

@dataclass
class Evidence:
    """A single, traceable piece of evidence produced by Detective.

    `value` is the deterministic fact (a number, a count, a label). `source` is
    the tool/collection it came from. Findings reference evidence by `evidence_id`.
    """

    evidence_id: str            # e.g. "E-001"
    type: str                   # e.g. "AMOUNT_DEVIATION", "NEW_BENEFICIARY"
    description: str
    value: Any
    source: str                 # e.g. "behavior_baseline", "beneficiary_history"
    data_reference: str = ""    # e.g. a transaction_id or beneficiary_id

    def to_dict(self) -> dict[str, Any]:
        return {
            "evidence_id": self.evidence_id,
            "type": self.type,
            "description": self.description,
            "value": self.value,
            "source": self.source,
            "data_reference": self.data_reference,
        }

    def validate(self) -> None:
        if not self.evidence_id or not self.evidence_id.startswith("E-"):
            raise SchemaError(f"Bad evidence_id: {self.evidence_id!r}")
        if not self.type or not self.description:
            raise SchemaError(f"Evidence {self.evidence_id} missing type/description")


@dataclass
class Finding:
    """A conclusion that MUST reference one or more evidence IDs."""

    statement: str
    evidence_refs: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"statement": self.statement, "evidence_refs": list(self.evidence_refs)}

    def validate(self) -> None:
        if not self.statement:
            raise SchemaError("Finding has empty statement")
        if not self.evidence_refs:
            raise SchemaError(f"Finding not grounded in evidence: {self.statement!r}")


# --- per-agent outputs -----------------------------------------------------

@dataclass
class WatchmanOutput:
    triage: str                     # e.g. REQUIRES_CONTEXTUAL_INVESTIGATION
    investigation_tier: str         # InvestigationTier
    investigation_depth: str        # "LIGHT" | "FULL"
    reasons: list[str] = field(default_factory=list)
    risk_score: float = 0.0
    investigation_required: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "triage": self.triage,
            "investigation_tier": self.investigation_tier,
            "investigation_depth": self.investigation_depth,
            "reasons": list(self.reasons),
            "risk_score": round(self.risk_score, 4),
            "investigation_required": self.investigation_required,
        }

    def validate(self) -> None:
        if self.investigation_tier not in InvestigationTier.ALL:
            raise SchemaError(f"Bad tier: {self.investigation_tier}")
        if self.investigation_depth not in {"LIGHT", "FULL"}:
            raise SchemaError(f"Bad depth: {self.investigation_depth}")
        if not 0.0 <= self.risk_score <= 1.0:
            raise SchemaError(f"risk_score out of range: {self.risk_score}")


@dataclass
class DetectiveOutput:
    evidence: list[Evidence] = field(default_factory=list)
    findings: list[Finding] = field(default_factory=list)
    observed_pattern: str = "NONE"
    pattern_confidence: float = 0.0
    network: dict[str, Any] = field(default_factory=dict)
    narrative: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "evidence": [e.to_dict() for e in self.evidence],
            "findings": [f.to_dict() for f in self.findings],
            "observed_pattern": self.observed_pattern,
            "pattern_confidence": round(self.pattern_confidence, 4),
            "network": self.network,
            "narrative": self.narrative,
        }

    def evidence_ids(self) -> set[str]:
        return {e.evidence_id for e in self.evidence}

    def validate(self) -> None:
        ids = set()
        for e in self.evidence:
            e.validate()
            if e.evidence_id in ids:
                raise SchemaError(f"Duplicate evidence_id: {e.evidence_id}")
            ids.add(e.evidence_id)
        for f in self.findings:
            f.validate()
            for ref in f.evidence_refs:
                if ref not in ids:
                    raise SchemaError(
                        f"Finding references unknown evidence {ref}: {f.statement!r}"
                    )


@dataclass
class RegulatoryContext:
    source: str                 # e.g. "PMLA", "RBI Master Direction on KYC"
    reference: str              # section/provision label from the corpus
    excerpt: str                # retrieved text (from corpus, not invented)
    relevance: str              # why this evidence maps here

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "reference": self.reference,
            "excerpt": self.excerpt,
            "relevance": self.relevance,
        }


@dataclass
class JuristOutput:
    observed_pattern: str                       # echoed input, not classified here
    regulatory_context: list[RegulatoryContext] = field(default_factory=list)
    risk_relevance: str = ""
    evidence_refs: list[str] = field(default_factory=list)
    available: bool = True                      # False if retrieval failed

    def to_dict(self) -> dict[str, Any]:
        return {
            "observed_pattern": self.observed_pattern,
            "regulatory_context": [r.to_dict() for r in self.regulatory_context],
            "risk_relevance": self.risk_relevance,
            "evidence_refs": list(self.evidence_refs),
            "available": self.available,
        }

    def validate(self) -> None:
        # Jurist may legitimately return empty context (pattern NONE / no match),
        # but if it claims context it must cite a source + reference.
        for r in self.regulatory_context:
            if not r.source or not r.reference:
                raise SchemaError("Regulatory context missing source/reference")


@dataclass
class ScribeOutput:
    case_summary: str
    sections: dict[str, Any] = field(default_factory=dict)
    recommendation: str = Recommendation.INSUFFICIENT_EVIDENCE
    recommendation_reason: str = ""
    evidence_refs: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "case_summary": self.case_summary,
            "sections": self.sections,
            "recommendation": self.recommendation,
            "recommendation_reason": self.recommendation_reason,
            "evidence_refs": list(self.evidence_refs),
        }

    def validate(self) -> None:
        if self.recommendation not in Recommendation.ALL:
            raise SchemaError(f"Bad recommendation: {self.recommendation}")


@dataclass
class FinalInvestigationResult:
    """The single structured object returned to the backend."""

    case_id: str
    status: str = InvestigationStatus.COMPLETE
    investigation_tier: str = InvestigationTier.HIGH
    risk_score: float = 0.0
    risk_level: str = RiskLevel.LOW
    risk_components: dict[str, Any] = field(default_factory=dict)
    critical_signals: list[dict[str, Any]] = field(default_factory=list)
    observed_pattern: str = "NONE"
    recommendation: str = Recommendation.INSUFFICIENT_EVIDENCE
    recommendation_reason: str = ""
    evidence: list[dict[str, Any]] = field(default_factory=list)
    findings: list[dict[str, Any]] = field(default_factory=list)
    regulatory_context: list[dict[str, Any]] = field(default_factory=list)
    network: dict[str, Any] = field(default_factory=dict)
    case_file: dict[str, Any] = field(default_factory=dict)
    completed_stages: list[str] = field(default_factory=list)
    failed_stages: list[str] = field(default_factory=list)
    agent_trace: list[dict[str, Any]] = field(default_factory=list)
    timeline: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "case_id": self.case_id,
            "status": self.status,
            "investigation_tier": self.investigation_tier,
            "risk": {
                "score": round(self.risk_score, 4),
                "level": self.risk_level,
                "components": self.risk_components,
                "critical_signals": self.critical_signals,
            },
            "observed_pattern": self.observed_pattern,
            "recommendation": {
                "action": self.recommendation,
                "reason": self.recommendation_reason,
            },
            "evidence": self.evidence,
            "findings": self.findings,
            "regulatory_context": self.regulatory_context,
            "network": self.network,
            "case_file": self.case_file,
            "completed_stages": self.completed_stages,
            "failed_stages": self.failed_stages,
            "agent_trace": self.agent_trace,
            "timeline": self.timeline,
        }

    def validate(self) -> None:
        if self.status not in InvestigationStatus.ALL:
            raise SchemaError(f"Bad status: {self.status}")
        if self.recommendation not in Recommendation.ALL:
            raise SchemaError(f"Bad recommendation: {self.recommendation}")
        if self.risk_level not in RiskLevel.ALL:
            raise SchemaError(f"Bad risk_level: {self.risk_level}")
        if self.investigation_tier not in InvestigationTier.ALL:
            raise SchemaError(f"Bad tier: {self.investigation_tier}")
