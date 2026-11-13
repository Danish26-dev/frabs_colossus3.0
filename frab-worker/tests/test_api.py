"""API tests using FastAPI TestClient: lifecycle, errors, SSE, readiness."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from frab_worker.api import app


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def _poll_until_done(client, case_id, tries=100):
    for _ in range(tries):
        st = client.get(f"/investigate/{case_id}/status").json()
        if st["status"] in ("COMPLETE", "PARTIAL", "FAILED"):
            return st
        time.sleep(0.02)
    raise AssertionError("investigation did not finish in time")


def _start(client, case_id, tx, atype="MULE_PATTERN"):
    return client.post("/investigate", json={
        "case_id": case_id, "alert_id": "ALT",
        "alert": {"type": atype, "severity": "HIGH", "transaction_id": tx},
    })


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_readiness_all_ready(client):
    r = client.get("/readiness")
    assert r.status_code == 200
    body = r.json()
    assert body["ready"] is True
    names = {c["name"] for c in body["components"]}
    assert {"data_access", "scoring_config", "regulatory_corpus", "llm"} <= names


def test_full_lifecycle_scn07(client, oracle):
    scn = oracle["SCN07"]
    r = _start(client, "API-CASE-07", scn["trigger_transaction_id"])
    assert r.status_code == 200
    assert r.json()["status"] == "STARTED"

    st = _poll_until_done(client, "API-CASE-07")
    assert st["status"] == "COMPLETE"

    res = client.get("/investigate/API-CASE-07/result").json()
    assert res["recommendation"]["action"] == "ESCALATE"
    assert res["risk"]["level"] == "HIGH"
    assert res["observed_pattern"] == "MULE_COLLECTION"
    assert len(res["evidence"]) >= 1
    # every finding references known evidence (contract guarantee)
    ids = {e["evidence_id"] for e in res["evidence"]}
    for f in res["findings"]:
        assert set(f["evidence_refs"]) <= ids


def test_unknown_trigger_returns_structured_error(client):
    r = _start(client, "API-CASE-BAD", "TX_DOES_NOT_EXIST")
    assert r.status_code == 422
    body = r.json()
    assert body["error"]["code"] == "DATA_SOURCE_UNAVAILABLE"


def test_status_unknown_case_404(client):
    r = client.get("/investigate/NOPE/status")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "CASE_NOT_FOUND"


def test_result_not_ready_conflict(client, oracle):
    # start but don't wait; result should 409 until done (race-tolerant)
    scn = oracle["SCN01"]
    _start(client, "API-CASE-01", scn["trigger_transaction_id"], atype="HIGH_VALUE")
    r = client.get("/investigate/API-CASE-01/result")
    assert r.status_code in (200, 409)
    if r.status_code == 409:
        assert r.json()["error"]["code"] == "CASE_NOT_READY"


def test_sse_stream_emits_terminal_event(client, oracle):
    scn = oracle["SCN03"]
    _start(client, "API-CASE-03", scn["trigger_transaction_id"], atype="STRUCTURING_PATTERN")
    events = []
    with client.stream("GET", "/investigate/API-CASE-03/events") as s:
        for line in s.iter_lines():
            if line.startswith("event:"):
                events.append(line.split(": ", 1)[1])
    assert events[0] == "CASE_STARTED"
    # a terminal investigation event, then the stream-close marker
    assert "INVESTIGATION_COMPLETE" in events or "INVESTIGATION_PARTIAL" in events
    assert events[-1] == "STREAM_END"
    assert "EVIDENCE_DISCOVERED" in events


def test_flagship_scn10_closes_via_api(client, oracle):
    scn = oracle["SCN10"]
    _start(client, "API-CASE-10", scn["trigger_transaction_id"], atype="HIGH_VALUE_TRANSFER")
    _poll_until_done(client, "API-CASE-10")
    res = client.get("/investigate/API-CASE-10/result").json()
    assert res["recommendation"]["action"] == "CLOSE"
    assert res["risk"]["level"] == "LOW"


def test_matching_customer_id_accepted(client, oracle):
    scn = oracle["SCN07"]
    r = client.post("/investigate", json={
        "case_id": "API-CID-OK", "alert_id": "ALT",
        "alert": {"type": "MULE_PATTERN", "severity": "HIGH",
                  "transaction_id": scn["trigger_transaction_id"]},
        "customer_id": scn["customer_id"],  # correct owner
    })
    assert r.status_code == 200


def test_mismatched_customer_id_rejected(client, oracle):
    scn = oracle["SCN07"]
    r = client.post("/investigate", json={
        "case_id": "API-CID-BAD", "alert_id": "ALT",
        "alert": {"type": "MULE_PATTERN", "severity": "HIGH",
                  "transaction_id": scn["trigger_transaction_id"]},
        "customer_id": "C000000000",  # wrong owner
    })
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_REQUEST"
