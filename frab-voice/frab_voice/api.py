"""FastAPI surface for the Voice Service.

Endpoints:
  POST /api/cases/{case_id}/voice-escalation   start a voice call
  POST /api/voice/vapi/webhook                 Vapi lifecycle webhook (public HTTPS)
  GET  /api/cases/{case_id}/voice              current status + result (poll)
  GET  /health

Secrets never leave this service. The frontend only ever talks to these
endpoints, never to Vapi directly.
"""

from __future__ import annotations

import os
import re

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from . import __version__
from .auth import check_webhook_secret, require_api_token
from .api_models import (
    EscalationStartResponse,
    VoiceEscalationRequest,
    VoiceStatusResponse,
)
from .case_source import BankApiCaseSource
from .config import load_config
from .models import CallStatus
from .service import VoiceEscalationService, recommended_actions
from .store import JsonVoiceStore, InMemoryVoiceStore, FirestoreVoiceStore
from .vapi_client import VapiClient
from . import webhook_parser as wh

_cfg = load_config()
_vapi = VapiClient(_cfg)
# Store backend, selected by VOICE_STORE:
#   firestore -> durable, shared across instances (retains full conversation);
#                the right choice for real calls on Cloud Run.
#   memory    -> in-process; only safe with a warm single instance (demo mock).
#   (default) -> JSON file; fine for local dev where the filesystem is durable,
#                but NOT reliable on Cloud Run's ephemeral filesystem.
_store_kind = os.environ.get("VOICE_STORE", "").lower()
if _store_kind == "firestore":
    _store = FirestoreVoiceStore(project=os.environ.get("GOOGLE_CLOUD_PROJECT") or None)
elif _store_kind == "memory":
    _store = InMemoryVoiceStore()
else:
    _store = JsonVoiceStore(_cfg.store_path)
_cases = BankApiCaseSource(_cfg.bank_api_url)
_service = VoiceEscalationService(_vapi, _store, _cases)

# Production (durable Firestore store) must fail CLOSED: refuse to start rather
# than run without auth, without a webhook secret, or with simulated calls.
if _store_kind == "firestore":
    _missing = [n for n in ("VOICE_API_TOKEN", "VOICE_WEBHOOK_SECRET")
                if not os.environ.get(n, "").strip()]
    if _vapi.mock:
        _missing.append("VAPI_MOCK must be off")
    elif not _cfg.configured:
        _missing.append("VAPI_API_KEY/VAPI_ASSISTANT_ID/VAPI_PHONE_NUMBER_ID")
    if _missing:
        raise RuntimeError("Refusing to start in production; missing: " + ", ".join(_missing))

_E164 = re.compile(r"^\+[1-9]\d{6,14}$")
_SAFE_CALL_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")


def _phone_override_allowed() -> bool:
    return os.environ.get("VOICE_ALLOW_PHONE_OVERRIDE", "").lower() in ("1", "true", "on")

app = FastAPI(title="FRAB Voice Escalation Service", version=__version__)

# Frontend origins allowed by default; override with VOICE_CORS_ORIGINS
# (comma-separated, or "*" for demo).
_DEFAULT_ORIGINS = ",".join([
    "http://localhost:8080",
    "https://frab-frontend-rkv7mouqhq-el.a.run.app",
])
_origins = os.environ.get("VOICE_CORS_ORIGINS", _DEFAULT_ORIGINS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _origins.strip() == "*" else
        [o.strip() for o in _origins.split(",") if o.strip()],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": __version__,
        "vapi_mode": _vapi.mode,
        "assistant_configured": bool(_cfg.vapi_assistant_id),
    }


@app.post("/api/cases/{case_id}/voice-escalation", response_model=EscalationStartResponse,
          dependencies=[Depends(require_api_token)])
