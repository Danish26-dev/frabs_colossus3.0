"""API tests via TestClient. Runs in mock Vapi mode (no key set), so no real
calls or network to Vapi. Uses a temp store path per test session."""

from __future__ import annotations

import os

os.environ.setdefault("VAPI_MOCK", "1")
os.environ.setdefault("VOICE_STORE_PATH", "test_voice_store.json")
os.environ.setdefault("FRAB_BANK_API_URL", "")
# tests pass a phone in the request (no directory configured here)
os.environ.setdefault("VOICE_ALLOW_PHONE_OVERRIDE", "1")

import pytest
from fastapi.testclient import TestClient


class _FakeCases:
    """Case data without the bank API; ALT0999 simulates an unknown alert."""
    def get_case_context(self, case_id, alert_id):
        if alert_id == "ALT0999":
            return {"case_id": case_id, "alert_id": alert_id, "_customer_phone": "",
                    "_case_data_ok": True}
        return {"_case_data_ok": True, "case_id": case_id, "alert_id": alert_id,
                "case_type": "MULE_PATTERN", "customer_name": "Test Customer",
                "customer_id": "C1", "_customer_phone": ""}


@pytest.fixture(scope="module")
def client():
    # clean store
    if os.path.exists("test_voice_store.json"):
        os.remove("test_voice_store.json")
    from frab_voice import api
    api._service.cases = _FakeCases()
    yield TestClient(api.app)
    if os.path.exists("test_voice_store.json"):
        os.remove("test_voice_store.json")


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["vapi_mode"] == "mock"


def test_escalation_without_phone_fails_gracefully(client):
    # no phone in request and none resolvable (bank unreachable in tests) ->
    # the escalation is accepted but the call is recorded as FAILED, not a crash.
    r = client.post("/api/cases/CASE0999/voice-escalation", json={"alert_id": "ALT0999"})
    assert r.status_code == 200
    assert r.json()["status"] == "FAILED"


def test_escalation_starts_call(client):
    r = client.post("/api/cases/CASE0007/voice-escalation", json={
        "alert_id": "ALT0007", "customer_phone": "+910000000000",
        "frab_recommendation": "ESCALATE", "risk_tier": "HIGH",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["case_id"] == "CASE0007"
    assert body["call_id"].startswith("mock-call-")
    assert body["status"] == "CALLING"


def test_status_reflects_call(client):
    client.post("/api/cases/CASE0100/voice-escalation",
                json={"alert_id": "ALT0100", "customer_phone": "+910000000001"})
    r = client.get("/api/cases/CASE0100/voice")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in ("CALLING", "QUEUED")
    assert any(e["event"] == "VOICE_ESCALATION_REQUESTED" for e in body["timeline"])


def test_webhook_completes_call(client):
    start = client.post("/api/cases/CASE0200/voice-escalation",
                        json={"alert_id": "ALT0200", "customer_phone": "+910000000002"}).json()
    call_id = start["call_id"]
    webhook = {"message": {
        "type": "end-of-call-report", "call": {"id": call_id},
        "durationSeconds": 120, "endedReason": "hangup",
        "analysis": {"structuredData": {
            "verification_status": "VERIFIED", "call_outcome": "INFORMATION_OBTAINED",
            "summary": "Customer confirmed the transaction.",
            "key_statements": ["I authorised it"], "unresolved_questions": [],
            "consistency_assessment": "CONSISTENT", "customer_requested_human": False,
        }},
    }}
    wr = client.post("/api/voice/vapi/webhook", json=webhook)
    assert wr.status_code == 200

    r = client.get("/api/cases/CASE0200/voice").json()
    assert r["status"] == "COMPLETED"
    assert r["verification_status"] == "VERIFIED"
    assert r["summary"].startswith("Customer confirmed")
    assert len(r["recommended_actions"]) > 0
    assert any(e["event"] == "VOICE_CALL_COMPLETED" for e in r["timeline"])


def test_webhook_unknown_call_id_returns_200(client):
    r = client.post("/api/voice/vapi/webhook", json={
        "message": {"type": "status-update", "call": {"id": "nope"}, "status": "ringing"}})
    assert r.status_code == 200


def test_webhook_malformed_body_returns_200(client):
    r = client.post("/api/voice/vapi/webhook", content=b"not json",
                    headers={"Content-Type": "application/json"})
    assert r.status_code == 200


def test_status_updates_progress_then_report_decides(client):
    # Vapi sends several status-updates, then the end-of-call-report. Each
    # status must apply, and "ended" must NOT lock the call before the report.
    start = client.post("/api/cases/CASE0300/voice-escalation",
                        json={"alert_id": "ALT0300", "customer_phone": "+910000000003"}).json()
    cid = start["call_id"]
    for s in ("ringing", "in-progress", "ended"):
        client.post("/api/voice/vapi/webhook", json={
            "message": {"type": "status-update", "call": {"id": cid}, "status": s}})
        if s == "in-progress":
            assert client.get("/api/cases/CASE0300/voice").json()["status"] == "IN_PROGRESS"
    assert client.get("/api/cases/CASE0300/voice").json()["status"] == "IN_PROGRESS"
    client.post("/api/voice/vapi/webhook", json={"message": {
        "type": "end-of-call-report", "call": {"id": cid},
        "endedReason": "customer-did-not-answer"}})
    assert client.get("/api/cases/CASE0300/voice").json()["status"] == "UNREACHABLE"


def test_phone_must_be_e164(client):
    r = client.post("/api/cases/CASE0400/voice-escalation",
                    json={"alert_id": "ALT0400", "customer_phone": "12345"})
    assert r.status_code == 422


def test_webhook_rejects_non_object_and_unsafe_ids(client):
    assert client.post("/api/voice/vapi/webhook", json=[1, 2]).status_code == 200
    r = client.post("/api/voice/vapi/webhook", json={
        "message": {"type": "status-update", "call": {"id": "a/b"}, "status": "ringing"}})
    assert r.status_code == 200
