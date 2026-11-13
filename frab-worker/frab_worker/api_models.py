"""API request/response models (Phase 2).

Pydantic models for the FastAPI service. These define the wire contract between
the FRAB backend (Danish) and this confidential worker. Kept deliberately small
and explicit — this file is effectively the API half of the interface contract.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AlertInfo(BaseModel):
    type: str = Field(..., description="Alert type from the bank rule engine, e.g. HIGH_VALUE_TRANSFER")
    severity: str = Field("MEDIUM", description="Bank-assigned severity: HIGH|MEDIUM|LOW")
    transaction_id: str = Field(..., description="Trigger transaction id, e.g. TX009955")


class InvestigationScope(BaseModel):
    history_days: int = 90
    network_depth: int = 2
    include_prior_alerts: bool = True


class InvestigationRequest(BaseModel):
    # letters, digits and _ . : - only (no "/", not "." or ".."): it is used as a
    # URL path segment and a Firestore document id
    case_id: str = Field(..., description="Caller-assigned case id",
                         pattern=r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")
    alert_id: str = Field("", description="Alert id from the bank")
    alert: AlertInfo
    customer_id: str = Field("", description="Optional; derived from the transaction if omitted")
    account_id: str = ""
    scope: InvestigationScope = Field(default_factory=InvestigationScope)
    prior_alert_count: int = 0


class StartResponse(BaseModel):
    case_id: str
    status: str = "STARTED"


class StatusResponse(BaseModel):
    case_id: str
    status: str                       # STARTED | RUNNING | COMPLETE | PARTIAL | FAILED
    current_agent: str = ""
    current_event: str = ""
    completed_stages: list[str] = Field(default_factory=list)


class ErrorInfo(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    case_id: str = ""
    status: str = "FAILED"
    error: ErrorInfo


# error codes surfaced to the backend
class ErrorCode:
    INVALID_REQUEST = "INVALID_REQUEST"
    CASE_NOT_FOUND = "CASE_NOT_FOUND"
    CASE_NOT_READY = "CASE_NOT_READY"
    DATA_SOURCE_UNAVAILABLE = "DATA_SOURCE_UNAVAILABLE"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class ReadinessComponent(BaseModel):
    name: str
    ready: bool
    detail: str = ""


class ReadinessResponse(BaseModel):
    ready: bool
    components: list[ReadinessComponent]


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    llm_mode: str
