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

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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

app = FastAPI(title="FRAB Voice Escalation Service", version=__version__)

# Frontend origins allowed by default; override with VOICE_CORS_ORIGINS
# (comma-separated, or "*" for demo).
_DEFAULT_ORIGINS = ",".join([
    "http://localhost:8080",
    "https://frab-frontend-rkv7mouqhq-el.a.run.app",
    "https://frab-frontend-200002205070.asia-south1.run.app",
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
        "vapi_mode": "mock" if _vapi.mock else "live",
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
    call = _service.start_escalation(
        case_id, alert_id=req.alert_id, customer_phone=req.customer_phone,
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

    call_id = wh.extract_call_id(body)
    if not call_id:
        return JSONResponse(status_code=200, content={"received": True, "note": "no call id"})

    etype = wh.event_type(body)
    # DEBUG: log end-of-call payloads so we can see the assistant's actual
    # structured-output shape/field names. Temporary — remove after tuning.
    if os.environ.get("VOICE_DEBUG_WEBHOOK", "").lower() in ("1", "true", "on") \
            and etype in ("end-of-call-report", "end-of-call"):
        import json as _json
        msg = wh.extract_message(body)
        analysis = msg.get("analysis") if isinstance(msg, dict) else None
        artifact = msg.get("artifact") if isinstance(msg, dict) else None
        art_keys = list(artifact.keys()) if isinstance(artifact, dict) else None
        print("VOICE_WEBHOOK_EOC keys=", list(msg.keys()) if isinstance(msg, dict) else type(msg),
              " analysis=", _json.dumps(analysis)[:1500] if analysis else None,
              " artifact_keys=", art_keys,
              " artifact=", _json.dumps(artifact)[:3000] if artifact else None,
              " ended=", (msg or {}).get("endedReason"), flush=True)
    if etype in ("end-of-call-report", "end-of-call"):
        update = wh.parse_end_of_call(body)
        _service.apply_webhook(call_id, f"{call_id}:end-of-call", update,
                               new_status=update.get("status"))
    else:
        status = wh.map_status(body)
        _service.apply_webhook(call_id, f"{call_id}:{etype}", {}, new_status=status)

    return JSONResponse(status_code=200, content={"received": True})


@app.get("/api/cases/{case_id}/voice", response_model=VoiceStatusResponse,
         dependencies=[Depends(require_api_token)])
def get_voice_status(case_id: str):
    call = _store.latest_for_case(case_id)
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
