"""API request/response models for the Voice Service."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class VoiceEscalationRequest(BaseModel):
    """Sent by the FRAB backend/frontend when an analyst clicks VOICE ESCALATION.

    The FRAB case is the source of truth; the caller supplies the customer phone
    and any case values the bank bundle doesn't carry (recommendation, evidence
    summary, risk tier, verification Q/A).
    """
    alert_id: str = Field("", description="Alert id used to load the case bundle")
    # Optional: the service resolves the customer phone from the backend
    # directory (source of truth). Supplying it here overrides, e.g. for a demo.
    customer_phone: str = Field("", description="Optional override; E.164, e.g. +9198...")
    # optional case-derived overrides (from the FRAB case, not the browser)
    risk_tier: str = ""
    known_evidence: str = ""
    frab_recommendation: str = ""
    verification_question: str = ""
    verification_expected_answer: str = ""
    # allow any extra variable overrides the case wants to pass through
    extra_variables: dict[str, Any] = Field(default_factory=dict)


class EscalationStartResponse(BaseModel):
    case_id: str
    call_id: str
    status: str


class VoiceStatusResponse(BaseModel):
    case_id: str
    call_id: str | None = None
    status: str
    verification_status: str | None = None
    call_outcome: str | None = None
    summary: str = ""
    customer_statements: list[str] = Field(default_factory=list)
    unresolved_questions: list[str] = Field(default_factory=list)
    analyst_attention: list[str] = Field(default_factory=list)
    customer_requested_human: bool = False
    recommended_actions: list[str] = Field(default_factory=list)
    transcript: str = ""
    recording_reference: str | None = None
    timeline: list[dict[str, Any]] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    case_id: str = ""
    status: str = "FAILED"
    error: dict[str, str]
