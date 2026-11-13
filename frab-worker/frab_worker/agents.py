"""The specialist agents (Phase 1).

Each agent has a distinct responsibility, consumes structured input, and returns
a validated schema object. The same model can back several agents; the
differentiation is role + tools + data access + output schema, not the model.

Design principle (the governing rule): the deterministic layer (tools, features,
scoring, patterns) is the SOURCE OF TRUTH. Agents call tools to get facts, then
the LLM only narrates/phrases those facts. In offline mode the narration is
assembled deterministically, so behaviour is identical with or without a model.

Agents here:
  Watchman  — triage + investigation-tier routing (from deterministic features)
  Detective — evidence acquisition + pattern classification + network trace
  Jurist    — regulatory-context retrieval (retrieval-only, never classifies)
  Scribe    — audit-ready synthesis + final recommendation
"""

from __future__ import annotations

import os
from typing import Any

import yaml

from .llm import LLMClient
from .schemas import (
    DetectiveOutput,
    Evidence,
    Finding,
    InvestigationTier,
    JuristOutput,
    Recommendation,
    RegulatoryContext,
    ScribeOutput,
    WatchmanOutput,
)
from .scoring import RiskScore, compute_risk_score
from .patterns import pattern_severity
from .tools import ToolLayer


# --------------------------------------------------------------------------
# Watchman
# --------------------------------------------------------------------------

class Watchman:
    """Validates the alert and decides how deep to investigate.

    Tier is derived from the DETERMINISTIC risk score + critical signals, not
    LLM judgement. LOW/MEDIUM -> light path; HIGH -> full path.
    """

    def __init__(self, tools: ToolLayer, cfg: dict[str, Any]) -> None:
        self.tools = tools
        self.cfg = cfg

    def run(self, trigger_transaction_id: str, *, prior_alert_count: int = 0) -> tuple[WatchmanOutput, RiskScore]:
        from .features import extract_features

        feats = extract_features(
            trigger_transaction_id, self.tools.bank, self.cfg,
            prior_alert_count=prior_alert_count,
        )
        pattern = self.tools.detect_pattern(trigger_transaction_id)
        pattern["severity"] = pattern_severity(pattern.get("pattern", "NONE"))
        risk = compute_risk_score(feats, self.cfg, pattern=pattern)

        reasons = [c.name for c in risk.components if c.value >= 0.5]
        if pattern.get("detected"):
            reasons.append("pattern:" + pattern["pattern"])

        tier = risk.level  # LOW/MEDIUM/HIGH aligns with tier
        depth = "FULL" if tier == InvestigationTier.HIGH else "LIGHT"

        out = WatchmanOutput(
            triage="REQUIRES_CONTEXTUAL_INVESTIGATION" if tier != "LOW" else "LOW_RISK_CONTEXTUAL_CHECK",
            investigation_tier=tier,
            investigation_depth=depth,
            reasons=reasons,
            risk_score=risk.score,
            investigation_required=True,
        )
        out.validate()
        return out, risk


# --------------------------------------------------------------------------
# Detective
# --------------------------------------------------------------------------

