"""Parse Vapi webhook events into voice-call updates.

Vapi sends lifecycle messages (status-update, end-of-call-report, etc.). We care
mainly about status transitions and the final end-of-call-report, which carries
the assistant's Structured Output + analysis. We NEVER run our own LLM over the
transcript — we use the structured output the existing assistant already emits.

Robust to missing/optional fields: nothing here fails because a field is absent.
"""

from __future__ import annotations

from typing import Any

from .models import CallStatus


def extract_message(body: dict[str, Any]) -> dict[str, Any]:
    """Vapi wraps events as {"message": {...}}; tolerate both shapes."""
    return body.get("message") or body


def extract_call_id(body: dict[str, Any]) -> str | None:
    msg = extract_message(body)
    call = msg.get("call") or {}
    return call.get("id") or msg.get("callId") or body.get("callId")


def event_type(body: dict[str, Any]) -> str:
    msg = extract_message(body)
    return msg.get("type") or msg.get("event") or "unknown"


# Vapi call statuses -> our lifecycle statuses
_STATUS_MAP = {
    "queued": CallStatus.QUEUED,
    "ringing": CallStatus.CALLING,
    "in-progress": CallStatus.IN_PROGRESS,
    "forwarding": CallStatus.IN_PROGRESS,
    "ended": CallStatus.COMPLETED,  # refined by end-reason below
}

# ended reasons that mean "never really connected"
_UNREACHABLE_REASONS = {
    "customer-did-not-answer", "customer-busy", "no-answer", "busy",
    "customer-did-not-give-microphone-permission", "twilio-failed-to-connect-call",
    "voicemail",
}


def map_status(body: dict[str, Any]) -> str | None:
    """Best-effort status from a status-update message."""
    msg = extract_message(body)
    raw = (msg.get("status") or (msg.get("call") or {}).get("status") or "").lower()
    return _STATUS_MAP.get(raw)


# fields that identify the FRAB assessment object
_ASSESSMENT_KEYS = (
    "verification_status", "call_outcome", "summary", "consistency_assessment",
    "key_statements", "customer_statements", "unresolved_questions",
    "analyst_attention", "customer_requested_human",
)


def _looks_like_assessment(d: Any) -> bool:
    return isinstance(d, dict) and any(k in d for k in _ASSESSMENT_KEYS)


def _dig_for_assessment(node: Any, depth: int = 0) -> dict[str, Any] | None:
    """Recursively search a nested structure for the FRAB assessment object.

    Vapi's Structured Outputs are keyed by output-id and wrap the payload under
    varying keys (result / value / output / data). Rather than hard-code every
    shape, walk the structure and return the first dict that carries our fields.
    """
    if depth > 6:
        return None
    if _looks_like_assessment(node):
        return node  # type: ignore[return-value]
    if isinstance(node, dict):
        # prefer common wrapper keys first, then any value
        for k in ("result", "value", "output", "data", "structuredData"):
            if k in node:
                found = _dig_for_assessment(node[k], depth + 1)
                if found:
                    return found
        for v in node.values():
            found = _dig_for_assessment(v, depth + 1)
            if found:
                return found
    elif isinstance(node, list):
        for item in node:
            found = _dig_for_assessment(item, depth + 1)
            if found:
                return found
    return None


def _find_structured_output(msg: dict[str, Any]) -> dict[str, Any] | None:
    """Locate the assistant's structured output across the shapes Vapi uses.

    Newer Vapi "Structured Outputs" (artifactPlan.structuredOutputIds) deliver
    results under artifact.structuredOutputs, keyed by output-id. Older analysis
    plans use analysis.structuredData. We check all known locations and, for the
    keyed shapes, dig for the object that carries the FRAB assessment fields.
    """
    analysis = msg.get("analysis") or {}
    artifact = msg.get("artifact") or {}
    for candidate in (
        analysis.get("structuredData"),
        analysis.get("structuredOutputs"),
        artifact.get("structuredOutputs"),   # <-- newer Structured Outputs land here
        artifact.get("structuredData"),
        msg.get("structuredOutputs"),
        msg.get("structuredData"),
    ):
        if not candidate:
            continue
        found = _dig_for_assessment(candidate)
        if found:
            return found
    return None


def parse_end_of_call(body: dict[str, Any]) -> dict[str, Any]:
    """Extract the final call result from an end-of-call-report message.

    Returns a partial VoiceCall-update dict. If no structured output is present,
    marks the assessment PENDING rather than inventing a summary.
    """
    msg = extract_message(body)
    call = msg.get("call") or {}
    result: dict[str, Any] = {}

    # timing / duration
    started = msg.get("startedAt") or call.get("startedAt")
    ended = msg.get("endedAt") or call.get("endedAt")
    if started:
        result["started_at"] = started
    if ended:
        result["ended_at"] = ended
    dur = msg.get("durationSeconds") or msg.get("duration")
    if isinstance(dur, (int, float)):
        result["duration_seconds"] = int(dur)

    ended_reason = (msg.get("endedReason") or call.get("endedReason") or "").lower()

    # Vapi also emits a plain-language call summary at the top level, generated
    # from the transcript. We use it directly (and as a fallback for the
    # structured summary) so the frontend always has a readable summary.
    vapi_summary = (msg.get("summary") or "").strip()

    structured = _find_structured_output(msg)
    if structured:
        result["status"] = CallStatus.COMPLETED
        result["structured_assessment"] = structured
        result["verification_status"] = structured.get("verification_status")
        result["call_outcome"] = structured.get("call_outcome")
        # prefer the structured summary; fall back to Vapi's call summary
        result["summary"] = structured.get("summary") or vapi_summary
        # accept either field name the assistant might emit for statements
        result["customer_statements"] = (
            structured.get("key_statements")
            or structured.get("customer_statements")
            or []
        )
        result["unresolved_questions"] = structured.get("unresolved_questions") or []
        result["analyst_attention"] = structured.get("analyst_attention") or []
        result["customer_requested_human"] = bool(
            structured.get("customer_requested_human", False))
    elif vapi_summary:
        # no structured assessment, but Vapi gave us a transcript summary —
        # that's a real, usable result for the frontend, not a fabrication.
        result["status"] = CallStatus.COMPLETED
        result["summary"] = vapi_summary
    elif ended_reason in _UNREACHABLE_REASONS:
        result["status"] = CallStatus.UNREACHABLE
    else:
        # call ended, no structured output and no summary -> pending
        result["status"] = CallStatus.VOICE_ASSESSMENT_PENDING

    # transcript / recording — store the actual content so the conversation is
    # durably retained (not just a flag). Vapi puts these in a few places.
    artifact = msg.get("artifact") or {}
    transcript = (msg.get("transcript") or artifact.get("transcript") or "")
    if transcript:
        result["transcript_reference"] = "available"
        result["transcript"] = transcript
    messages = artifact.get("messages") or msg.get("messages")
    if isinstance(messages, list) and messages:
        result["transcript_messages"] = messages
    recording_url = (artifact.get("recordingUrl") or msg.get("recordingUrl")
                     or artifact.get("stereoRecordingUrl") or "")
    if recording_url:
        result["recording_reference"] = recording_url

    return result
