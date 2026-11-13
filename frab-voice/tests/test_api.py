"""API tests via TestClient. Runs in mock Vapi mode (no key set), so no real
calls or network to Vapi. Uses a temp store path per test session."""

from __future__ import annotations

import os

os.environ.setdefault("VAPI_MOCK", "1")
os.environ.setdefault("VOICE_STORE_PATH", "test_voice_store.json")
os.environ.setdefault("FRAB_BANK_API_URL", "")  # FakeCaseSource-like: bank unreachable -> empty ctx

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    # clean store
    if os.path.exists("test_voice_store.json"):
        os.remove("test_voice_store.json")
    from frab_voice.api import app
    return TestClient(app)


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
                json={"alert_id": "ALT0100", "customer_phone": "+91"})
    r = client.get("/api/cases/CASE0100/voice")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in ("CALLING", "QUEUED")
    assert any(e["event"] == "VOICE_ESCALATION_REQUESTED" for e in body["timeline"])


def test_webhook_completes_call(client):
    start = client.post("/api/cases/CASE0200/voice-escalation",
                        json={"alert_id": "ALT0200", "customer_phone": "+91"}).json()
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
