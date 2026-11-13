"""Supervisor orchestrator (Phase 1).

Plain-Python orchestration of the investigation workflow. No agent framework —
just explicit, debuggable, deterministic control flow. The Supervisor:

  * runs Watchman -> (tier branch) -> Detective -> Jurist -> Scribe
  * emits investigation events (drives the frontend workspace)
  * handles per-stage failure -> PARTIAL result rather than a hard crash
  * assembles the FinalInvestigationResult
  * NEVER takes the final action — it only produces a recommendation

Tier branch:
  LOW / MEDIUM  -> LIGHT path (Detective without network; skip Jurist)
  HIGH          -> FULL path  (Detective + network + Jurist + Scribe)
"""

from __future__ import annotations

import time
from typing import Any, Callable

from .agents import Detective, Jurist, Scribe, Watchman
from .config import default_config
from .data_access import BankData, default_bank_data
from .llm import LLMClient, get_client
from .schemas import (
    FinalInvestigationResult,
    InvestigationStatus,
    InvestigationTier,
    Recommendation,
)
from .scoring import RiskScore
from .tools import ToolLayer

EventSink = Callable[[dict[str, Any]], None]


class Supervisor:
    def __init__(
        self,
        bank: BankData | None = None,
        cfg: dict[str, Any] | None = None,
        llm: LLMClient | None = None,
        event_sink: EventSink | None = None,
    ) -> None:
        self.cfg = cfg or default_config()
        self.bank = bank or default_bank_data()
        self.tools = ToolLayer(self.bank, self.cfg)
        self.llm = llm or get_client()
        self._sink = event_sink
        self.watchman = Watchman(self.tools, self.cfg)
        self.detective = Detective(self.tools, self.cfg)
        self.jurist = Jurist()
        self.scribe = Scribe(self.cfg)

        # Agentic mode: when a live LLM is present, the LLM autonomously drives
        # the investigation (reason -> pick tool -> observe -> adapt -> propose
        # recommendation). With the offline client there is no model to reason,
        # so we fall back to the deterministic fixed pipeline. Can be forced off
        # with FRAB_AGENTIC=0 for reproducible demos.
        import os
        agentic_env = os.environ.get("FRAB_AGENTIC", "auto").lower()
        llm_is_live = getattr(self.llm, "name", "offline") != "offline"
        if agentic_env in ("0", "off", "false"):
            self.agentic = False
        elif agentic_env in ("1", "on", "true"):
            self.agentic = True
        else:  # auto
            self.agentic = llm_is_live

    # --- event helpers -----------------------------------------------------

    def _emit(self, case_id: str, event: str, agent: str = "", status: str = "RUNNING",
              **meta) -> dict[str, Any]:
        ev = {
            "case_id": case_id,
            "event": event,
            "agent": agent,
            "status": status,
            "timestamp": time.time(),
            "metadata": meta,
        }
        if self._sink:
            self._sink(ev)
        return ev
            

    # --- main entry point --------------------------------------------------
    def investigate(
        self,
        case_id: str,
        trigger_transaction_id: str,
        *,
        prior_alert_count: int = 0,
        alert_id: str = "",
        alert_type: str = "",
    ) -> FinalInvestigationResult:
        trace: list[dict[str, Any]] = []
        completed: list[str] = []
        failed: list[str] = []

        def step(ev):
            trace.append(ev)

        # In API mode, prime the investigation bundle for this alert so the
        # data-access layer can serve all lookups from it. No-op for CSV/offline
        # data sources (which have no load_alert method).
        if alert_id and hasattr(self.bank, "load_alert"):
            try:
                self.bank.load_alert(alert_id)
            except Exception:  # noqa: BLE001 - handled by downstream data errors
                pass

        step(self._emit(case_id, "CASE_STARTED", "SUPERVISOR", "RUNNING"))
        step(self._emit(case_id, "SUPERVISOR_ACTIVE", "SUPERVISOR", "RUNNING"))

        agentic_meta: dict[str, Any] = {}

        # --- Watchman -------------------------------------------------------
        try:
            step(self._emit(case_id, "WATCHMAN_ANALYZING", "WATCHMAN"))
            watchman_out, risk = self.watchman.run(
                trigger_transaction_id, prior_alert_count=prior_alert_count
            )
            completed.append("WATCHMAN")
            step(self._emit(case_id, "WATCHMAN_COMPLETED", "WATCHMAN", "COMPLETED",
                            tier=watchman_out.investigation_tier,
                            risk_score=round(risk.score, 4)))
        except Exception as exc:  # noqa: BLE001 - top-level stage guard
            failed.append("WATCHMAN")
            step(self._emit(case_id, "INVESTIGATION_FAILED", "WATCHMAN", "FAILED",
                            error=str(exc)))
            return self._fail(case_id, trace, completed, failed, str(exc))

        depth = watchman_out.investigation_depth  # LIGHT or FULL

        # --- Detective: AGENTIC (LLM-driven) or fixed pipeline --------------
        try:
            if self.agentic:
                step(self._emit(case_id, "DETECTIVE_AGENTIC_START", "DETECTIVE",
                                metadata={"mode": "agentic"}))
                from .agentic import AgenticInvestigator

                def _agent_event(event, agent, meta):
                    step(self._emit(case_id, event, agent, "RUNNING", **meta))

                investigator = AgenticInvestigator(
                    self.tools, self.cfg, self.llm, event_emit=_agent_event
                )
                # the LLM autonomously drives evidence gathering; risk is the
                # independent deterministic cross-check
                detective_out, risk, agentic_meta = investigator.investigate(
                    trigger_transaction_id
                )
            else:
                step(self._emit(case_id, "DETECTIVE_QUERYING_HISTORY", "DETECTIVE"))
                if depth == "FULL":
                    step(self._emit(case_id, "DETECTIVE_TRACING_NETWORK", "DETECTIVE"))
                detective_out = self.detective.run(trigger_transaction_id, depth=depth)

            completed.append("DETECTIVE")
            step(self._emit(case_id, "DETECTIVE_COMPLETED", "DETECTIVE", "COMPLETED",
                            evidence_count=len(detective_out.evidence),
                            observed_pattern=detective_out.observed_pattern))
            # progressive evidence events
            for e in detective_out.evidence:
                step(self._emit(case_id, "EVIDENCE_DISCOVERED", "DETECTIVE", "RUNNING",
                                evidence_id=e.evidence_id, type=e.type,
                                description=e.description))
        except Exception as exc:  # noqa: BLE001
            failed.append("DETECTIVE")
            step(self._emit(case_id, "INVESTIGATION_FAILED", "DETECTIVE", "FAILED",
                            error=str(exc)))
            return self._fail(case_id, trace, completed, failed, str(exc))

        # --- Jurist ---------------------------------------------------------
        # Run for every case (deterministic corpus retrieval is cheap) so all
        # dispositions carry regulatory context — passing alert_type so cases
        # with no named sequence pattern still map to a regulation by scenario.
        jurist_available = True
        from .schemas import JuristOutput
        jurist_out = JuristOutput(observed_pattern=detective_out.observed_pattern)
        try:
            step(self._emit(case_id, "JURIST_ASSESSING_RISK", "JURIST"))
            jurist_out = self.jurist.run(
                detective_out.observed_pattern, detective_out,
                alert_type=alert_type,
            )
            completed.append("JURIST")
            step(self._emit(case_id, "JURIST_COMPLETED", "JURIST", "COMPLETED",
                            context_count=len(jurist_out.regulatory_context)))
        except Exception as exc:  # noqa: BLE001
            jurist_available = False
            failed.append("JURIST")
            step(self._emit(case_id, "JURIST_FAILED", "JURIST", "FAILED",
                            error=str(exc)))
            # do NOT abort — continue to Scribe with a partial result

        # --- Scribe ---------------------------------------------------------
        try:
            step(self._emit(case_id, "SCRIBE_COMPILING_REPORT", "SCRIBE"))
            scribe_out = self.scribe.run(
                case_id, watchman_out, detective_out, jurist_out, risk,
                jurist_available=jurist_available,
            )
            completed.append("SCRIBE")
            step(self._emit(case_id, "SCRIBE_COMPLETED", "SCRIBE", "COMPLETED",
                            recommendation=scribe_out.recommendation))
        except Exception as exc:  # noqa: BLE001
            failed.append("SCRIBE")
            step(self._emit(case_id, "INVESTIGATION_FAILED", "SCRIBE", "FAILED",
                            error=str(exc)))
            return self._fail(case_id, trace, completed, failed, str(exc))

        status = (InvestigationStatus.PARTIAL if failed
                  else InvestigationStatus.COMPLETE)
        final_event = ("INVESTIGATION_PARTIAL" if failed else "INVESTIGATION_COMPLETE")
        step(self._emit(case_id, final_event, "SUPERVISOR", "COMPLETED"))

        result = FinalInvestigationResult(
            case_id=case_id,
            status=status,
            investigation_tier=watchman_out.investigation_tier,
            risk_score=risk.score,
            risk_level=risk.level,
            risk_components=risk.to_dict()["components"],
            critical_signals=risk.critical_signals,
            observed_pattern=detective_out.observed_pattern,
            recommendation=scribe_out.recommendation,
            recommendation_reason=scribe_out.recommendation_reason,
            evidence=[e.to_dict() for e in detective_out.evidence],
            findings=[f.to_dict() for f in detective_out.findings],
            regulatory_context=[r.to_dict() for r in jurist_out.regulatory_context],
            network=detective_out.network,
            case_file={"summary": scribe_out.case_summary,
                       "sections": scribe_out.sections,
                       "agentic": agentic_meta},
            completed_stages=completed,
            failed_stages=failed,
            agent_trace=trace,
            timeline=[{"event": t["event"], "timestamp": t["timestamp"]} for t in trace],
        )
        result.validate()
        return result

    # --- failure assembly --------------------------------------------------

    def _fail(self, case_id, trace, completed, failed, error) -> FinalInvestigationResult:
        result = FinalInvestigationResult(
            case_id=case_id,
            status=InvestigationStatus.FAILED,
            recommendation=Recommendation.INSUFFICIENT_EVIDENCE,
            recommendation_reason=f"Investigation could not complete: {error}",
            completed_stages=completed,
            failed_stages=failed,
            agent_trace=trace,
        )
        result.validate()
        return result
