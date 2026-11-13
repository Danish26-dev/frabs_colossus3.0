"""Agentic loop tests using a scripted mock LLM.

The mock plays the role of Gemma: it emits AgentAction JSON deciding which tool
to call, then concludes. This proves the autonomous reason->act->observe->adapt
loop works end-to-end WITHOUT a real model, and that:
  * numbers still come from deterministic tools,
  * the deterministic risk score is attached as an independent cross-check,
  * grounding validation still passes,
  * the LLM's proposed recommendation is captured (and agreement flagged).
"""

from __future__ import annotations

import json

import pytest

from frab_worker.agentic import AgenticInvestigator
from frab_worker.scoring import compute_risk_score
from frab_worker.supervisor import Supervisor
from frab_worker.tools import ToolLayer
from frab_worker.validator import validate_result


class ScriptedLLM:
    """A fake Gemma that returns a fixed sequence of agent actions as JSON."""

    name = "vllm"  # pretend to be a live model so agentic mode activates

    def __init__(self, actions: list[dict]):
        self._actions = list(actions)
        self.calls = 0

    def complete(self, prompt: str, *, system: str = "", temperature: float = 0.0,
                 max_tokens: int = 1024) -> str:
        if self.calls < len(self._actions):
            out = self._actions[self.calls]
        else:
            out = {"reasoning": "done", "action": "conclude",
                   "recommendation": "ESCALATE", "justification": "sufficient evidence"}
        self.calls += 1
        return json.dumps(out)


def _mule_script(tx):
    return [
        {"reasoning": "check features", "action": "compute_features",
         "args": {"transaction_id": tx}},
        {"reasoning": "destination looks like a collection account, trace network",
         "action": "trace_account_network", "args": {"transaction_id": tx}},
        {"reasoning": "name the pattern", "action": "detect_pattern",
         "args": {"transaction_id": tx}},
        {"reasoning": "fan-in + new beneficiary + amount spike = mule collection",
         "action": "conclude", "recommendation": "ESCALATE",
         "justification": "5 unrelated senders converge on the destination."},
    ]


def test_agentic_loop_drives_investigation(bank, cfg, oracle):
    tx = oracle["SCN07"]["trigger_transaction_id"]
    tools = ToolLayer(bank, cfg)
    llm = ScriptedLLM(_mule_script(tx))
    inv = AgenticInvestigator(tools, cfg, llm)

    detective, risk, meta = inv.investigate(tx)

    # LLM made real tool choices
    assert meta["mode"] == "agentic"
    assert meta["steps"] >= 3
    assert meta["llm_proposed_recommendation"] == "ESCALATE"

    # deterministic ground truth still computed independently
    assert risk.level == "HIGH"
    assert detective.observed_pattern == "MULE_COLLECTION"
    assert any(e.type == "NETWORK_FAN_IN" for e in detective.evidence)

    # cross-check present and agrees
    cc = meta["deterministic_crosscheck"]
    assert cc["deterministic_risk_level"] == "HIGH"
    assert cc["agree"] is True


def test_agentic_numbers_come_from_tools_not_llm(bank, cfg, oracle):
    """Even if the LLM 'says' nonsense reasoning, the numbers are the tool's."""
    tx = oracle["SCN07"]["trigger_transaction_id"]
    tools = ToolLayer(bank, cfg)
    # LLM concludes immediately with no tool calls and a wrong rec
    llm = ScriptedLLM([{"reasoning": "gut feeling", "action": "conclude",
                        "recommendation": "CLOSE", "justification": "looks fine"}])
    inv = AgenticInvestigator(tools, cfg, llm)
    detective, risk, meta = inv.investigate(tx)

    # deterministic layer still computes the real (HIGH) risk from tools
    assert risk.level == "HIGH"
    assert any(e.type == "AMOUNT_DEVIATION" for e in detective.evidence)
    # and the disagreement between LLM (CLOSE) and deterministic (ESCALATE) is flagged
    cc = meta["deterministic_crosscheck"]
    assert cc["llm_proposed_recommendation"] == "CLOSE"
    assert cc["deterministic_implied_recommendation"] == "ESCALATE"
    assert cc["agree"] is False


def test_supervisor_agentic_mode_end_to_end(bank, cfg, oracle):
    tx = oracle["SCN07"]["trigger_transaction_id"]
    llm = ScriptedLLM(_mule_script(tx))
    sup = Supervisor(bank=bank, cfg=cfg, llm=llm)
    assert sup.agentic is True  # activated by the live-looking LLM

    res = sup.investigate("AGENTIC-07", tx)
    assert res.status == "COMPLETE"
    assert res.observed_pattern == "MULE_COLLECTION"
    assert res.risk_level == "HIGH"
    # agentic metadata carried through
    assert res.case_file["agentic"]["mode"] == "agentic"
    # grounding still holds in agentic mode
    report = validate_result(res, bank, cfg, tx)
    assert report.grounded, report.issues


def test_supervisor_emits_agent_reasoning_events(bank, cfg, oracle):
    tx = oracle["SCN07"]["trigger_transaction_id"]
    events = []
    llm = ScriptedLLM(_mule_script(tx))
    sup = Supervisor(bank=bank, cfg=cfg, llm=llm, event_sink=events.append)
    sup.investigate("AGENTIC-EV", tx)
    names = [e["event"] for e in events]
    assert "DETECTIVE_AGENTIC_START" in names
    assert "AGENT_REASONING" in names
    assert "TOOL_SELECTED" in names
    assert names[-1] == "INVESTIGATION_COMPLETE"


def test_offline_stays_fixed_pipeline(bank, cfg, oracle):
    """With the offline client, agentic auto-disables -> deterministic pipeline."""
    sup = Supervisor(bank=bank, cfg=cfg)  # default offline client
    assert sup.agentic is False
    res = sup.investigate("FIXED-07", oracle["SCN07"]["trigger_transaction_id"])
    assert res.status == "COMPLETE"
    assert res.observed_pattern == "MULE_COLLECTION"
