"""Deterministic sequence-pattern detection (Phase 1).

Unlike the scalar features in features.py (which measure a single trigger against
a baseline), these detectors look at a SEQUENCE of transactions around the
trigger and classify a named financial-crime pattern. This is the work that the
Detective agent owns; the LLM never classifies the pattern — it narrates the
deterministic result.

Patterns detected:
  STRUCTURING       — several transfers each just under a reporting threshold,
                      to the same beneficiary, within a window.
  REPEATED_CASHOUT  — an inbound credit followed by repeated cash-outs.
  MULE_COLLECTION   — many distinct senders converge on one destination
                      (fan-in; complements features.network_risk).
  VELOCITY_BURST    — many outgoing transfers in a very short window.

Each detector returns a PatternResult with the evidence transactions so every
claim is traceable. `classify()` runs them in priority order and returns the
single best-supported observed_pattern label (or NONE).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from .data_access import BankData

OUTGOING_TYPES = {"PAYMENT", "TRANSFER", "CASH_OUT", "DEBIT"}
INBOUND_TYPES = {"CASH_IN"}


@dataclass
class PatternResult:
    detected: bool
    pattern: str                      # e.g. "STRUCTURING" or "NONE"
    confidence: float                 # 0..1 deterministic support level
    evidence: dict[str, Any] = field(default_factory=dict)
    transaction_ids: list[str] = field(default_factory=list)
    note: str = ""


# --- config defaults (kept here; can be lifted into scoring.yaml later) ----
_STRUCTURING_THRESHOLD = 200_000.0     # INR reporting-adjacent threshold
_STRUCTURING_BAND = 0.85               # "just under" = within 85%..100% of threshold
_STRUCTURING_MIN_COUNT = 3
_STRUCTURING_WINDOW_HOURS = 24

_CASHOUT_MIN_COUNT = 3
_CASHOUT_WINDOW_MINUTES = 90

_VELOCITY_MIN_COUNT = 5
_VELOCITY_WINDOW_MINUTES = 15


def _window(txns, center, before_delta, after_delta):
    lo = center - before_delta
    hi = center + after_delta
    return [t for t in txns if lo <= t["_event_dt"] <= hi]


def detect_structuring(trigger, bank: BankData) -> PatternResult:
    """Multiple sub-threshold transfers to the SAME beneficiary in a window."""
    if trigger["type"] != "TRANSFER" or trigger.get("destination_type") != "ACCOUNT":
        return PatternResult(False, "NONE", 0.0, note="Trigger is not an account transfer.")

    dest = trigger["nameDest"]
    cust = trigger["customer_id"]
    # look at this customer's transfers to this destination in the window
    history = bank.get_transaction_history(cust, before=trigger["_event_dt"])
    window_start = trigger["_event_dt"] - timedelta(hours=_STRUCTURING_WINDOW_HOURS)
    same_dest = [
        t for t in history
        if t["nameDest"] == dest and t["type"] == "TRANSFER"
        and t["_event_dt"] >= window_start
    ]
    group = same_dest + [trigger]

    lo = _STRUCTURING_THRESHOLD * _STRUCTURING_BAND
    sub_threshold = [t for t in group if lo <= t["amount"] < _STRUCTURING_THRESHOLD]

    if len(sub_threshold) >= _STRUCTURING_MIN_COUNT:
        conf = min(1.0, len(sub_threshold) / (_STRUCTURING_MIN_COUNT + 1))
        amounts = [round(t["amount"], 2) for t in sub_threshold]
        return PatternResult(
            True, "STRUCTURING", conf,
            evidence={
                "beneficiary": dest,
                "threshold": _STRUCTURING_THRESHOLD,
                "transfer_count": len(sub_threshold),
                "amounts": amounts,
                "window_hours": _STRUCTURING_WINDOW_HOURS,
            },
            transaction_ids=[t["transaction_id"] for t in sub_threshold],
            note=(f"{len(sub_threshold)} transfers just below the "
                  f"{_STRUCTURING_THRESHOLD:.0f} threshold to the same beneficiary."),
        )
    return PatternResult(False, "NONE", 0.0, note="No structuring pattern found.")


def detect_repeated_cashout(trigger, bank: BankData) -> PatternResult:
    """Repeated cash-outs (often after an inbound credit) in a short window."""
    cust = trigger["customer_id"]
    history = bank.get_transaction_history(cust, before=trigger["_event_dt"])
    # symmetric-ish window: include the trigger and recent cash-outs before it
    lo = trigger["_event_dt"] - timedelta(minutes=_CASHOUT_WINDOW_MINUTES)
    recent = [t for t in history if t["_event_dt"] >= lo]
    group = recent + [trigger]

    cashouts = [t for t in group if t["type"] == "CASH_OUT"]
    inbound = [t for t in group if t["type"] in INBOUND_TYPES]

    if len(cashouts) >= _CASHOUT_MIN_COUNT:
        conf = min(1.0, len(cashouts) / (_CASHOUT_MIN_COUNT + 2))
        return PatternResult(
            True, "REPEATED_CASHOUT", conf,
            evidence={
                "cashout_count": len(cashouts),
                "window_minutes": _CASHOUT_WINDOW_MINUTES,
                "preceded_by_inbound": len(inbound) > 0,
                "cashout_amounts": [round(t["amount"], 2) for t in cashouts],
            },
            transaction_ids=[t["transaction_id"] for t in cashouts],
            note=(f"{len(cashouts)} cash-outs within {_CASHOUT_WINDOW_MINUTES} "
                  f"minutes" + (" following an inbound credit." if inbound else ".")),
        )
    return PatternResult(False, "NONE", 0.0, note="No repeated-cashout pattern found.")


def detect_mule_collection(trigger, bank: BankData) -> PatternResult:
    """Many distinct senders converge on the trigger's destination (fan-in)."""
    dest = trigger["nameDest"]
    if trigger.get("destination_type") != "ACCOUNT":
        return PatternResult(False, "NONE", 0.0, note="Destination is not an account.")
    half = timedelta(minutes=30)
    to_dest = bank.get_transactions_to_destination(dest)
    in_window = [
        t for t in to_dest
        if trigger["_event_dt"] - half <= t["_event_dt"] <= trigger["_event_dt"] + half
    ]
    senders = {t["customer_id"] for t in in_window} | {trigger["customer_id"]}
    if len(senders) >= 4:
        conf = min(1.0, len(senders) / 5)
        return PatternResult(
            True, "MULE_COLLECTION", conf,
            evidence={"destination": dest, "distinct_senders": len(senders)},
            transaction_ids=[t["transaction_id"] for t in in_window],
            note=f"{len(senders)} distinct customers sent funds to {dest} in a tight window.",
        )
    return PatternResult(False, "NONE", 0.0, note="No mule-collection fan-in found.")


