"""Shared-token auth for the Voice Service.

Scheme (documented for the frontend):
  * The token is read from the VOICE_API_TOKEN environment variable (server side
    only; set it from Secret Manager, never commit it).
  * The client sends it as `Authorization: Bearer <token>` OR as `?token=<token>`.
  * If VOICE_API_TOKEN is unset/empty, auth is DISABLED (local dev and tests).
    Production deployments must set it.

The Vapi webhook is NOT covered by this token. It has its own optional secret
(VOICE_WEBHOOK_SECRET), checked against the `X-Vapi-Secret` header Vapi sends.
"""

from __future__ import annotations

import hmac
import os

from fastapi import HTTPException, Request


def _extract_token(request: Request) -> str:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return request.query_params.get("token", "").strip()


def require_api_token(request: Request) -> None:
    """FastAPI dependency: reject the request unless the shared token matches."""
    expected = os.environ.get("VOICE_API_TOKEN", "").strip()
    if not expected:
        return  # auth disabled
    supplied = _extract_token(request)
    if not supplied or not hmac.compare_digest(supplied.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid or missing API token.")


def check_webhook_secret(request: Request) -> bool:
    """True if the webhook secret is unset (disabled) or the header matches."""
    expected = os.environ.get("VOICE_WEBHOOK_SECRET", "").strip()
    if not expected:
        return True
    supplied = request.headers.get("x-vapi-secret", "").strip()
    return bool(supplied) and hmac.compare_digest(supplied.encode(), expected.encode())