class Detective:
    """Acquires evidence from the bank via tools and classifies the pattern.

    Produces structured Evidence objects (each traceable to a tool result) and
    Findings that reference those evidence IDs. Owns pattern classification;
    Jurist only consumes the label.
    """

    def __init__(self, tools: ToolLayer, cfg: dict[str, Any]) -> None:
        self.tools = tools
        self.cfg = cfg

    def run(self, trigger_transaction_id: str, *, depth: str = "FULL") -> DetectiveOutput:
        trigger = self.tools.get_transaction(trigger_transaction_id)
        customer_id = trigger["customer_id"]
        before = trigger["event_time"]

        features = self.tools.compute_features(trigger_transaction_id)
        baseline = self.tools.get_behavior_baseline(
            customer_id, before=before, exclude_transaction_id=trigger_transaction_id
        )
        bene = self.tools.get_beneficiary_relationship(customer_id, trigger["nameDest"])
        pattern = self.tools.detect_pattern(trigger_transaction_id)

        evidence: list[Evidence] = []
        findings: list[Finding] = []
        n = 0

        def add(ev_type, desc, value, source, ref=""):
            nonlocal n
            n += 1
            eid = f"E-{n:03d}"
            evidence.append(Evidence(eid, ev_type, desc, value, source, ref))
            return eid

        # amount / behaviour evidence
        ad = features["amount_deviation"]
        e_amt = add("AMOUNT_DEVIATION", ad["note"], ad["evidence"], "behavior_baseline",
                    trigger_transaction_id)
        bd = features["behaviour_deviation"]
        e_beh = add("BEHAVIOUR_DEVIATION", bd["note"], bd["evidence"], "behavior_baseline",
                    trigger_transaction_id)
        if ad["value"] >= 0.5 or bd["value"] >= 0.5:
            findings.append(Finding(
                "Transaction is materially larger than the customer's established "
                "outgoing behaviour.", [e_amt, e_beh]))

        # beneficiary evidence
        bn = features["beneficiary_novelty"]
        e_ben = add("BENEFICIARY_NOVELTY", bn["note"], bn["evidence"],
                    "beneficiary_history", trigger["nameDest"])
        if bn["value"] >= 1.0:
            findings.append(Finding(
                "Funds sent to a beneficiary with no established relationship.",
                [e_ben]))
        elif bn["evidence"].get("prior_transactions_to_dest", 0) >= 1:
            findings.append(Finding(
                "Beneficiary is established with prior transfers — consistent "
                "with existing behaviour.", [e_ben]))

        # velocity evidence
        vel = features["velocity"]
        e_vel = add("VELOCITY", vel["note"], vel["evidence"], "transaction_history",
                    customer_id)
        if vel["value"] >= 0.5:
            findings.append(Finding(
                "Elevated transaction velocity around the trigger.", [e_vel]))

        # network evidence (full depth only)
        # Always build the money-trace graph (cheap deterministic data) so every
        # case renders a meaningful "Trace the Money" view. Only emit the fan-in
        # EVIDENCE/finding on the full path where the mule signal matters.
        network = self.tools.trace_account_network(trigger_transaction_id)
        if depth == "FULL":
            nr = features["network_risk"]
            e_net = add("NETWORK_FAN_IN", nr["note"], nr["evidence"],
                        "counterparty_network", trigger["nameDest"])
            if nr["value"] >= 0.6:
                findings.append(Finding(
                    "Multiple unrelated senders converge on the destination "
                    "account (mule-collection indicator).", [e_net]))

        out = DetectiveOutput(
            evidence=evidence,
            findings=findings,
            observed_pattern=pattern["pattern"],
            pattern_confidence=pattern["confidence"],
            network=network,
            narrative=self._narrate(findings),
        )
        out.validate()
        return out

    @staticmethod
    def _narrate(findings: list[Finding]) -> str:
        if not findings:
            return "No material findings beyond the original alert trigger."
        return " ".join(f.statement for f in findings)


# --------------------------------------------------------------------------
# Jurist
# --------------------------------------------------------------------------

