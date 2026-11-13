"""FastAPI service (Phase 2).

The HTTP surface of the confidential worker. The FRAB backend calls these
endpoints; this file plus api_models.py IS the interface contract.

Endpoints:
  POST /investigate                       start an investigation
  GET  /investigate/{case_id}/status      current lifecycle state
  GET  /investigate/{case_id}/result      final structured result
  GET  /investigate/{case_id}/events      SSE stream of live investigation events
  GET  /health                            liveness + build info
  GET  /readiness                         subsystem readiness checks

Design notes:
  * The investigation runs in a background thread (see store.py); endpoints stay
    responsive and events stream live.
  * Errors are returned as structured ErrorResponse with a stable code, never a
    bare 500, so the backend can react deterministically.
"""

from __future__ import annotations

import json
import os
from typing import Any

import hmac

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from . import __version__
from .api_models import (
    ErrorCode,
    ErrorInfo,
    ErrorResponse,
    HealthResponse,
    InvestigationRequest,
    ReadinessComponent,
    ReadinessResponse,
    StartResponse,
    StatusResponse,
)
from .config import default_config
from .data_access import bank_for_alert, default_bank_data
from .llm import get_client, llm_mode_name
from .persistence import persistence_from_env
from .store import InvestigationStore

app = FastAPI(title="FRAB Confidential Investigation Worker", version=__version__)

# CORS — the frontend's 3D workspace consumes the SSE stream client-side, so the
# browser hits this worker directly. Allow the frontend origins. Configure extra
# origins via FRAB_CORS_ORIGINS (comma-separated); "*" allowed for dev/demo.
_default_origins = ",".join([
    "http://localhost:8080",
    "http://localhost:3000",
    "http://127.0.0.1:8080",
    "https://frab-frontend-rkv7mouqhq-el.a.run.app",
])
_cors_origins = os.environ.get("FRAB_CORS_ORIGINS", _default_origins)
if _cors_origins.strip() == "*":
    _origins_kwargs = {"allow_origins": ["*"]}
else:
    _origins_kwargs = {"allow_origins": [o.strip() for o in _cors_origins.split(",") if o.strip()]}

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    **_origins_kwargs,
)

# Durable result storage is opt-in (FRAB_STORE=firestore). If it is requested but
# cannot start, the worker fails at startup rather than silently losing results.
_store = InvestigationStore(persistence=persistence_from_env())

# Production (durable store) fails CLOSED: never run the investigation API open.
if os.environ.get("FRAB_STORE", "").strip().lower() == "firestore" \
        and not os.environ.get("FRAB_API_TOKEN", "").strip():
    raise RuntimeError("Refusing to start in production without FRAB_API_TOKEN.")


