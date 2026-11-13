"""AgenticInvestigator — the autonomous reason->act->observe->adapt loop.

The LLM drives the investigation: it decides which tool to call next based on
what it has seen, and finally proposes a recommendation with justification. Every
number comes from a deterministic tool. After the loop, the deterministic risk
score is computed INDEPENDENTLY and attached as a cross-check; if the LLM's
proposed recommendation disagrees with what the deterministic score implies, the
disagreement is flagged (not silently overridden).

Outputs the same evidence / findings / result structures as the fixed pipeline,
so the Supervisor can use either interchangeably and the grounding validator
applies unchanged.
"""

from __future__ import annotations

import json
from typing import Any, Callable

from .agent_loop import CONCLUDE, TOOL_CATALOG, AgentAction, catalog_for_prompt
from .llm import LLMClient, LLMError, LLMProviderError, extract_json
from .patterns import pattern_severity
from .schemas import (
    DetectiveOutput,
    Evidence,
    Finding,
    Recommendation,
    SchemaError,
)
from .scoring import RiskScore, compute_risk_score
from .tools import ToolLayer

_SYSTEM = """You are the Detective agent in FRAB, an autonomous financial-crime \
investigation system. You investigate ONE bank alert by choosing tools to gather \
evidence, then you conclude with a recommendation.

RULES:
- You NEVER invent numbers. All figures come from tool results you have received.
- Each step, respond with ONE JSON object and nothing else:
  {"reasoning": "...", "action": "<tool_name>", "args": {...}}
  or to finish:
  {"reasoning": "...", "action": "conclude", "recommendation": "<REC>", "justification": "..."}
- <REC> is one of: CLOSE, MONITOR, ESCALATE, BLOCK, INSUFFICIENT_EVIDENCE.
- Investigate efficiently: gather the evidence you need, then conclude. Do not
  repeat a tool you have already called with the same args.

Available tools:
{catalog}
"""