class Jurist:
    """Retrieves regulatory context for the OBSERVED pattern. Retrieval-only:
    it never classifies the pattern and never cites anything outside the corpus.
    """

    def __init__(self, corpus_path: str | None = None) -> None:
        self.corpus = self._load_corpus(corpus_path)

    @staticmethod
    def _load_corpus(path: str | None) -> dict[str, Any]:
        if path is None:
            here = os.path.dirname(os.path.abspath(__file__))
            path = os.path.normpath(os.path.join(here, "..", "config", "regulatory_corpus.yaml"))
        with open(path, encoding="utf-8") as fh:
            return yaml.safe_load(fh) or {}

    def run(self, observed_pattern: str, detective: DetectiveOutput,
            *, alert_type: str | None = None) -> JuristOutput:
        # look up by observed pattern first, then fall back to alert_type
        entries = self.corpus.get(observed_pattern)
        if not entries and alert_type:
            entries = self.corpus.get(alert_type)

        ctx: list[RegulatoryContext] = []
        for item in (entries or []):
            ctx.append(RegulatoryContext(
                source=item["source"],
                reference=item["reference"],
                excerpt=item["excerpt"].strip(),
                relevance=item["relevance"].strip(),
            ))

        relevance = ""
        if ctx:
            relevance = (f"The observed pattern '{observed_pattern}' maps to "
                         f"{len(ctx)} regulatory reference(s).")
        elif observed_pattern == "NONE":
            relevance = "No named financial-crime pattern; general due diligence applies."

        out = JuristOutput(
            observed_pattern=observed_pattern,
            regulatory_context=ctx,
            risk_relevance=relevance,
            evidence_refs=[f.evidence_refs[0] for f in detective.findings if f.evidence_refs],
            available=True,
        )
        out.validate()
        return out


# --------------------------------------------------------------------------
# Scribe
# --------------------------------------------------------------------------

class Scribe:
    """Synthesises the audit-ready case and derives the final recommendation.

    The recommendation is a DETERMINISTIC function of the risk level, observed
    pattern, and evidence sufficiency — the LLM only phrases the narrative.
    """

    def __init__(self, cfg: dict[str, Any]) -> None:
        self.cfg = cfg

    def run(
        self,
        case_id: str,
        watchman: WatchmanOutput,
        detective: DetectiveOutput,
        jurist: JuristOutput,
        risk: RiskScore,
        *,
        jurist_available: bool = True,
    ) -> ScribeOutput:
        recommendation, reason = self._recommend(
            risk, detective, jurist_available
        )

        sections = {
            "customer_context": watchman.to_dict(),
            "evidence": [e.to_dict() for e in detective.evidence],
            "findings": [f.to_dict() for f in detective.findings],
            "observed_pattern": detective.observed_pattern,
            "network": detective.network,
            "regulatory_context": [r.to_dict() for r in jurist.regulatory_context],
            "risk": risk.to_dict(),
        }
        summary = (
            f"Investigation of alert {case_id}: risk {risk.level} "
            f"(score {risk.score:.2f}), pattern {detective.observed_pattern}. "
            f"{detective.narrative}"
        )

        out = ScribeOutput(
            case_summary=summary,
            sections=sections,
            recommendation=recommendation,
            recommendation_reason=reason,
            evidence_refs=[e.evidence_id for e in detective.evidence],
        )
        out.validate()
        return out

    def _recommend(
        self, risk: RiskScore, detective: DetectiveOutput, jurist_available: bool
    ) -> tuple[str, str]:
        has_evidence = bool(detective.findings)

        # Insufficient evidence: nothing material found — defer to human.
        if not has_evidence and risk.level == "LOW":
            return (Recommendation.MONITOR,
                    "No material findings; low risk. Routine monitoring.")
        if not has_evidence:
            return (Recommendation.INSUFFICIENT_EVIDENCE,
                    "Signals are ambiguous and evidence is insufficient for a "
                    "confident disposition; manual review required.")

        # If regulatory context was needed (HIGH) but unavailable, be honest.
        if risk.level == "HIGH" and not jurist_available:
            return (Recommendation.INSUFFICIENT_EVIDENCE,
                    "Strong risk indicators present but regulatory context could "
                    "not be retrieved; manual review required.")

        if risk.level == "HIGH":
            return (Recommendation.ESCALATE,
                    f"High risk with {detective.observed_pattern} pattern and "
                    f"grounded evidence; escalate for STR consideration.")
        if risk.level == "MEDIUM":
            return (Recommendation.MONITOR,
                    "Medium risk with supporting evidence; monitor and confirm.")
        return (Recommendation.CLOSE,
                "Low risk; evidence consistent with established customer "
                "behaviour. Recommend close as likely false positive.")
