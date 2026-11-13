"""Tests for parsing Vapi end-of-call webhooks, including the newer
artifact.structuredOutputs shape (Structured Outputs feature)."""

from __future__ import annotations

from frab_voice import webhook_parser as wh
from frab_voice.models import CallStatus


_ASSESSMENT = {
    "verification_status": "VERIFIED",
    "call_outcome": "INFORMATION_OBTAINED",
    "summary": "Customer confirmed the transfer.",
    "key_statements": ["It was for rent"],
    "unresolved_questions": [],
    "analyst_attention": [],
    "consistency_assessment": "CONSISTENT",
    "customer_requested_human": False,
}


def _eoc(artifact=None, analysis=None):
    msg = {
        "type": "end-of-call-report",
        "call": {"id": "call-123"},
        "endedReason": "customer-ended-call",
        "durationSeconds": 90,
    }
    if artifact is not None:
        msg["artifact"] = artifact
    if analysis is not None:
        msg["analysis"] = analysis
    return {"message": msg}


def test_parses_artifact_structured_outputs_keyed_by_id():
    # Vapi keys structured outputs by the output-id, payload under "result"
    body = _eoc(artifact={
        "structuredOutputs": {
            "c19308ca-3c25-4d92-9a03-656dfc703aed": {"result": _ASSESSMENT},
        },
    })
    out = wh.parse_end_of_call(body)
    assert out["status"] == CallStatus.COMPLETED
    assert out["verification_status"] == "VERIFIED"
    assert out["summary"].startswith("Customer confirmed")
    assert out["customer_statements"] == ["It was for rent"]


def test_parses_artifact_structured_outputs_direct_object():
    body = _eoc(artifact={"structuredOutputs": {"x": _ASSESSMENT}})
    out = wh.parse_end_of_call(body)
    assert out["status"] == CallStatus.COMPLETED
    assert out["call_outcome"] == "INFORMATION_OBTAINED"


def test_still_parses_legacy_analysis_structured_data():
    body = _eoc(analysis={"structuredData": _ASSESSMENT})
    out = wh.parse_end_of_call(body)
    assert out["status"] == CallStatus.COMPLETED
    assert out["verification_status"] == "VERIFIED"


def test_no_structured_output_marks_pending():
    body = _eoc(artifact={"structuredOutputs": {}}, analysis=None)
    out = wh.parse_end_of_call(body)
    assert out["status"] == CallStatus.VOICE_ASSESSMENT_PENDING
    assert out.get("summary", "") == ""


def test_vapi_top_level_summary_completes_without_structured():
    # No structured output, but Vapi provided a transcript summary -> COMPLETED
    body = _eoc(artifact={"structuredOutputs": {}})
    body["message"]["summary"] = "Customer verified identity and confirmed the transfer."
    out = wh.parse_end_of_call(body)
    assert out["status"] == CallStatus.COMPLETED
    assert out["summary"].startswith("Customer verified")


def test_structured_summary_falls_back_to_vapi_summary():
    assessment_no_summary = {k: v for k, v in _ASSESSMENT.items() if k != "summary"}
    body = _eoc(artifact={"structuredOutputs": {"x": assessment_no_summary}})
    body["message"]["summary"] = "Fallback call summary."
    out = wh.parse_end_of_call(body)
    assert out["status"] == CallStatus.COMPLETED
    assert out["summary"] == "Fallback call summary."


def test_captures_transcript_and_recording():
    body = _eoc(artifact={
        "structuredOutputs": {"x": _ASSESSMENT},
        "transcript": "AI: hello\nUser: hi",
        "recordingUrl": "https://rec.example/audio.wav",
    })
    out = wh.parse_end_of_call(body)
    assert out["transcript"].startswith("AI: hello")
    assert out["recording_reference"] == "https://rec.example/audio.wav"
