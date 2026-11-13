"""Deterministic feature extraction (Phase 0).

Each feature turns raw bank data into a normalized 0.0 (no concern) .. 1.0 (max
concern) value, and returns the raw evidence behind it. The LLM never computes
these — they are the ground truth the reasoning layer will later narrate.

Two integrity guarantees are enforced here:

1. Trigger-exclusion: every historical statistic is computed from transactions
   with the trigger removed and only from activity at or before the trigger
   time. The transaction under investigation can never inflate the baseline it
   is judged against.
2. Same-direction comparison: "outgoing" activity (PAYMENT / TRANSFER /
   CASH_OUT / DEBIT) is what we baseline against for amount/behaviour/velocity,
   so an incoming salary credit doesn't distort the picture.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from statistics import mean, median
from typing import Any

from .data_access import BankData

# Transaction types that move money OUT of the customer's account.
OUTGOING_TYPES = {"PAYMENT", "TRANSFER", "CASH_OUT", "DEBIT"}


@dataclass
class FeatureResult:
    """A single normalized feature plus the raw numbers that produced it."""

    name: str
    value: float                       # normalized 0..1
    evidence: dict[str, Any] = field(default_factory=dict)
    note: str = ""

    def clamped(self) -> float:
        return max(0.0, min(1.0, self.value))


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _linear_ratio(ratio: float, max_ratio: float) -> float:
    """Map a ratio in [1, max_ratio] onto [0, 1], clamped."""
    if max_ratio <= 1.0:
        return 1.0 if ratio > 1.0 else 0.0
    return _clamp01((ratio - 1.0) / (max_ratio - 1.0))


def _outgoing(txns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [t for t in txns if t["type"] in OUTGOING_TYPES]


# --------------------------------------------------------------------------
# Individual features
# --------------------------------------------------------------------------

def amount_deviation(
    trigger: dict[str, Any],
    history: list[dict[str, Any]],
    cfg: dict[str, Any],
) -> FeatureResult:
    """How large is the trigger vs the customer's average outgoing amount."""
    fc = cfg["features"]["amount_deviation"]
    hist_out = _outgoing(history)
    if len(hist_out) < fc["min_history"]:
        return FeatureResult(
            "amount_deviation", 0.0,
            {"reason": "insufficient_history", "history_count": len(hist_out)},
            note="Not enough historical outgoing transactions to baseline.",
        )
    avg = mean(t["amount"] for t in hist_out)
    ratio = trigger["amount"] / avg if avg > 0 else 0.0
    value = _linear_ratio(ratio, fc["max_ratio"])
    return FeatureResult(
        "amount_deviation", value,
        {
            "trigger_amount": round(trigger["amount"], 2),
            "historical_avg_outgoing": round(avg, 2),
            "ratio": round(ratio, 2),
            "history_count": len(hist_out),
        },
        note=f"Trigger is {ratio:.1f}x the customer's average outgoing amount.",
    )


def behaviour_deviation(
    trigger: dict[str, Any],
    history: list[dict[str, Any]],
    cfg: dict[str, Any],
) -> FeatureResult:
    """Is the trigger larger than anything this customer has done before."""
    fc = cfg["features"]["behaviour_deviation"]
    hist_out = _outgoing(history)
    if len(hist_out) < fc["min_history"]:
        return FeatureResult(
            "behaviour_deviation", 0.0,
            {"reason": "insufficient_history", "history_count": len(hist_out)},
            note="Not enough historical outgoing transactions to baseline.",
        )
    hist_max = max(t["amount"] for t in hist_out)
    ratio = trigger["amount"] / hist_max if hist_max > 0 else 0.0
    value = _linear_ratio(ratio, fc["max_ratio"])
    return FeatureResult(
        "behaviour_deviation", value,
        {
            "trigger_amount": round(trigger["amount"], 2),
            "historical_max_outgoing": round(hist_max, 2),
            "ratio": round(ratio, 2),
            "history_count": len(hist_out),
        },
        note=f"Trigger is {ratio:.1f}x the customer's previous largest outgoing.",
    )


def velocity(
    trigger: dict[str, Any],
    history: list[dict[str, Any]],
    cfg: dict[str, Any],
) -> FeatureResult:
    """Count of outgoing transactions in the window ending at the trigger."""
    fc = cfg["features"]["velocity"]
    window = timedelta(minutes=fc["window_minutes"])
    t0 = trigger["_event_dt"] - window
    # include the trigger itself in the burst count, plus prior outgoing txns
    # within the window (history already excludes the trigger and future txns).
    in_window = [t for t in _outgoing(history) if t0 <= t["_event_dt"] <= trigger["_event_dt"]]
    count = len(in_window) + 1  # +1 for the trigger
    max_count = fc["max_count"]
    if max_count <= 1:
        value = 1.0 if count > 1 else 0.0
    else:
        value = _clamp01((count - 1) / (max_count - 1))
    return FeatureResult(
        "velocity", value,
        {
            "window_minutes": fc["window_minutes"],
            "outgoing_count_in_window": count,
        },
        note=f"{count} outgoing transactions within {fc['window_minutes']} minutes.",
    )


