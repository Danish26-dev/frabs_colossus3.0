"""Server-side configuration for the Voice Service.

All Vapi secrets live here, read from the environment. They are NEVER returned
to the frontend and NEVER logged.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass
class VoiceConfig:
    vapi_api_key: str
    vapi_assistant_id: str
    vapi_phone_number_id: str
    vapi_base_url: str
    bank_api_url: str
    store_path: str
    mock: bool

    @property
    def configured(self) -> bool:
        """True if real Vapi calls are possible (key + assistant + phone set)."""
        return bool(self.vapi_api_key and self.vapi_assistant_id
                    and self.vapi_phone_number_id)


def load_config() -> VoiceConfig:
    return VoiceConfig(
        vapi_api_key=os.environ.get("VAPI_API_KEY", ""),
        vapi_assistant_id=os.environ.get("VAPI_ASSISTANT_ID", ""),
        vapi_phone_number_id=os.environ.get("VAPI_PHONE_NUMBER_ID", ""),
        vapi_base_url=os.environ.get("VAPI_BASE_URL", "https://api.vapi.ai"),
        bank_api_url=os.environ.get(
            "FRAB_BANK_API_URL",
            "https://frab-git-379796489354.asia-south1.run.app",
        ),
        store_path=os.environ.get("VOICE_STORE_PATH", "voice_store.json"),
        # mock mode: simulate Vapi without a key (dev/demo/tests)
        mock=os.environ.get("VAPI_MOCK", "").lower() in ("1", "true", "on"),
    )
