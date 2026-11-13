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


class VoiceEscalationService:
    def __init__(self, vapi: VapiClient, store: VoiceStore, cases: CaseSource) -> None:
        self.vapi = vapi
        self.store = store
        self.cases = cases

    # --- start an escalation ------------------------------------------------

    def start_escalation(self, case_id: str, *, alert_id: str, customer_phone: str,
                         overrides: dict[str, Any]) -> VoiceCall:
        # 1. authoritative case context (bank bundle, answer-key stripped)
        ctx = self.cases.get_case_context(case_id, alert_id)
        # 2. resolve the receiver phone: backend directory is source of truth;
        #    a value passed in the request overrides (demo convenience).
        phone = customer_phone or ctx.get("_customer_phone", "")
        # 3. build the assistant variables (case data + case-derived overrides)
        variables = build_variables(ctx, overrides)

        self.store.add_timeline_event(case_id, {
            "event": VoiceEvent.ESCALATION_REQUESTED, "timestamp": _now(),
        })

        # no phone resolvable -> honest FAILED, don't attempt a call
        if not phone:
            call = VoiceCall(
                call_id=f"failed-{uuid.uuid4().hex[:8]}", case_id=case_id,
                status=CallStatus.FAILED, created_at=_now(),
                case_type=ctx.get("case_type", ""),
                error="No customer phone number available for this case.",
            )
            self.store.save(call)
            self.store.add_timeline_event(case_id, {
                "event": VoiceEvent.CALL_FAILED, "timestamp": _now(),
                "detail": "no customer phone",
            })
            return call

        # 4. create the call on the EXISTING assistant
        try:
            call_obj = self.vapi.create_call(
                customer_number=phone, variable_values=variables,
            )
        except VapiError as exc:
            # record a failed call so the case shows the failure honestly
            call = VoiceCall(
                call_id=f"failed-{uuid.uuid4().hex[:8]}", case_id=case_id,
                status=CallStatus.FAILED, created_at=_now(),
                case_type=ctx.get("case_type", ""), error=str(exc),
            )
            self.store.save(call)
            self.store.add_timeline_event(case_id, {
                "event": VoiceEvent.CALL_FAILED, "timestamp": _now(),
                "detail": str(exc),
            })
            return call

        # 4. persist the authoritative call_id
        call_id = call_obj.get("id") or f"unknown-{uuid.uuid4().hex[:8]}"
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

        # apply status transition (don't regress a terminal state)
        status = new_status or update.get("status")
        if status and call.status not in CallStatus.TERMINAL:
            call.status = status

        # apply fields from an end-of-call update
        for f in ("started_at", "ended_at", "duration_seconds", "structured_assessment",
                  "verification_status", "call_outcome", "summary",
                  "customer_statements", "unresolved_questions", "analyst_attention",
                  "customer_requested_human", "transcript_reference",
                  "recording_reference", "transcript", "transcript_messages"):
            if f in update and update[f] not in (None, "", []):
                setattr(call, f, update[f])
        if "status" in update and call.status not in CallStatus.TERMINAL:
            call.status = update["status"]

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