def detect_velocity_burst(trigger, bank: BankData) -> PatternResult:
    """Many outgoing transactions in a very short window."""
    cust = trigger["customer_id"]
    history = bank.get_transaction_history(cust, before=trigger["_event_dt"])
    lo = trigger["_event_dt"] - timedelta(minutes=_VELOCITY_WINDOW_MINUTES)
    burst = [t for t in history if t["_event_dt"] >= lo and t["type"] in OUTGOING_TYPES]
    count = len(burst) + 1
    if count >= _VELOCITY_MIN_COUNT:
        conf = min(1.0, count / (_VELOCITY_MIN_COUNT + 3))
        return PatternResult(
            True, "VELOCITY_BURST", conf,
            evidence={"count": count, "window_minutes": _VELOCITY_WINDOW_MINUTES},
            transaction_ids=[t["transaction_id"] for t in burst] + [trigger["transaction_id"]],
            note=f"{count} outgoing transactions within {_VELOCITY_WINDOW_MINUTES} minutes.",
        )
    return PatternResult(False, "NONE", 0.0, note="No velocity burst found.")


# priority order: more specific / higher-severity patterns first
_DETECTORS = (
    detect_mule_collection,
    detect_structuring,
    detect_velocity_burst,
    detect_repeated_cashout,
)

# Per-pattern escalation severity. Not every named pattern is an ESCALATE-tier
# concern: structuring / mule collection strongly indicate laundering, while a
# burst or a repeated cash-out is a MONITOR-tier layering indicator that
# warrants attention but not automatic escalation.
PATTERN_SEVERITY = {
    "STRUCTURING": "HIGH",
    "MULE_COLLECTION": "HIGH",
    "VELOCITY_BURST": "HIGH",
    "REPEATED_CASHOUT": "MEDIUM",
    "NONE": "LOW",
}


def pattern_severity(pattern: str) -> str:
    return PATTERN_SEVERITY.get(pattern, "MEDIUM")


def classify(trigger_transaction_id: str, bank: BankData) -> PatternResult:
    """Run all detectors and return the single best-supported pattern.

    Returns a NONE PatternResult if nothing fires. Detective owns this call; the
    resulting label is what Jurist later maps to regulatory context.
    """
    trigger = bank.get_transaction(trigger_transaction_id)
    if trigger is None:
        raise KeyError(f"Trigger transaction '{trigger_transaction_id}' not found.")

    best: PatternResult | None = None
    for detector in _DETECTORS:
        result = detector(trigger, bank)
        if result.detected:
            if best is None or result.confidence > best.confidence:
                best = result
            # keep priority: if the first (highest-priority) detector fires
            # strongly, prefer it. We already iterate in priority order, so the
            # first detected pattern with solid confidence wins ties.
            if best is result and result.confidence >= 0.75:
                return best
    return best or PatternResult(False, "NONE", 0.0, note="No named pattern detected.")