def require_api_token(request: Request) -> None:
    """Optional shared-token auth for the investigation endpoints.

    Enabled only when FRAB_API_TOKEN is set (unset = open, for dev and tests).
    The token may be sent as `?token=<value>` (needed because the browser's
    EventSource cannot set headers) or as `Authorization: Bearer <value>`.
    /health and /readiness stay open.
    """
    expected = os.environ.get("FRAB_API_TOKEN", "").strip()
    if not expected:
        return
    header = request.headers.get("authorization", "")
    supplied = header[7:].strip() if header.lower().startswith("bearer ") \
        else request.query_params.get("token", "").strip()
    if not supplied or not hmac.compare_digest(supplied.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid or missing API token.")


def _error(code: str, message: str, case_id: str = "", http_status: int = 400) -> JSONResponse:
    body = ErrorResponse(case_id=case_id, error=ErrorInfo(code=code, message=message))
    return JSONResponse(status_code=http_status, content=body.model_dump())


# --------------------------------------------------------------------------
# Investigation lifecycle
# --------------------------------------------------------------------------

@app.post("/investigate", response_model=StartResponse,
          dependencies=[Depends(require_api_token)])
def start_investigation(req: InvestigationRequest):
    trigger_id = req.alert.transaction_id

    # idempotent: a known case_id reports its real state and is not re-run
    existing = _store.get(req.case_id)
    if existing is not None:
        return StartResponse(case_id=req.case_id, status=existing.status)

    # this case's OWN data access (API mode: the alert's bundle, fetched now),
    # so concurrent cases never read each other's data
    try:
        bank = bank_for_alert(req.alert_id)
    except Exception as exc:  # noqa: BLE001
        return _error(ErrorCode.DATA_SOURCE_UNAVAILABLE,
                      f"Bank data unavailable for alert '{req.alert_id}': {exc}",
                      case_id=req.case_id, http_status=503)
    if req.alert_id and getattr(bank, "_fetched", False) and not getattr(bank, "_bundle", None):
        return _error(ErrorCode.INVALID_REQUEST, f"Alert '{req.alert_id}' not found.",
                      case_id=req.case_id, http_status=422)

    # validate the trigger exists before kicking off a background run
    try:
        txn = bank.get_transaction(trigger_id)
    except Exception as exc:  # noqa: BLE001
        return _error(ErrorCode.DATA_SOURCE_UNAVAILABLE, f"Bank data unavailable: {exc}",
                      case_id=req.case_id, http_status=503)
    if txn is None:
        return _error(
            ErrorCode.DATA_SOURCE_UNAVAILABLE,
            f"Trigger transaction '{trigger_id}' not found.",
            case_id=req.case_id, http_status=422,
        )

    # customer_id: the alert is the PRIMARY source when provided; the worker
    # derives it from the transaction only as a fallback. If the alert supplies
    # one that disagrees with the transaction owner, reject early — a mismatched
    # payload would investigate the wrong customer.
    if req.customer_id and req.customer_id != txn.get("customer_id"):
        return _error(
            ErrorCode.INVALID_REQUEST,
            f"alert.customer_id '{req.customer_id}' does not match the owner of "
            f"transaction '{trigger_id}' ('{txn.get('customer_id')}').",
            case_id=req.case_id, http_status=422,
        )

    state = _store.start(req.case_id, trigger_id, prior_alert_count=req.prior_alert_count,
                         alert_id=req.alert_id, alert_type=req.alert.type, bank=bank)
    return StartResponse(case_id=req.case_id, status=state.status)


@app.get("/investigate/{case_id}/status", response_model=StatusResponse,
         dependencies=[Depends(require_api_token)])
def get_status(case_id: str):
    state = _store.get(case_id)
    if state is None:
        return _error(ErrorCode.CASE_NOT_FOUND, f"No case '{case_id}'.",
                      case_id=case_id, http_status=404)
    return StatusResponse(
        case_id=case_id,
        status=state.status,
        current_agent=state.current_agent,
        current_event=state.current_event,
        completed_stages=state.completed_stages,
    )


@app.get("/investigate/{case_id}/result", dependencies=[Depends(require_api_token)])
def get_result(case_id: str):
    state = _store.get(case_id)
    if state is None:
        return _error(ErrorCode.CASE_NOT_FOUND, f"No case '{case_id}'.",
                      case_id=case_id, http_status=404)
    if state.result is None:
        return _error(ErrorCode.CASE_NOT_READY,
                      f"Investigation '{case_id}' has not completed.",
                      case_id=case_id, http_status=409)
    return JSONResponse(content=state.result)


@app.get("/investigate/{case_id}/events", dependencies=[Depends(require_api_token)])
def stream_events(case_id: str):
    state = _store.get(case_id)
    if state is None:
        return _error(ErrorCode.CASE_NOT_FOUND, f"No case '{case_id}'.",
                      case_id=case_id, http_status=404)

    def event_gen():
        # initial comment so the browser opens the stream immediately
        yield ": stream open\n\n"
        sent = 0
        idle = 0.0
        while True:
            new = state.wait_for_new(sent, timeout=1.0)
            for ev in new:
                yield f"event: {ev.get('event','MESSAGE')}\ndata: {json.dumps(ev, default=str)}\n\n"
            sent += len(new)
            if state.done and sent >= len(state.events):
                break
            # keepalive during long model calls, so proxies don't drop the stream
            idle = 0.0 if new else idle + 1.0
            if idle >= 15.0:
                idle = 0.0
                yield ": keepalive\n\n"
        # explicit terminal marker for the client to close cleanly
        yield "event: STREAM_END\ndata: {}\n\n"

    # SSE headers: disable buffering/caching so events flush in real time
    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# --------------------------------------------------------------------------
# Ops
# --------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(
        status="ok",
        version=__version__,
        llm_mode=llm_mode_name(),
    )


@app.get("/readiness", response_model=ReadinessResponse)
def readiness():
    components: list[ReadinessComponent] = []

    # data layer
    try:
        bank = default_bank_data()
        n = len(bank.get_transaction_history("C009001507"))
        components.append(ReadinessComponent(
            name="data_access", ready=n > 0, detail=f"{n} txns for probe customer"))
    except Exception as exc:  # noqa: BLE001
        components.append(ReadinessComponent(name="data_access", ready=False, detail=str(exc)))

    # config / scoring
    try:
        cfg = default_config()
        ready = abs(sum(cfg["weights"].values()) - 1.0) < 1e-6
        components.append(ReadinessComponent(name="scoring_config", ready=ready))
    except Exception as exc:  # noqa: BLE001
        components.append(ReadinessComponent(name="scoring_config", ready=False, detail=str(exc)))

    # regulatory corpus
    try:
        from .agents import Jurist
        corpus = Jurist().corpus
        components.append(ReadinessComponent(
            name="regulatory_corpus", ready=bool(corpus),
            detail=f"{len(corpus)} pattern entries"))
    except Exception as exc:  # noqa: BLE001
        components.append(ReadinessComponent(name="regulatory_corpus", ready=False, detail=str(exc)))

    # llm client (constructible; not a liveness ping in offline mode)
    try:
        client = get_client()
        components.append(ReadinessComponent(
            name="llm", ready=True, detail=f"mode={client.name}"))
    except Exception as exc:  # noqa: BLE001
        components.append(ReadinessComponent(name="llm", ready=False, detail=str(exc)))

    all_ready = all(c.ready for c in components)
    return ReadinessResponse(ready=all_ready, components=components)
