"""Domain models for the Voice Service: statuses, call records, assessment."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


class CallStatus:
    QUEUED = "QUEUED"
    CALLING = "CALLING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    UNREACHABLE = "UNREACHABLE"
    VOICE_ASSESSMENT_PENDING = "VOICE_ASSESSMENT_PENDING"

    ACTIVE = {QUEUED, CALLING, IN_PROGRESS}
    TERMINAL = {COMPLETED, FAILED, UNREACHABLE, VOICE_ASSESSMENT_PENDING}
    ALL = ACTIVE | TERMINAL


# audit timeline event types the Voice Service contributes to a case
class VoiceEvent:
    ESCALATION_REQUESTED = "VOICE_ESCALATION_REQUESTED"
    CALL_STARTED = "VOICE_CALL_STARTED"
    CALL_VERIFIED = "VOICE_CALL_VERIFIED"
    CALL_COMPLETED = "VOICE_CALL_COMPLETED"
    ASSESSMENT_RECEIVED = "VOICE_ASSESSMENT_RECEIVED"
    ASSESSMENT_PENDING = "VOICE_ASSESSMENT_PENDING"
    CALL_FAILED = "VOICE_CALL_FAILED"


@dataclass
class VoiceCall:
    """A single voice escalation. Keyed by call_id (a case may have several)."""

    call_id: str
    case_id: str
    status: str = CallStatus.QUEUED
    created_at: str = ""
    started_at: str | None = None
    ended_at: str | None = None
    duration_seconds: int | None = None
    case_type: str = ""
    verification_status: str | None = None
    call_outcome: str | None = None
    structured_assessment: dict[str, Any] = field(default_factory=dict)
    summary: str = ""
    customer_statements: list[str] = field(default_factory=list)
    unresolved_questions: list[str] = field(default_factory=list)
    analyst_attention: list[str] = field(default_factory=list)
    customer_requested_human: bool = False
    transcript_reference: str | None = None
    recording_reference: str | None = None
    # full conversation content (durably stored)
    transcript: str = ""
    transcript_messages: list[dict[str, Any]] = field(default_factory=list)
    # webhook idempotency: which (event_type) messages we've already applied
    processed_events: list[str] = field(default_factory=list)
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "call_id": self.call_id,
            "case_id": self.case_id,
            "status": self.status,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "duration_seconds": self.duration_seconds,
            "case_type": self.case_type,
            "verification_status": self.verification_status,
            "call_outcome": self.call_outcome,
            "structured_assessment": self.structured_assessment,
            "summary": self.summary,
            "customer_statements": self.customer_statements,
            "unresolved_questions": self.unresolved_questions,
            "analyst_attention": self.analyst_attention,
            "customer_requested_human": self.customer_requested_human,
            "transcript_reference": self.transcript_reference,
            "recording_reference": self.recording_reference,
            "transcript": self.transcript,
            "transcript_messages": self.transcript_messages,
            "error": self.error,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "VoiceCall":
        known = {f.name for f in cls.__dataclass_fields__.values()}
        return cls(**{k: v for k, v in d.items() if k in known})
