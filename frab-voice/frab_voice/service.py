"""Voice escalation orchestration — the glue between the API, Vapi, the case
source, and the store. Kept separate from the FastAPI layer so it's testable
with a mock Vapi client and in-memory store.
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Any

from .case_source import CaseSource
from .models import CallStatus, VoiceCall, VoiceEvent
from .store import VoiceStore
from .vapi_client import VapiClient, VapiError
from .variables import build_variables


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mock_autocomplete_enabled() -> bool:
    """Whether mock calls should complete synchronously inside start_escalation.
    Enabled for serverless demos (Cloud Run) where nothing calls the webhook."""
    import os
    return os.environ.get("VAPI_MOCK_AUTOCOMPLETE", "").lower() in ("1", "true", "on")


def recommended_actions(frab_recommendation: str,
                        assessment: dict[str, Any]) -> list[str]:
    """Derive recommended NEXT actions from the FRAB recommendation + the voice
    assessment. These are suggestions for the human — the voice agent never acts.
    """
    actions: list[str] = ["Review customer statement"]
    verification = (assessment.get("verification_status") or "").upper()
    consistency = (assessment.get("consistency_assessment") or "").upper()
    outcome = (assessment.get("call_outcome") or "").upper()

    if assessment.get("customer_requested_human"):
        actions.append("Escalate to human agent (customer requested)")
    if verification and verification != "VERIFIED":
        actions.append("Re-attempt identity verification")
    if consistency in ("INCONSISTENT", "PARTIALLY_CONSISTENT", "PARTIALLY CONSISTENT"):
        actions.append("Reassess case — statement not fully consistent")
    if outcome in ("INFORMATION_OBTAINED", "INFORMATION OBTAINED"):
        actions.append("Incorporate new evidence into disposition")
    actions.append("Maintain monitoring")
    # de-dupe, preserve order
    seen, out = set(), []
    for a in actions:
        if a not in seen:
            out.append(a); seen.add(a)
    return out


_ACTIVE_RANK = {CallStatus.QUEUED: 0, CallStatus.CALLING: 1, CallStatus.IN_PROGRESS: 2}

# reconcile an active call with Vapi when no webhook has finished it
_RECONCILE_AFTER_S = 60.0
_RECONCILE_EVERY_S = 20.0


def _age_seconds(iso: str) -> float:
    try:
        return (datetime.now(timezone.utc) - datetime.fromisoformat(iso)).total_seconds()
    except (TypeError, ValueError):
        return 0.0


class VoiceEscalationService:
    def __init__(self, vapi: VapiClient, store: VoiceStore, cases: CaseSource) -> None:
        self.vapi = vapi
        self.store = store
        self.cases = cases
        self._last_reconcile: dict[str, float] = {}

    # --- reconcile with Vapi (lost / unconfigured webhooks) -----------------

    def reconcile(self, call: VoiceCall) -> VoiceCall:
        """If a call is still active long after it started, ask Vapi for its
        real state and apply the result. Recovers calls whose webhook never
        arrived (secret mismatch, wrong server URL, an instance restart).
        Uses the same idempotency key as the webhook, so a late webhook is a
        no-op. Rate-limited per call. Never raises."""
        if (call.status not in CallStatus.ACTIVE or getattr(self.vapi, "mock", False)
                or _age_seconds(call.created_at) < _RECONCILE_AFTER_S
                or call.call_id.startswith(("failed-", "unknown-"))):
            return call
        now = time.monotonic()
        if now - self._last_reconcile.get(call.call_id, 0.0) < _RECONCILE_EVERY_S:
            return call
        self._last_reconcile[call.call_id] = now
        try:
            remote = self.vapi.get_call(call.call_id)
        except VapiError:
            return call
        if not isinstance(remote, dict):
            return call
        from . import webhook_parser as wh
        body = {"message": remote}
        if str(remote.get("status", "")).lower() == "ended":
            update = wh.parse_end_of_call(body)
            return self.apply_webhook(call.call_id, f"{call.call_id}:end-of-call", update,
                                      new_status=update.get("status")) or call
        status = wh.map_status(body)
        if status:
            return self.apply_webhook(
                call.call_id, f"{call.call_id}:status-update:{wh.raw_status(body)}", {},
                new_status=status) or call
        return call

    # --- start an escalation ------------------------------------------------

    def start_escalation(self, case_id: str, *, alert_id: str, customer_phone: str,
                         overrides: dict[str, Any]) -> VoiceCall:
        # 0. one live call per case: a double click must not ring the customer twice
        latest = self.store.latest_for_case(case_id)
        if latest is not None and latest.status in CallStatus.ACTIVE:
            return latest

        # 1. authoritative case context (bank bundle, answer-key stripped)
        ctx = self.cases.get_case_context(case_id, alert_id)
        # 2. resolve the receiver phone: backend directory is source of truth;
        #    the API layer only passes an override when explicitly allowed.
        phone = customer_phone or ctx.get("_customer_phone", "")
        # 3. build the assistant variables (case data + case-derived overrides)
        variables = build_variables(ctx, overrides)

        self.store.add_timeline_event(case_id, {
            "event": VoiceEvent.ESCALATION_REQUESTED, "timestamp": _now(),
        })

        # never call a customer with blank case details: if the bank data for
        # the alert could not be loaded, fail honestly instead
        if ctx.get("_case_data_ok") is False:
            return self._record_failure(
                case_id, ctx, "Case data unavailable from the bank API; no call placed.",
                "case data unavailable")

        # no phone resolvable -> honest FAILED, don't attempt a call
        if not phone:
            return self._record_failure(
                case_id, ctx, "No customer phone number available for this case.",
                "no customer phone")

        # 4. create the call on the EXISTING assistant
        try:
            call_obj = self.vapi.create_call(
                customer_number=phone, variable_values=variables,
            )
        except VapiError as exc:
            # record a failed call so the case shows the failure honestly
            return self._record_failure(case_id, ctx, str(exc), "call could not be placed")

        # 4. persist the authoritative call_id (Vapi must return one; without it
        #    no webhook or reconciliation could ever match the call)
        call_id = call_obj.get("id") if isinstance(call_obj, dict) else None
        if not call_id:
            return self._record_failure(
                case_id, ctx, "Vapi accepted the call but returned no call id.",
                "no call id from Vapi")
        call = VoiceCall(
            call_id=call_id, case_id=case_id, status=CallStatus.CALLING,
            created_at=_now(), case_type=ctx.get("case_type", ""),
        )
        self.store.save(call)
        self.store.add_timeline_event(case_id, {
            "event": VoiceEvent.CALL_STARTED, "timestamp": _now(),
            "call_id": call_id,
        })

        # 5. MOCK AUTO-COMPLETE: complete the call synchronously.
        #    Real calls complete asynchronously via the Vapi webhook. In mock
        #    mode nothing calls the webhook, and on serverless (Cloud Run) the
        #    container CPU is frozen the instant this response returns — so a
        #    background timer/task would never fire. When VAPI_MOCK_AUTOCOMPLETE
        #    is set, we complete inline so the demo reaches COMPLETED with a
        #    full assessment. Off by default so the webhook path stays testable.
        if getattr(self.vapi, "mock", False) and _mock_autocomplete_enabled():
            self._complete_mock_call(call, ctx, overrides)

        return call

    def _record_failure(self, case_id: str, ctx: dict[str, Any], error: str,
                        detail: str) -> VoiceCall:
        """Persist a FAILED call. The timeline gets a short reason; the full
        error (which may quote the provider) stays on the call record."""
        call = VoiceCall(
            call_id=f"failed-{uuid.uuid4().hex[:8]}", case_id=case_id,
            status=CallStatus.FAILED, created_at=_now(),
            case_type=ctx.get("case_type", ""), error=error,
        )
        self.store.save(call)
        self.store.add_timeline_event(case_id, {
            "event": VoiceEvent.CALL_FAILED, "timestamp": _now(), "detail": detail,
        })
        return call

    # --- mock completion ----------------------------------------------------

    def _complete_mock_call(self, call: VoiceCall, ctx: dict[str, Any],
                            overrides: dict[str, Any]) -> None:
        """Synchronously drive a mock call to COMPLETED with a realistic,
        structured assessment. Mirrors what a real Vapi end-of-call webhook
        would deliver, so the frontend renders a full Page 08 assessment."""
        frab_reco = str(overrides.get("frab_recommendation")
                        or ctx.get("frab_recommendation") or "").upper()
        beneficiary = ctx.get("beneficiary") or "the stated beneficiary"
        amount = ctx.get("transaction_amount") or "the flagged amount"

        assessment = {
            "verification_status": "VERIFIED",
            "call_outcome": "INFORMATION_OBTAINED",
            "consistency_assessment": "CONSISTENT",
            "customer_requested_human": False,
        }
        summary = (
            "Customer identity verified via security questions. Customer "
            f"confirmed initiating the transfer of {amount} to {beneficiary} "
            "and described the purpose consistently with the case context. "
            "No signs of coercion or third-party instruction were detected."
        )
        customer_statements = [
            f"Confirmed authorising the payment to {beneficiary}.",
            "Stated the transfer was for a planned personal purpose.",
            "Denied being instructed or pressured by anyone to make the payment.",
        ]
        unresolved_questions = [
            "Source of funds not independently corroborated during the call.",
        ]
        analyst_attention = [
            "Customer-reported purpose is unverified against documentary evidence.",
        ]

        call.status = CallStatus.COMPLETED
        call.started_at = _now()
        call.ended_at = _now()
        call.duration_seconds = 92
        call.verification_status = assessment["verification_status"]
        call.call_outcome = assessment["call_outcome"]
        call.structured_assessment = {
            **assessment,
            "recommended_actions": recommended_actions(frab_reco, assessment),
        }
        call.summary = summary
        call.customer_statements = customer_statements
        call.unresolved_questions = unresolved_questions
        call.analyst_attention = analyst_attention
        call.transcript_reference = f"mock-transcript-{call.call_id}"
        call.recording_reference = f"mock-recording-{call.call_id}"
        self.store.save(call)

        self._once(call.case_id, VoiceEvent.CALL_VERIFIED, call.call_id)
        self._once(call.case_id, VoiceEvent.CALL_COMPLETED, call.call_id)
        self._once(call.case_id, VoiceEvent.ASSESSMENT_RECEIVED, call.call_id)

    # --- apply a webhook update (idempotent) --------------------------------

    def apply_webhook(self, call_id: str, event_key: str,
                      update: dict[str, Any], *, new_status: str | None) -> VoiceCall | None:
        call = self.store.get(call_id)
        if call is None:
            return None  # unknown call_id -> caller returns 200 to avoid retries

        # idempotency: skip if we've already processed this (event_key)
        if event_key in call.processed_events:
            return call
        call.processed_events.append(event_key)

        # status transition: a terminal state is final; active states only
        # move forward (webhooks can arrive out of order)
        status = new_status or update.get("status")
        if status and call.status not in CallStatus.TERMINAL:
            if status in CallStatus.TERMINAL or (
                    _ACTIVE_RANK.get(status, -1) > _ACTIVE_RANK.get(call.status, -1)):
                call.status = status

        # apply fields from an end-of-call update
        for f in ("started_at", "ended_at", "duration_seconds", "structured_assessment",
                  "verification_status", "call_outcome", "summary",
                  "customer_statements", "unresolved_questions", "analyst_attention",
                  "customer_requested_human", "transcript_reference",
                  "recording_reference", "transcript", "transcript_messages", "error"):
            if f in update and update[f] not in (None, "", []):
                setattr(call, f, update[f])

        self.store.save(call)

        # timeline events for meaningful transitions
        if call.status == CallStatus.IN_PROGRESS:
            self._once(call.case_id, VoiceEvent.CALL_STARTED, call_id)
        if call.verification_status == "VERIFIED":
            self._once(call.case_id, VoiceEvent.CALL_VERIFIED, call_id)
        if call.status == CallStatus.COMPLETED:
            self._once(call.case_id, VoiceEvent.CALL_COMPLETED, call_id)
            self._once(call.case_id, VoiceEvent.ASSESSMENT_RECEIVED, call_id)
        elif call.status == CallStatus.VOICE_ASSESSMENT_PENDING:
            self._once(call.case_id, VoiceEvent.CALL_COMPLETED, call_id)
            self._once(call.case_id, VoiceEvent.ASSESSMENT_PENDING, call_id)
        return call

    def _once(self, case_id: str, event: str, call_id: str) -> None:
        """Add a timeline event only if not already present for this call."""
        existing = self.store.timeline_for_case(case_id)
        if any(e.get("event") == event and e.get("call_id") == call_id for e in existing):
            return
        self.store.add_timeline_event(case_id, {
            "event": event, "timestamp": _now(), "call_id": call_id,
        })