def beneficiary_novelty(
    trigger: dict[str, Any],
    history: list[dict[str, Any]],
    bank: BankData,
    cfg: dict[str, Any],
) -> FeatureResult:
    """Is the trigger's destination a brand-new beneficiary for this customer."""
    fc = cfg["features"]["beneficiary_novelty"]
    dest = trigger["nameDest"]

    # Only ACCOUNT destinations are "beneficiaries"; merchants/ATMs are not.
    if trigger.get("destination_type") == "MERCHANT":
        return FeatureResult(
            "beneficiary_novelty", 0.0,
            {"destination": dest, "destination_type": "MERCHANT"},
            note="Destination is a merchant, not a beneficiary account.",
        )

    rel = bank.get_beneficiary_relationship(trigger["customer_id"], dest)
    prior_to_dest = [t for t in history if t["nameDest"] == dest]
    seen_before = len(prior_to_dest) > 0

    if rel is not None:
        status = rel.get("relationship_status", "").upper()
        is_new = status == "NEW"
    else:
        # no relationship record: treat as new if never transacted before
        status = "UNKNOWN"
        is_new = not seen_before

    value = fc["new_value"] if is_new else fc["established_value"]
    return FeatureResult(
        "beneficiary_novelty", value,
        {
            "destination": dest,
            "relationship_status": status,
            "prior_transactions_to_dest": len(prior_to_dest),
        },
        note=("New beneficiary — no established relationship."
              if is_new else
              f"Established beneficiary ({len(prior_to_dest)} prior transfers)."),
    )


def network_risk(
    trigger: dict[str, Any],
    bank: BankData,
    cfg: dict[str, Any],
) -> FeatureResult:
    """Fan-in: how many DISTINCT customers paid the same destination within a
    window CENTRED on the trigger. High fan-in = mule/collection node.

    Note on the window direction: unlike the customer's own baseline/velocity
    (which must look strictly backwards to avoid leaking the customer's future
    behaviour), fan-in is a structural property of a SHARED destination. A mule
    collection is investigated after the cluster of deposits has landed, so we
    look at a symmetric window around the trigger. This is not self-leakage —
    it observes OTHER customers converging on the same account.
    """
    fc = cfg["features"]["network_risk"]
    dest = trigger["nameDest"]
    half = timedelta(minutes=fc["window_minutes"])
    t_start = trigger["_event_dt"] - half
    t_end = trigger["_event_dt"] + half

    to_dest = bank.get_transactions_to_destination(dest)  # all, then window here
    senders: set[str] = set()
    for t in to_dest:
        if t_start <= t["_event_dt"] <= t_end:
            senders.add(t["customer_id"])
    # include the trigger's own sender
    senders.add(trigger["customer_id"])
    fan_in = len(senders)

    max_fan_in = fc["max_fan_in"]
    if max_fan_in <= 1:
        value = 1.0 if fan_in > 1 else 0.0
    else:
        value = _clamp01((fan_in - 1) / (max_fan_in - 1))
    return FeatureResult(
        "network_risk", value,
        {
            "destination": dest,
            "window_minutes": fc["window_minutes"],
            "distinct_senders": fan_in,
        },
        note=f"{fan_in} distinct customers sent funds to this destination "
             f"within {fc['window_minutes']} minutes.",
    )


def previous_alerts(
    prior_alert_count: int,
    cfg: dict[str, Any],
) -> FeatureResult:
    """Prior alert history for the customer. Sourced from the alert store, not
    from the answer-key cases file. In Phase 0 tests this is passed in as 0
    since the dataset only has the 10 demo alerts."""
    fc = cfg["features"]["previous_alerts"]
    max_count = fc["max_count"]
    value = _clamp01(prior_alert_count / max_count) if max_count > 0 else 0.0
    return FeatureResult(
        "previous_alerts", value,
        {"prior_alert_count": prior_alert_count},
        note=f"{prior_alert_count} prior alert(s) on this customer.",
    )


# --------------------------------------------------------------------------
# Orchestration: compute all features for a trigger
# --------------------------------------------------------------------------

def extract_features(
    trigger_transaction_id: str,
    bank: BankData,
    cfg: dict[str, Any],
    *,
    prior_alert_count: int = 0,
) -> dict[str, FeatureResult]:
    """Compute every feature for the given trigger transaction.

    Enforces trigger-exclusion and before-time filtering when building history.
    """
    trigger = bank.get_transaction(trigger_transaction_id)
    if trigger is None:
        raise KeyError(f"Trigger transaction '{trigger_transaction_id}' not found.")

    history = bank.get_transaction_history(
        trigger["customer_id"],
        before=trigger["_event_dt"],
        exclude_transaction_id=trigger_transaction_id,
    )

    return {
        "amount_deviation": amount_deviation(trigger, history, cfg),
        "behaviour_deviation": behaviour_deviation(trigger, history, cfg),
        "velocity": velocity(trigger, history, cfg),
        "beneficiary_novelty": beneficiary_novelty(trigger, history, bank, cfg),
        "network_risk": network_risk(trigger, bank, cfg),
        "previous_alerts": previous_alerts(prior_alert_count, cfg),
    }
