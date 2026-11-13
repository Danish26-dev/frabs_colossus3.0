"""Vapi client — creates outbound calls via the EXISTING assistant.

Uses Vapi's Create Call API. It references the pre-configured "FRAB Voice
Investigator" assistant by id and passes case-specific values through
assistantOverrides.variableValues. It never creates or modifies an assistant.

A mock mode (VAPI_MOCK=1 or missing config) simulates call creation so the
service runs end-to-end in dev/demo without placing real phone calls.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import httpx

from .config import VoiceConfig


class VapiError(RuntimeError):
    pass


class VapiClient:
    def __init__(self, cfg: VoiceConfig) -> None:
        self.cfg = cfg
        # mock if explicitly requested OR if real credentials are absent
        self.mock = cfg.mock or not cfg.configured

    def _resolve_phone_number_id(self) -> str:
        """Return the phone-number ID. If configured value looks like a phone
        number (starts with '+') instead of a UUID, resolve it to its ID via
        the Vapi phone-numbers list. Cached after first resolution."""
        configured = self.cfg.vapi_phone_number_id
        if not configured or not configured.startswith("+"):
            return configured  # already a UUID (or empty)
        # strip formatting to compare digits
        want = "".join(ch for ch in configured if ch.isdigit())
        headers = {"Authorization": f"Bearer {self.cfg.vapi_api_key}"}
        try:
            resp = httpx.get(f"{self.cfg.vapi_base_url}/phone-number",
                             headers=headers, timeout=15.0)
            if resp.status_code < 300:
                for pn in resp.json():
                    num = "".join(ch for ch in str(pn.get("number", "")) if ch.isdigit())
                    if num and num == want:
                        return pn["id"]
        except (httpx.HTTPError, ValueError, KeyError):
            pass
        # fall back to sending what we have (Vapi will error clearly if wrong)
        return configured

    def create_call(self, *, customer_number: str,
                    variable_values: dict[str, Any]) -> dict[str, Any]:
        """Create an outbound call on the existing assistant.

        Returns a dict with at least {"id": <call_id>, "status": ...}.
        """
        if self.mock:
            return self._mock_create(customer_number, variable_values)

        payload = {
            "assistantId": self.cfg.vapi_assistant_id,        # existing assistant
            "phoneNumberId": self._resolve_phone_number_id(),
            "customer": {"number": customer_number},
            "assistantOverrides": {"variableValues": variable_values},
        }
        headers = {
            "Authorization": f"Bearer {self.cfg.vapi_api_key}",
            "Content-Type": "application/json",
        }
        try:
            resp = httpx.post(f"{self.cfg.vapi_base_url}/call",
                              headers=headers, json=payload, timeout=30.0)
        except httpx.HTTPError as exc:
            raise VapiError(f"Vapi request failed: {exc}") from exc
        if resp.status_code >= 300:
            raise VapiError(f"Vapi create-call error {resp.status_code}: {resp.text[:300]}")
        try:
            return resp.json()
        except json.JSONDecodeError as exc:
            raise VapiError(f"Vapi returned non-JSON: {resp.text[:200]}") from exc

    # --- mock ----------------------------------------------------------------

    @staticmethod
    def _mock_create(customer_number: str, variable_values: dict[str, Any]) -> dict[str, Any]:
        # Deterministic-ish mock call id; status QUEUED like the real API.
        return {
            "id": f"mock-call-{uuid.uuid4().hex[:12]}",
            "status": "queued",
            "_mock": True,
            "_customer_number": customer_number,
            "_variable_keys": sorted(variable_values.keys()),
        }
