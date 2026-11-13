"""Voice escalation service tests — full flow with a mock Vapi + in-memory store,
no real calls, no network."""

from __future__ import annotations

from frab_voice.config import VoiceConfig
from frab_voice.models import CallStatus
from frab_voice.service import VoiceEscalationService, recommended_actions
from frab_voice.store import InMemoryVoiceStore
from frab_voice.vapi_client import VapiClient
from frab_voice import webhook_parser as wh


class FakeCaseSource:
    """Returns fixed case context (no bank API needed)."""
    def get_case_context(self, case_id, alert_id):
        return {
            "case_id": case_id, "alert_id": alert_id, "case_type": "MULE_PATTERN",
            "customer_name": "Test Customer", "customer_id": "C009026167",
            "account_id": "ACC-C009026167", "transaction_id": "TX009971",
            "transaction_amount": "9283.93", "transaction_date": "2026-10-30T15:10:00",
            "beneficiary": "C888000007", "alert_reason": "MULE_PATTERN",
        }


def _mock_service():
    cfg = VoiceConfig(vapi_api_key="", vapi_assistant_id="fad86425", 
                      vapi_phone_number_id="+15403588511", vapi_base_url="https://api.vapi.ai",
                      bank_api_url="", store_path="", mock=True)
    return VoiceEscalationService(VapiClient(cfg), InMemoryVoiceStore(), FakeCaseSource())


def _end_of_call(call_id, structured=None, ended_reason="hangup"):
    msg = {"type": "end-of-call-report", "call": {"id": call_id},
           "endedReason": ended_reason, "durationSeconds": 143,
           "startedAt": "t0", "endedAt": "t1"}
    if structured is not None:
        msg["analysis"] = {"structuredData": structured}
    return {"message": msg}


def test_start_escalation_creates_call_and_record():
    svc = _mock_service()
    call = svc.start_escalation("CASE0007", alert_id="ALT0007",
                                customer_phone="+910000000000", overrides={})
    assert call.status == CallStatus.CALLING
    assert call.call_id.startswith("mock-call-")
    assert svc.store.get(call.call_id) is not None
    # timeline has the request + start events
    events = [e["event"] for e in svc.store.timeline_for_case("CASE0007")]
    assert "VOICE_ESCALATION_REQUESTED" in events
    assert "VOICE_CALL_STARTED" in events


def test_webhook_end_of_call_with_structured_output():
    svc = _mock_service()
    call = svc.start_escalation("CASE0007", alert_id="ALT0007",
                                customer_phone="+91...", overrides={})
    structured = {
        "verification_status": "VERIFIED", "call_outcome": "INFORMATION_OBTAINED",
        "summary": "Customer confirmed the transfer was to a friend.",
        "key_statements": ["It was for rent"], "unresolved_questions": [],
        "consistency_assessment": "CONSISTENT", "customer_requested_human": False,
    }
    body = _end_of_call(call.call_id, structured)
    update = wh.parse_end_of_call(body)
    updated = svc.apply_webhook(call.call_id, f"{call.call_id}:end-of-call",
                                update, new_status=update.get("status"))
    assert updated.status == CallStatus.COMPLETED
    assert updated.verification_status == "VERIFIED"
    assert updated.summary.startswith("Customer confirmed")
    events = [e["event"] for e in svc.store.timeline_for_case("CASE0007")]
    assert "VOICE_CALL_COMPLETED" in events
    assert "VOICE_ASSESSMENT_RECEIVED" in events


def test_webhook_no_structured_output_marks_pending():
    svc = _mock_service()
    call = svc.start_escalation("C1", alert_id="A1", customer_phone="+91", overrides={})
    body = _end_of_call(call.call_id, structured=None, ended_reason="hangup")
    update = wh.parse_end_of_call(body)
    updated = svc.apply_webhook(call.call_id, f"{call.call_id}:end-of-call",
                                update, new_status=update.get("status"))
    assert updated.status == CallStatus.VOICE_ASSESSMENT_PENDING
    assert updated.summary == ""  # never fabricated
    events = [e["event"] for e in svc.store.timeline_for_case("C1")]
    assert "VOICE_ASSESSMENT_PENDING" in events


