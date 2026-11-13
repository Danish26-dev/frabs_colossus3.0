"""Investigation store (Phase 2).

Tracks each case's lifecycle, runs the Supervisor in a background thread, and
buffers investigation events so the SSE endpoint can stream them live. Cases live
in process memory; with FRAB_STORE=firestore they are ALSO written to Firestore
(see persistence.py) so a page refresh or worker restart can reload a finished
case. Without it the store is process-local, exactly as before.

Thread model: the Supervisor runs synchronously in a worker thread; its
event_sink pushes events into a thread-safe list + condition. SSE readers wait
on the condition and drain new events. A case is only marked `done` by the
worker thread, AFTER its result is stored, so a client that reacts to the
terminal event and immediately fetches /result never sees "not ready".
"""

from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any

from .persistence import CasePersistence, build_record
from .supervisor import Supervisor, failed_result

logger = logging.getLogger("frab_worker.store")

_TERMINAL_STATUSES = {"COMPLETE", "PARTIAL", "FAILED"}


@dataclass
class CaseState:
    case_id: str
    status: str = "STARTED"           # STARTED|RUNNING|COMPLETE|PARTIAL|FAILED
    current_agent: str = ""
    current_event: str = ""
    completed_stages: list[str] = field(default_factory=list)
    events: list[dict[str, Any]] = field(default_factory=list)
    result: dict[str, Any] | None = None
    error: str = ""
    done: bool = False
    created_at: float = field(default_factory=time.time)
    _cond: threading.Condition = field(default_factory=threading.Condition)

    def append_event(self, ev: dict[str, Any]) -> None:
        with self._cond:
            self.events.append(ev)
            self.current_event = ev.get("event", "")
            if ev.get("agent"):
                self.current_agent = ev["agent"]
            # the event's *status* says whether work is under way (event names
            # are things like WATCHMAN_ANALYZING); never regress a final status
            if self.status == "STARTED" and ev.get("status") == "RUNNING":
                self.status = "RUNNING"
            agent = ev.get("agent")
            if (ev.get("status") == "COMPLETED" and str(ev.get("event", "")).endswith("_COMPLETED")
                    and agent and agent not in self.completed_stages):
                self.completed_stages.append(agent)
            self._cond.notify_all()

    def wait_for_new(self, from_index: int, timeout: float = 1.0) -> list[dict[str, Any]]:
        with self._cond:
            if from_index >= len(self.events) and not self.done:
                self._cond.wait(timeout=timeout)
            return self.events[from_index:]


class InvestigationStore:
    def __init__(self, supervisor_factory=None,
                 persistence: CasePersistence | None = None) -> None:
        # supervisor_factory lets tests inject a Supervisor with a specific bank;
        # by default each case gets its own Supervisor bound to its own data
        self._custom_factory = supervisor_factory
        self._persistence = persistence
        self._cases: dict[str, CaseState] = {}
        self._lock = threading.Lock()

    # --- durable copy ------------------------------------------------------

    def _persist(self, state: CaseState, alert_id: str, alert_type: str) -> None:
        """Best-effort write. A storage failure is logged, never raised: it must
        not take down a finished investigation."""
        if self._persistence is None:
            return
        try:
            with state._cond:
                events = list(state.events)
            self._persistence.save(state.case_id, build_record(
                case_id=state.case_id, status=state.status, alert_id=alert_id,
                alert_type=alert_type, error=state.error,
                completed_stages=state.completed_stages, result=state.result,
                events=events, created_at=state.created_at))
        except Exception:  # noqa: BLE001
            logger.exception("could not persist case %s", state.case_id)

    def _restore(self, case_id: str) -> CaseState | None:
        if self._persistence is None:
            return None
        try:
            rec = self._persistence.load(case_id)
        except Exception:  # noqa: BLE001
            logger.exception("could not load case %s", case_id)
            return None
        if not rec:
            return None
        state = CaseState(
            case_id=case_id, status=rec.get("status") or "FAILED",
            completed_stages=list(rec.get("completed_stages") or []),
            error=rec.get("error") or "",
            created_at=rec.get("created_at") or time.time(), done=True)
        try:
            state.events = json.loads(rec.get("events_json") or "[]")
            state.result = json.loads(rec["result_json"]) if rec.get("result_json") else None
        except ValueError:
            logger.error("stored case %s is corrupt", case_id)
            state.events, state.result = [], None
        if state.status not in _TERMINAL_STATUSES:
            # the worker died mid-investigation: say so plainly instead of
            # reporting a phantom running case
            state.status = "FAILED"
            state.error = state.error or "Investigation was interrupted by a worker restart."
        elif state.status != "FAILED" and state.result is None:
            state.status = "FAILED"
            state.error = state.error or "The stored investigation result is unavailable."
        if state.status == "FAILED" and not any(
                e.get("event") == "INVESTIGATION_FAILED" for e in state.events):
            state.events.append({
                "case_id": case_id, "event": "INVESTIGATION_FAILED",
                "agent": "SUPERVISOR", "status": "FAILED", "timestamp": time.time(),
                "metadata": {"error": state.error}})
        if state.status == "FAILED" and state.result is None:
            # /result must answer a finished case, never "not ready" forever
            state.result = failed_result(case_id, state.error or "unknown error",
                                         state.events).to_dict()
        return state

    # --- public API --------------------------------------------------------

    def get(self, case_id: str) -> CaseState | None:
        with self._lock:
            state = self._cases.get(case_id)
        if state is not None or self._persistence is None:
            return state
        restored = self._restore(case_id)  # storage I/O stays outside the lock
        if restored is None:
            return None
        with self._lock:
            return self._cases.setdefault(case_id, restored)

    def _make_supervisor(self, sink, bank):
        if self._custom_factory is not None:
            return self._custom_factory(sink)
        return Supervisor(bank=bank, event_sink=sink)

    def start(self, case_id: str, trigger_transaction_id: str,
              *, prior_alert_count: int = 0, alert_id: str = "",
              alert_type: str = "", bank=None) -> CaseState:
        """Start a case, or return the existing one (its real status) if the
        case_id is already known. `bank` is this case's own data access."""
        existing = self.get(case_id)
        if existing is not None:
            return existing
        with self._lock:
            if case_id in self._cases:
                return self._cases[case_id]
            state = CaseState(case_id=case_id)
            self._cases[case_id] = state
        self._persist(state, alert_id, alert_type)

        def run():
            try:
                # built inside the guard: a misconfigured LLM (e.g. a missing
                # ZG_API_KEY) must fail this case visibly, not hang the stream
                supervisor = self._make_supervisor(state.append_event, bank)
                result = supervisor.investigate(
                    case_id, trigger_transaction_id,
                    prior_alert_count=prior_alert_count, alert_id=alert_id,
                    alert_type=alert_type,
                )
                state.result = result.to_dict()
                state.completed_stages = result.completed_stages
                state.status = result.status
            except Exception as exc:  # noqa: BLE001 - background guard
                state.error = str(exc)
                state.append_event({
                    "case_id": case_id, "event": "INVESTIGATION_FAILED",
                    "agent": "SUPERVISOR", "status": "FAILED",
                    "timestamp": time.time(), "metadata": {"error": str(exc)},
                })
                with state._cond:
                    trace = list(state.events)
                state.result = failed_result(case_id, str(exc), trace,
                                             state.completed_stages).to_dict()
                state.status = "FAILED"
            finally:
                # result and status are final BEFORE the case is marked done
                self._persist(state, alert_id, alert_type)
                with state._cond:
                    state.done = True
                    state._cond.notify_all()

        threading.Thread(target=run, daemon=True).start()
        return state
