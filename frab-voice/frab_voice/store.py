"""Voice-call persistence.

An interface (VoiceStore) with a thread-safe JSON-file implementation for
dev/demo, and an in-memory one for tests. Swappable for Firestore later without
touching the rest of the service — the API/webhook only depend on this interface.

Records are keyed by call_id (a case may have multiple escalations). We also
keep an append-only timeline of voice events per case for the audit trail.
"""

from __future__ import annotations

import json
import os
import threading
from typing import Any, Protocol

from .models import VoiceCall


class VoiceStore(Protocol):
    def save(self, call: VoiceCall) -> None: ...
    def get(self, call_id: str) -> VoiceCall | None: ...
    def list_for_case(self, case_id: str) -> list[VoiceCall]: ...
    def latest_for_case(self, case_id: str) -> VoiceCall | None: ...
    def add_timeline_event(self, case_id: str, event: dict[str, Any]) -> None: ...
    def timeline_for_case(self, case_id: str) -> list[dict[str, Any]]: ...


class InMemoryVoiceStore:
    """Non-persistent store (tests)."""

    def __init__(self) -> None:
        self._calls: dict[str, VoiceCall] = {}
        self._timeline: dict[str, list[dict[str, Any]]] = {}
        self._lock = threading.Lock()

    def save(self, call: VoiceCall) -> None:
        with self._lock:
            self._calls[call.call_id] = call

    def get(self, call_id: str) -> VoiceCall | None:
        with self._lock:
            return self._calls.get(call_id)

    def list_for_case(self, case_id: str) -> list[VoiceCall]:
        with self._lock:
            return [c for c in self._calls.values() if c.case_id == case_id]

    def latest_for_case(self, case_id: str) -> VoiceCall | None:
        calls = sorted(self.list_for_case(case_id), key=lambda c: c.created_at)
        return calls[-1] if calls else None

    def add_timeline_event(self, case_id: str, event: dict[str, Any]) -> None:
        with self._lock:
            self._timeline.setdefault(case_id, []).append(event)

    def timeline_for_case(self, case_id: str) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._timeline.get(case_id, []))


class JsonVoiceStore:
    """Thread-safe JSON-file store for dev/demo. Persists across restarts so a
    page refresh does not lose the result."""

    def __init__(self, path: str) -> None:
        self.path = path
        self._lock = threading.Lock()
        self._data = {"calls": {}, "timeline": {}}
        self._load()

    def _load(self) -> None:
        if os.path.exists(self.path):
            try:
                with open(self.path, encoding="utf-8") as fh:
                    self._data = json.load(fh)
            except (json.JSONDecodeError, OSError):
                self._data = {"calls": {}, "timeline": {}}
        self._data.setdefault("calls", {})
        self._data.setdefault("timeline", {})

    def _flush(self) -> None:
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(self._data, fh, indent=2)
        os.replace(tmp, self.path)

    def save(self, call: VoiceCall) -> None:
        with self._lock:
            self._data["calls"][call.call_id] = call.to_dict() | {
                "processed_events": call.processed_events,
            }
            self._flush()

    def get(self, call_id: str) -> VoiceCall | None:
        with self._lock:
            raw = self._data["calls"].get(call_id)
            return VoiceCall.from_dict(raw) if raw else None

    def list_for_case(self, case_id: str) -> list[VoiceCall]:
        with self._lock:
            return [VoiceCall.from_dict(r) for r in self._data["calls"].values()
                    if r.get("case_id") == case_id]

    def latest_for_case(self, case_id: str) -> VoiceCall | None:
        calls = sorted(self.list_for_case(case_id), key=lambda c: c.created_at)
        return calls[-1] if calls else None

    def add_timeline_event(self, case_id: str, event: dict[str, Any]) -> None:
        with self._lock:
            self._data["timeline"].setdefault(case_id, []).append(event)
            self._flush()

    def timeline_for_case(self, case_id: str) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._data["timeline"].get(case_id, []))


class FirestoreVoiceStore:
    """Durable store backed by Google Cloud Firestore.

    Survives restarts and is shared across Cloud Run instances, so the full
    conversation (assessment + transcript) is retained and readable regardless
    of which instance serves a poll. Two collections:
      voice_calls/{call_id}        -> the VoiceCall record (incl. transcript)
      voice_timeline/{case_id}     -> {"events": [ ...append-only... ]}
    """

    def __init__(self, project: str | None = None,
                 calls_collection: str = "voice_calls",
                 timeline_collection: str = "voice_timeline") -> None:
        from google.cloud import firestore  # imported lazily
        self._db = firestore.Client(project=project) if project else firestore.Client()
        self._firestore = firestore
        self._calls = calls_collection
        self._timeline = timeline_collection

    def save(self, call: VoiceCall) -> None:
        doc = call.to_dict() | {"processed_events": call.processed_events}
        self._db.collection(self._calls).document(call.call_id).set(doc)

    def get(self, call_id: str) -> VoiceCall | None:
        snap = self._db.collection(self._calls).document(call_id).get()
        return VoiceCall.from_dict(snap.to_dict()) if snap.exists else None

    def list_for_case(self, case_id: str) -> list[VoiceCall]:
        q = self._db.collection(self._calls).where("case_id", "==", case_id)
        return [VoiceCall.from_dict(d.to_dict()) for d in q.stream()]

    def latest_for_case(self, case_id: str) -> VoiceCall | None:
        calls = sorted(self.list_for_case(case_id), key=lambda c: c.created_at)
        return calls[-1] if calls else None

    def add_timeline_event(self, case_id: str, event: dict[str, Any]) -> None:
        ref = self._db.collection(self._timeline).document(case_id)
        ref.set({"events": self._firestore.ArrayUnion([event])}, merge=True)

    def timeline_for_case(self, case_id: str) -> list[dict[str, Any]]:
        snap = self._db.collection(self._timeline).document(case_id).get()
        if not snap.exists:
            return []
        return list((snap.to_dict() or {}).get("events", []))
