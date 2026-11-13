"""Durable storage for investigation results (so a refresh or restart can reload).

Opt-in: set FRAB_STORE=firestore (default is the in-memory store, unchanged).

Each case is ONE document in the `frab_investigations` collection (override with
FRAB_FIRESTORE_COLLECTION):

    case_id, status, alert_id, alert_type, error, completed_stages,
    created_at, updated_at,
    result_json   the full /result payload, as a JSON string
    events_json   the SSE event list, as a JSON string

The payloads are stored as JSON strings on purpose: Firestore rejects nested
arrays and restricts map keys, and the result is an arbitrary nested structure.
A string keeps it lossless. Documents are limited to ~1 MiB; if a record would
exceed that, the (large, regenerable) events are dropped first and the problem is
logged. Nothing here ever stores API keys or prompts.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Protocol

logger = logging.getLogger("frab_worker.persistence")

# stay safely under Firestore's 1 MiB document limit
_MAX_DOC_BYTES = 900_000


class CasePersistence(Protocol):
    def save(self, case_id: str, record: dict[str, Any]) -> None: ...
    def load(self, case_id: str) -> dict[str, Any] | None: ...


def build_record(*, case_id: str, status: str, alert_id: str, alert_type: str,
                 error: str, completed_stages: list[str],
                 result: dict[str, Any] | None,
                 events: list[dict[str, Any]], created_at: float) -> dict[str, Any]:
    """Assemble the document, enforcing the size budget."""
    result_json = json.dumps(result, default=str) if result is not None else ""
    events_json = json.dumps(events, default=str)
    if len(result_json) + len(events_json) > _MAX_DOC_BYTES:
        logger.error("case %s record too large (%d bytes); dropping events",
                     case_id, len(result_json) + len(events_json))
        events_json = "[]"
    if len(result_json) > _MAX_DOC_BYTES:
        logger.error("case %s result too large to persist (%d bytes)",
                     case_id, len(result_json))
        result_json = ""
    return {
        "case_id": case_id, "status": status, "alert_id": alert_id,
        "alert_type": alert_type, "error": error,
        "completed_stages": list(completed_stages),
        "created_at": created_at, "updated_at": time.time(),
        "result_json": result_json, "events_json": events_json,
    }


class InMemoryPersistence:
    """For tests: behaves like a durable store that outlives a worker."""

    def __init__(self) -> None:
        self.docs: dict[str, dict[str, Any]] = {}

    def save(self, case_id: str, record: dict[str, Any]) -> None:
        self.docs[case_id] = json.loads(json.dumps(record))

    def load(self, case_id: str) -> dict[str, Any] | None:
        doc = self.docs.get(case_id)
        return json.loads(json.dumps(doc)) if doc is not None else None


class FirestoreCasePersistence:
    def __init__(self, project: str | None = None,
                 collection: str | None = None) -> None:
        from google.cloud import firestore  # imported lazily
        self._db = firestore.Client(project=project) if project else firestore.Client()
        self._collection = collection or os.environ.get(
            "FRAB_FIRESTORE_COLLECTION", "frab_investigations")

    def save(self, case_id: str, record: dict[str, Any]) -> None:
        self._db.collection(self._collection).document(case_id).set(record)

    def load(self, case_id: str) -> dict[str, Any] | None:
        snap = self._db.collection(self._collection).document(case_id).get()
        return snap.to_dict() if snap.exists else None


def persistence_from_env() -> CasePersistence | None:
    """None (in-memory only) unless FRAB_STORE=firestore."""
    if os.environ.get("FRAB_STORE", "").strip().lower() == "firestore":
        return FirestoreCasePersistence(
            project=os.environ.get("GOOGLE_CLOUD_PROJECT") or None)
    return None