def test_webhook_unreachable():
    svc = _mock_service()
    call = svc.start_escalation("C1", alert_id="A1", customer_phone="+91", overrides={})
    body = _end_of_call(call.call_id, structured=None, ended_reason="customer-did-not-answer")
    update = wh.parse_end_of_call(body)
    updated = svc.apply_webhook(call.call_id, "k", update, new_status=update.get("status"))
    assert updated.status == CallStatus.UNREACHABLE


def test_webhook_idempotent():
    svc = _mock_service()
    call = svc.start_escalation("C1", alert_id="A1", customer_phone="+91", overrides={})
    body = _end_of_call(call.call_id, {"verification_status": "VERIFIED",
                                       "call_outcome": "INFORMATION_OBTAINED", "summary": "s"})
    update = wh.parse_end_of_call(body)
    svc.apply_webhook(call.call_id, f"{call.call_id}:end-of-call", update, new_status=update.get("status"))
    svc.apply_webhook(call.call_id, f"{call.call_id}:end-of-call", update, new_status=update.get("status"))
    # ASSESSMENT_RECEIVED should appear exactly once despite double delivery
    events = [e["event"] for e in svc.store.timeline_for_case("C1")]
    assert events.count("VOICE_ASSESSMENT_RECEIVED") == 1


def test_unknown_call_id_returns_none():
    svc = _mock_service()
    assert svc.apply_webhook("does-not-exist", "k", {}, new_status="COMPLETED") is None


def test_multiple_escalations_same_case_distinct_records():
    svc = _mock_service()
    c1 = svc.start_escalation("CASE0007", alert_id="ALT0007", customer_phone="+91", overrides={})
    c2 = svc.start_escalation("CASE0007", alert_id="ALT0007", customer_phone="+91", overrides={})
    assert c1.call_id != c2.call_id
    assert len(svc.store.list_for_case("CASE0007")) == 2


def test_recommended_actions_from_assessment():
    acts = recommended_actions("ESCALATE", {
        "verification_status": "VERIFIED", "call_outcome": "INFORMATION_OBTAINED",
        "consistency_assessment": "PARTIALLY_CONSISTENT", "customer_requested_human": True,
    })
    assert "Escalate to human agent (customer requested)" in acts
    assert any("Reassess" in a for a in acts)
    assert "Maintain monitoring" in acts


def test_mock_autocomplete_completes_synchronously(monkeypatch):
    # With VAPI_MOCK_AUTOCOMPLETE on, a mock escalation reaches COMPLETED
    # inline (no webhook needed) — the serverless/Cloud Run demo path.
    monkeypatch.setenv("VAPI_MOCK_AUTOCOMPLETE", "1")
    svc = _mock_service()
    call = svc.start_escalation("CASE0003", alert_id="ALT0003",
                                customer_phone="+910000000000", overrides={})
    assert call.status == CallStatus.COMPLETED
    assert call.verification_status == "VERIFIED"
    assert call.summary  # populated, not fabricated-empty
    assert call.customer_statements
    assert call.structured_assessment.get("recommended_actions")
    events = [e["event"] for e in svc.store.timeline_for_case("CASE0003")]
    assert "VOICE_CALL_COMPLETED" in events
    assert "VOICE_ASSESSMENT_RECEIVED" in events


def test_mock_autocomplete_off_by_default():
    # Without the flag, a mock call stays CALLING (webhook-driven path).
    svc = _mock_service()
    call = svc.start_escalation("C1", alert_id="A1",
                                customer_phone="+910000000000", overrides={})
    assert call.status == CallStatus.CALLING


def test_failed_vapi_records_failure():
    # force a non-mock client with no creds so create_call raises -> handled
    from frab_voice.vapi_client import VapiClient as VC
    cfg = VoiceConfig("", "a", "+1", "https://x.invalid", "", "", mock=False)
    # not configured -> client is in mock anyway; instead simulate error path:
    svc = _mock_service()
    # monkey-force the vapi to raise
    def boom(**k):
        from frab_voice.vapi_client import VapiError
        raise VapiError("simulated")
    svc.vapi.create_call = boom  # type: ignore
    call = svc.start_escalation("C1", alert_id="A1", customer_phone="+91", overrides={})
    assert call.status == CallStatus.FAILED
    assert "simulated" in call.error