def start_voice_escalation(case_id: str, req: VoiceEscalationRequest):
    overrides = {
        "risk_tier": req.risk_tier,
        "known_evidence": req.known_evidence,
        "frab_recommendation": req.frab_recommendation,
        "verification_question": req.verification_question,
        "verification_expected_answer": req.verification_expected_answer,
        **req.extra_variables,
    }
    # the backend directory decides who is called; a phone in the request is
    # only honoured when explicitly enabled (local testing), and must be E.164
    phone_override = ""
    if req.customer_phone and _phone_override_allowed():
        if not _E164.match(req.customer_phone):
            return JSONResponse(status_code=422, content={
                "case_id": case_id, "status": "FAILED",
                "error": {"code": "INVALID_REQUEST",
                          "message": "customer_phone must be E.164, e.g. +919800000000"}})
        phone_override = req.customer_phone
    call = _service.start_escalation(
        case_id, alert_id=req.alert_id, customer_phone=phone_override,
        overrides={k: v for k, v in overrides.items() if v != ""},
    )
    return EscalationStartResponse(
        case_id=case_id, call_id=call.call_id, status=call.status,
    )


@app.post("/api/voice/vapi/webhook")
async def vapi_webhook(request: Request):
    """Vapi calls this on lifecycle events. Must be idempotent + fast 2xx."""
    if not check_webhook_secret(request):
        return JSONResponse(status_code=401, content={"error": "invalid webhook secret"})
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001 - malformed body, ack to stop retries
        return JSONResponse(status_code=200, content={"received": True})
    if not isinstance(body, dict) or not isinstance(wh.extract_message(body), dict):
        return JSONResponse(status_code=200, content={"received": True, "note": "ignored"})

    call_id = wh.extract_call_id(body)
    if not isinstance(call_id, str) or not _SAFE_CALL_ID.match(call_id):
        return JSONResponse(status_code=200, content={"received": True, "note": "no call id"})

    etype = wh.event_type(body)
    # Optional diagnostics: payload SHAPE only (key names), never content —
    # the payload holds the transcript, recording links and the prompt.
    if os.environ.get("VOICE_DEBUG_WEBHOOK", "").lower() in ("1", "true", "on") \
            and etype in ("end-of-call-report", "end-of-call"):
        msg = wh.extract_message(body)
        artifact = msg.get("artifact") if isinstance(msg.get("artifact"), dict) else {}
        print("VOICE_WEBHOOK_EOC keys=", sorted(msg.keys()),
              " artifact_keys=", sorted(artifact.keys()),
              " ended=", msg.get("endedReason"), flush=True)

    # store calls are blocking (Firestore): keep them off the event loop
    if etype in ("end-of-call-report", "end-of-call"):
        update = wh.parse_end_of_call(body)
        await run_in_threadpool(_service.apply_webhook, call_id, f"{call_id}:end-of-call",
                                update, new_status=update.get("status"))
    elif etype == "status-update":
        status = wh.map_status(body)
        if status:
            # one key per status value, so ringing -> in-progress both apply
            await run_in_threadpool(
                _service.apply_webhook, call_id,
                f"{call_id}:status-update:{wh.raw_status(body)}", {}, new_status=status)
    # other message types (conversation/speech updates) carry no state change

    return JSONResponse(status_code=200, content={"received": True})


@app.get("/api/cases/{case_id}/voice", response_model=VoiceStatusResponse,
         dependencies=[Depends(require_api_token)])
def get_voice_status(case_id: str):
    call = _store.latest_for_case(case_id)
    if call is not None:
        # a call still "active" long after it started is checked against Vapi,
        # so a lost webhook can never leave the case stuck at CALLING
        call = _service.reconcile(call)
    timeline = _store.timeline_for_case(case_id)
    if call is None:
        return VoiceStatusResponse(case_id=case_id, status="NONE", timeline=timeline)

    actions = []
    if call.status in (CallStatus.COMPLETED,):
        actions = recommended_actions(
            call.structured_assessment.get("frab_recommendation", ""),
            call.structured_assessment,
        )
    return VoiceStatusResponse(
        case_id=case_id, call_id=call.call_id, status=call.status,
        verification_status=call.verification_status,
        call_outcome=call.call_outcome, summary=call.summary,
        customer_statements=call.customer_statements,
        unresolved_questions=call.unresolved_questions,
        analyst_attention=call.analyst_attention,
        customer_requested_human=call.customer_requested_human,
        recommended_actions=actions,
        transcript=call.transcript,
        recording_reference=call.recording_reference,
        timeline=timeline,
    )
