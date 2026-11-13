"""Parse Vapi webhook events into voice-call updates.

Vapi sends lifecycle messages (status-update, end-of-call-report, etc.). We care
mainly about status transitions and the final end-of-call-report, which carries
the assistant's Structured Output + analysis. We NEVER run our own LLM over the
transcript — we use the structured output the existing assistant already emits.

Robust to missing/optional fields: nothing here fails because a field is absent.
"""

from __future__ import annotations

import json
from typing import Any

from .models import CallStatus


def _dict(v: Any) -> dict[str, Any]:
    return v if isinstance(v, dict) else {}


def extract_message(body: dict[str, Any]) -> dict[str, Any]:
    """Vapi wraps events as {"message": {...}}; tolerate both shapes."""
    return body.get("message") or body


def extract_call_id(body: dict[str, Any]) -> str | None:
    msg = extract_message(body)
    call = _dict(msg.get("call"))
    return call.get("id") or msg.get("callId") or body.get("callId")


def event_type(body: dict[str, Any]) -> str:
    msg = extract_message(body)
    return msg.get("type") or msg.get("event") or "unknown"


# Vapi call statuses -> our lifecycle statuses. Only ACTIVE states come from a
# status-update. "ended" is deliberately absent: the final status (completed,
# unreachable, failed, pending) is decided by the end-of-call-report, which
# Vapi sends after it. Mapping "ended" to a terminal state here would lock the
# call before the real result arrives.
_STATUS_MAP = {
    "queued": CallStatus.QUEUED,
    "ringing": CallStatus.CALLING,
    "in-progress": CallStatus.IN_PROGRESS,
    "forwarding": CallStatus.IN_PROGRESS,
}

# ended reasons that mean "never really connected"
_UNREACHABLE_REASONS = {
    "customer-did-not-answer", "customer-busy", "voicemail",
    "customer-did-not-give-microphone-permission",
    "twilio-failed-to-connect-call", "vonage-failed-to-connect-call",
}
_UNREACHABLE_MARKERS = ("did-not-answer", "busy", "voicemail", "failed-to-connect")
# ended reasons that mean the call broke on the platform side
_FAILURE_MARKERS = ("error", "assistant-not-found", "not-found", "invalid",
                    "call.start", "provider-closed")


def raw_status(body: dict[str, Any]) -> str:
    msg = extract_message(body)
    call = _dict(msg.get("call"))
    return str(msg.get("status") or call.get("status") or "").lower()


def map_status(body: dict[str, Any]) -> str | None:
    """Best-effort ACTIVE status from a status-update message (None otherwise)."""
    return _STATUS_MAP.get(raw_status(body))


def _is_unreachable(reason: str) -> bool:
    return reason in _UNREACHABLE_REASONS or any(m in reason for m in _UNREACHABLE_MARKERS)


def _is_failure(reason: str) -> bool:
    return any(m in reason for m in _FAILURE_MARKERS)


def _as_str_list(v: Any) -> list[str]:
    """The assistant should emit a list of strings; tolerate a string, or a list
    of objects, so a shape change never breaks the poll endpoint."""
    if v is None or v == "":
        return []
    if isinstance(v, str):
        return [v]
    if isinstance(v, list):
        out = []
        for x in v:
            if isinstance(x, dict):
                x = x.get("statement") or x.get("text") or x.get("value") or json.dumps(x)
            if x not in (None, ""):
                out.append(str(x))
        return out
    return [str(v)]


def _as_bool(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.strip().lower() in ("true", "yes", "1", "y")
    return bool(v)


def _as_opt_str(v: Any) -> str | None:
    return None if v in (None, "") else str(v)


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
    analysis = _dict(msg.get("analysis"))
    artifact = _dict(msg.get("artifact"))
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
    call = _dict(msg.get("call"))
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

    ended_reason = str(msg.get("endedReason") or call.get("endedReason") or "").lower()
    if ended_reason:
        result["ended_reason"] = ended_reason

    # Vapi also emits a plain-language call summary (top level on the webhook,
    # under analysis on the call object). We use it directly, and as a fallback
    # for the structured summary, so the frontend always has a readable summary.
    analysis = _dict(msg.get("analysis"))
    vapi_summary = str(msg.get("summary") or analysis.get("summary") or "").strip()

    structured = _find_structured_output(msg)
    if _is_unreachable(ended_reason):
        # never connected (no answer / busy / voicemail): whatever summary Vapi
        # generated is not a customer conversation
        result["status"] = CallStatus.UNREACHABLE
    elif structured:
        result["status"] = CallStatus.COMPLETED
        result["structured_assessment"] = structured
        result["verification_status"] = _as_opt_str(structured.get("verification_status"))
        result["call_outcome"] = _as_opt_str(structured.get("call_outcome"))
        # prefer the structured summary; fall back to Vapi's call summary
        result["summary"] = str(structured.get("summary") or vapi_summary)
        # accept either field name the assistant might emit for statements
        result["customer_statements"] = _as_str_list(
            structured.get("key_statements") or structured.get("customer_statements"))
        result["unresolved_questions"] = _as_str_list(structured.get("unresolved_questions"))
        result["analyst_attention"] = _as_str_list(structured.get("analyst_attention"))
        result["customer_requested_human"] = _as_bool(
            structured.get("customer_requested_human", False))
    elif _is_failure(ended_reason):
        result["status"] = CallStatus.FAILED
        result["error"] = f"Call ended with a platform error: {ended_reason}"
    elif vapi_summary:
        # no structured assessment, but Vapi gave us a transcript summary —
        # that's a real, usable result for the frontend, not a fabrication.
        result["status"] = CallStatus.COMPLETED
        result["summary"] = vapi_summary
    else:
        # call ended, no structured output and no summary -> pending
        result["status"] = CallStatus.VOICE_ASSESSMENT_PENDING

    # transcript / recording — store the actual content so the conversation is
    # durably retained (not just a flag). Vapi puts these in a few places.
    artifact = _dict(msg.get("artifact"))
    transcript = str(msg.get("transcript") or artifact.get("transcript") or "")
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
