"""Autonomous agentic investigation loop (SH-FIN-01: "autonomous ... agent").

This is the genuinely agentic layer. Instead of a hardcoded Watchman -> Detective
-> Jurist -> Scribe sequence, the LLM drives the investigation:

    reason -> select a tool -> observe the (deterministic) result -> adapt -> ...
    -> conclude with a proposed recommendation

Design contract ("combine" / mode B):
  * The LLM DECIDES what to investigate next and PROPOSES the recommendation
    with justification. This is the autonomy.
  * The TOOLS compute every number deterministically. The LLM never produces a
    figure — it reasons over figures the tools return. This is the auditability.
  * The deterministic risk score is computed independently and shown alongside
    the LLM's proposal as a CROSS-CHECK. If they disagree, it is flagged (a
    trust feature, not a failure).

This module defines the tool catalog the LLM chooses from and the action schema
it emits each step. The loop itself lives in AgenticInvestigator (agentic.py).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolSpec:
    """A tool the agent can choose to call, described for the LLM."""

    name: str
    purpose: str
    args: dict[str, str]  # arg_name -> description


# The catalog the LLM sees. Each maps to a ToolLayer method. Descriptions are
# written for the model to reason about WHEN to use each.
TOOL_CATALOG: list[ToolSpec] = [
    ToolSpec(
        "get_customer_profile",
        "Basic customer identity, account type, status, balance. Use first to "
        "understand who the customer is.",
        {"customer_id": "the customer under investigation"},
    ),
    ToolSpec(
        "get_kyc_profile",
        "KYC/CDD profile: risk category, occupation, declared income band, PEP "
        "status. Use to check if the transaction fits the customer's declared profile.",
        {"customer_id": "the customer under investigation"},
    ),
    ToolSpec(
        "get_behavior_baseline",
        "The customer's historical outgoing behaviour (avg/median/max, count), "
        "computed from history EXCLUDING the trigger. Use to judge how unusual "
        "the current transaction is.",
        {"customer_id": "the customer", "before": "trigger event_time (ISO)",
         "exclude_transaction_id": "the trigger txn id"},
    ),
    ToolSpec(
        "compute_features",
        "All deterministic risk features for the trigger (amount deviation, "
        "velocity, beneficiary novelty, behaviour deviation, network fan-in), "
        "each 0..1 with the raw evidence. The core measurement tool.",
        {"transaction_id": "the trigger txn id"},
    ),
    ToolSpec(
        "get_beneficiary_relationship",
        "Whether the destination is a new or established beneficiary for this "
        "customer. Use to test the 'new beneficiary' signal.",
        {"customer_id": "the customer", "beneficiary_id": "the destination id"},
    ),
    ToolSpec(
        "trace_account_network",
        "Fan-in trace: which distinct customers sent funds to the trigger's "
        "destination in a window (mule-collection signal) + graph nodes/edges. "
        "Use when the destination might be a collection/mule account.",
        {"transaction_id": "the trigger txn id"},
    ),
    ToolSpec(
        "detect_pattern",
        "Deterministic named-pattern classifier (STRUCTURING, MULE_COLLECTION, "
        "VELOCITY_BURST, REPEATED_CASHOUT). Use to name the financial-crime "
        "pattern the evidence fits.",
        {"transaction_id": "the trigger txn id"},
    ),
]

TOOL_NAMES = {t.name for t in TOOL_CATALOG}


def catalog_for_prompt() -> str:
    """Render the tool catalog as text for the LLM system prompt."""
    lines = []
    for t in TOOL_CATALOG:
        args = ", ".join(f"{k} ({v})" for k, v in t.args.items()) or "none"
        lines.append(f"- {t.name}: {t.purpose}\n    args: {args}")
    return "\n".join(lines)


# --- agent action schema (what the LLM emits each step) --------------------

CONCLUDE = "conclude"


@dataclass
class AgentAction:
    """One step the LLM decides on: either call a tool, or conclude."""

    reasoning: str                       # why this step (shown in the trace)
    action: str                          # a tool name, or CONCLUDE
    args: dict[str, Any] = field(default_factory=dict)
    # only when action == CONCLUDE:
    recommendation: str = ""             # proposed CLOSE/MONITOR/ESCALATE/BLOCK/INSUFFICIENT_EVIDENCE
    justification: str = ""

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "AgentAction":
        return cls(
            reasoning=str(d.get("reasoning", "")),
            action=str(d.get("action", "")),
            args=d.get("args") or {},
            recommendation=str(d.get("recommendation", "")),
            justification=str(d.get("justification", "")),
        )

    def is_conclude(self) -> bool:
        return self.action == CONCLUDE

    def validate(self) -> None:
        from .schemas import Recommendation, SchemaError
        if self.action == CONCLUDE:
            if self.recommendation not in Recommendation.ALL:
                raise SchemaError(f"conclude with bad recommendation: {self.recommendation!r}")
        elif self.action not in TOOL_NAMES:
            raise SchemaError(f"unknown tool/action: {self.action!r}")