class AgenticInvestigator:
    def __init__(self, tools: ToolLayer, cfg: dict[str, Any], llm: LLMClient,
                 *, max_steps: int = 8,
                 event_emit: Callable[[str, str, dict], None] | None = None) -> None:
        self.tools = tools
        self.cfg = cfg
        self.llm = llm
        self.max_steps = max_steps
        self._emit = event_emit or (lambda event, agent, meta: None)
        # Set when the inference provider fails (auth, balance, 503, rate limit,
        # timeout...). After that the loop makes NO further model calls (so a
        # failing or metered provider is not hit again) and the failure is
        # reported in the case file and as an LLM_ERROR event.
        self.llm_error: dict[str, Any] | None = None
        self._llm_disabled = False

    # --- tool dispatch (deterministic) -------------------------------------

    def _run_tool(self, action: str, args: dict[str, Any]) -> dict[str, Any]:
        fn = getattr(self.tools, action, None)
        if fn is None:
            return {"error": f"unknown tool {action}"}
        try:
            return fn(**args)
        except TypeError:
            # tolerate the LLM passing slightly wrong arg names — try positional
            # common cases based on the trigger
            return {"error": f"bad args for {action}: {args}"}

    # --- main loop ---------------------------------------------------------

    def investigate(self, trigger_transaction_id: str) -> tuple[DetectiveOutput, RiskScore, dict]:
        trigger = self.tools.get_transaction(trigger_transaction_id)
        if not trigger.get("found", True) and "customer_id" not in trigger:
            raise KeyError(f"trigger {trigger_transaction_id} not found")
        customer_id = trigger["customer_id"]

        system = _SYSTEM.replace("{catalog}", catalog_for_prompt())
        transcript: list[dict[str, Any]] = []
        tool_results: dict[str, Any] = {}
        proposed_rec = ""
        proposed_just = ""

        context = {
            "alert_transaction": trigger,
            "customer_id": customer_id,
            "evidence_gathered": tool_results,
        }

        for step in range(self.max_steps):
            action = self._next_action(system, context, transcript)
            self._emit("AGENT_REASONING", "DETECTIVE",
                       {"step": step + 1, "reasoning": action.reasoning,
                        "action": action.action})

            if action.is_conclude():
                proposed_rec = action.recommendation
                proposed_just = action.justification
                transcript.append({"reasoning": action.reasoning, "action": "conclude",
                                    "recommendation": proposed_rec})
                break

            self._emit("TOOL_SELECTED", "DETECTIVE",
                       {"tool": action.action, "args": action.args})
            result = self._run_tool(action.action, action.args)
            tool_results[action.action] = result
            transcript.append({"reasoning": action.reasoning, "action": action.action,
                               "args": action.args, "result_keys": list(result)[:6]})

        # --- deterministic ground truth (independent of the LLM) -----------
        from .features import extract_features
        feats = extract_features(trigger_transaction_id, self.tools.bank, self.cfg)
        pattern = self.tools.detect_pattern(trigger_transaction_id)
        pattern["severity"] = pattern_severity(pattern.get("pattern", "NONE"))
        risk = compute_risk_score(feats, self.cfg, pattern=pattern)

        # build structured evidence from the deterministic features (ground truth),
        # regardless of which tools the LLM happened to call — the case file must
        # be complete and verifiable.
        detective = self._build_detective_output(
            trigger_transaction_id, trigger, feats, pattern, transcript
        )

        # cross-check: does the LLM's proposal agree with the deterministic score?
        crosscheck = self._crosscheck(proposed_rec, risk)

        agentic_meta = {
            "mode": "agentic",
            "steps": len([t for t in transcript if t.get("action") != "conclude"]),
            "transcript": transcript,
            "llm_proposed_recommendation": proposed_rec,
            "llm_justification": proposed_just,
            "deterministic_crosscheck": crosscheck,
            # additive: which provider/model ran and what it cost (metadata only)
            "llm": self._llm_info(),
        }
        if self.llm_error:
            agentic_meta["llm_error"] = self.llm_error
        return detective, risk, agentic_meta

    def _llm_info(self) -> dict[str, Any]:
        info: dict[str, Any] = {
            "provider": getattr(self.llm, "name", ""),
            "model": getattr(self.llm, "model", None),
        }
        usage = getattr(self.llm, "usage_summary", None)
        if callable(usage):
            info["usage"] = usage()
        return info

    # --- LLM step ----------------------------------------------------------

    def _next_action(self, system: str, context: dict, transcript: list) -> AgentAction:
        prompt = (
            "Investigation so far:\n"
            + json.dumps({"context": _slim(context), "steps": transcript}, default=str)[:6000]
            + "\n\nDecide the next step. Respond with ONE JSON object."
        )
        if not self._llm_disabled:
            try:
                raw = self.llm.complete(prompt, system=system, temperature=0.0)
                action = AgentAction.from_dict(extract_json(raw))
                action.validate()
                return action
            except LLMProviderError as exc:
                # the provider itself failed: stop calling it, say so loudly,
                # and let the deterministic path finish the case
                self._llm_disabled = True
                self.llm_error = exc.to_dict()
                self._emit("LLM_ERROR", "DETECTIVE", dict(self.llm_error))
            except (LLMError, SchemaError, ValueError):
                # offline client / malformed model output -> fall through to the
                # deterministic fallback action below
                pass
        # deterministic fallback action:
        # run compute_features if not yet done, else conclude by score.
        if "compute_features" not in context["evidence_gathered"]:
            return AgentAction(
                reasoning="(fallback) gather deterministic features first",
                action="compute_features",
                args={"transaction_id": context["alert_transaction"]["transaction_id"]},
            )
        return AgentAction(reasoning="(fallback) conclude from evidence",
                           action=CONCLUDE,
                           recommendation=Recommendation.INSUFFICIENT_EVIDENCE,
                           justification="Fallback conclusion.")

    # --- build the verifiable case from deterministic ground truth ---------

    def _build_detective_output(self, tx_id, trigger, feats, pattern, transcript) -> DetectiveOutput:
        evidence: list[Evidence] = []
        findings: list[Finding] = []
        n = 0

        def add(t, desc, val, src, ref=""):
            nonlocal n
            n += 1
            eid = f"E-{n:03d}"
            evidence.append(Evidence(eid, t, desc, val, src, ref))
            return eid

        ad = feats["amount_deviation"]
        e_amt = add("AMOUNT_DEVIATION", ad.note, ad.evidence, "behavior_baseline", tx_id)
        bd = feats["behaviour_deviation"]
        e_beh = add("BEHAVIOUR_DEVIATION", bd.note, bd.evidence, "behavior_baseline", tx_id)
        if ad.value >= 0.5 or bd.value >= 0.5:
            findings.append(Finding(
                "Transaction is materially larger than the customer's established "
                "outgoing behaviour.", [e_amt, e_beh]))

        bn = feats["beneficiary_novelty"]
        e_ben = add("BENEFICIARY_NOVELTY", bn.note, bn.evidence, "beneficiary_history",
                    trigger["nameDest"])
        if bn.value >= 1.0:
            findings.append(Finding(
                "Funds sent to a beneficiary with no established relationship.", [e_ben]))
        elif bn.evidence.get("prior_transactions_to_dest", 0) >= 1:
            findings.append(Finding(
                "Beneficiary is established with prior transfers — consistent with "
                "existing behaviour.", [e_ben]))

        vel = feats["velocity"]
        e_vel = add("VELOCITY", vel.note, vel.evidence, "transaction_history",
                    trigger["customer_id"])
        if vel.value >= 0.5:
            findings.append(Finding("Elevated transaction velocity around the trigger.",
                                    [e_vel]))

        network = self.tools.trace_account_network(tx_id)
        nr = feats["network_risk"]
        e_net = add("NETWORK_FAN_IN", nr.note, nr.evidence, "counterparty_network",
                    trigger["nameDest"])
        if nr.value >= 0.6:
            findings.append(Finding(
                "Multiple unrelated senders converge on the destination account "
                "(mule-collection indicator).", [e_net]))

        narrative = " ".join(f.statement for f in findings) or \
            "No material findings beyond the original alert trigger."

        out = DetectiveOutput(
            evidence=evidence, findings=findings,
            observed_pattern=pattern["pattern"], pattern_confidence=pattern["confidence"],
            network=network, narrative=narrative,
        )
        out.validate()
        return out

    @staticmethod
    def _crosscheck(proposed_rec: str, risk: RiskScore) -> dict[str, Any]:
        """Compare the LLM's proposed recommendation with what the deterministic
        risk level implies. Flag disagreement — this is a trust feature."""
        level_to_rec = {"HIGH": "ESCALATE", "MEDIUM": "MONITOR", "LOW": "CLOSE"}
        deterministic_rec = level_to_rec.get(risk.level, "INSUFFICIENT_EVIDENCE")
        agree = (proposed_rec == deterministic_rec) if proposed_rec else None
        return {
            "deterministic_risk_level": risk.level,
            "deterministic_risk_score": round(risk.score, 4),
            "deterministic_implied_recommendation": deterministic_rec,
            "llm_proposed_recommendation": proposed_rec or None,
            "agree": agree,
        }


def _slim(context: dict) -> dict:
    """Trim the alert transaction to the fields the LLM needs (drop internals)."""
    t = context["alert_transaction"]
    return {
        "customer_id": context["customer_id"],
        "alert_transaction": {
            "transaction_id": t.get("transaction_id"),
            "type": t.get("type"),
            "amount": t.get("amount"),
            "nameDest": t.get("nameDest"),
            "destination_type": t.get("destination_type"),
            "event_time": t.get("event_time"),
        },
        "evidence_gathered": list(context["evidence_gathered"].keys()),
    }
