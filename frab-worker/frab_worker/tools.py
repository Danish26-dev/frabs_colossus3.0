"""Agent-callable tool layer (Phase 1).

Agents never touch the data store or the raw calculators directly — they call
these tools. Each tool:
  * takes simple JSON-friendly arguments,
  * returns a JSON-serializable dict,
  * retrieves REAL data / computes REAL numbers (no LLM involvement).

This is the boundary that enforces the governing rule: every number an agent
reasons over came from a deterministic tool, not from the model.

In production these wrappers call the bank's APIs; the signatures stay identical.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from . import features as feat
from . import patterns as pat
from .data_access import BankData


def _txn_public(t: dict[str, Any]) -> dict[str, Any]:
    """Strip internal fields (_event_dt) and expose a clean transaction view."""
    return {
        "transaction_id": t["transaction_id"],
        "type": t["type"],
        "amount": round(t["amount"], 2),
        "nameDest": t["nameDest"],
        "destination_type": t.get("destination_type"),
        "event_time": t["event_time"],
    }


class ToolLayer:
    """Bundles the tools around a BankData instance and scoring config."""

    def __init__(self, bank: BankData, cfg: dict[str, Any]) -> None:
        self.bank = bank
        self.cfg = cfg

    # --- identity / profile tools -----------------------------------------

    def get_customer_profile(self, customer_id: str) -> dict[str, Any]:
        cust = self.bank.get_customer(customer_id)
        if cust is None:
            return {"found": False, "customer_id": customer_id}
        acct = self.bank.get_account(cust.get("account_id", ""))
        return {
            "found": True,
            "customer_id": customer_id,
            "name": cust.get("customer_name"),
            "status": cust.get("status"),
            "city": cust.get("city"),
            "account": {
                "account_id": acct["account_id"],
                "account_type": acct["account_type"],
                "status": acct["status"],
                "opening_date": acct["opening_date"],
                "current_balance": float(acct["current_balance"]),
            } if acct else None,
        }

    def get_kyc_profile(self, customer_id: str) -> dict[str, Any]:
        k = self.bank.get_kyc(customer_id)
        if k is None:
            return {"found": False, "customer_id": customer_id}
        return {
            "found": True,
            "customer_id": customer_id,
            "kyc_status": k.get("kyc_status"),
            "risk_category": k.get("risk_category"),
            "occupation": k.get("occupation"),
            "annual_income_band": k.get("annual_income_band"),
            "pep_status": k.get("pep_status") == "TRUE",
            "document_verified": k.get("document_verified") == "TRUE",
            "address_verified": k.get("address_verified") == "TRUE",
        }

    # --- history / behaviour tools ----------------------------------------

    def get_transaction_history(
        self,
        customer_id: str,
        *,
        before: str | None = None,
        exclude_transaction_id: str | None = None,
        limit: int | None = None,
    ) -> dict[str, Any]:
        before_dt = datetime.fromisoformat(before) if before else None
        txns = self.bank.get_transaction_history(
            customer_id, before=before_dt, exclude_transaction_id=exclude_transaction_id
        )
        shown = txns[-limit:] if limit else txns
        return {
            "customer_id": customer_id,
            "count": len(txns),
            "transactions": [_txn_public(t) for t in shown],
        }

    def get_behavior_baseline(
        self, customer_id: str, *, before: str | None = None,
        exclude_transaction_id: str | None = None,
    ) -> dict[str, Any]:
        """Recompute the behavioural baseline from raw history (trigger-excluded).

        Deliberately does NOT read behaviour_baseline.csv as source of truth —
        that file is kept only for external validation.
        """
        before_dt = datetime.fromisoformat(before) if before else None
        txns = self.bank.get_transaction_history(
            customer_id, before=before_dt, exclude_transaction_id=exclude_transaction_id
        )
        out = [t for t in txns if t["type"] in feat.OUTGOING_TYPES]
        if not out:
            return {"customer_id": customer_id, "outgoing_count": 0}
        amounts = [t["amount"] for t in out]
        amounts_sorted = sorted(amounts)
        n = len(amounts_sorted)
        median = (amounts_sorted[n // 2] if n % 2 else
                  (amounts_sorted[n // 2 - 1] + amounts_sorted[n // 2]) / 2)
        return {
            "customer_id": customer_id,
            "outgoing_count": n,
            "avg_outgoing": round(sum(amounts) / n, 2),
            "median_outgoing": round(median, 2),
            "max_outgoing": round(max(amounts), 2),
        }

    def get_beneficiary_relationship(
        self, customer_id: str, beneficiary_id: str
    ) -> dict[str, Any]:
        rel = self.bank.get_beneficiary_relationship(customer_id, beneficiary_id)
        return {
            "customer_id": customer_id,
            "beneficiary_id": beneficiary_id,
            "relationship_status": (rel.get("relationship_status") if rel else "UNKNOWN"),
            "on_file": rel is not None,
        }

    # --- network tool ------------------------------------------------------

    def trace_account_network(
        self, transaction_id: str, *, window_minutes: int = 30
    ) -> dict[str, Any]:
        """Fan-in trace: distinct senders converging on the trigger's destination.

        Returns nodes + edges suitable for the frontend "Trace the Money" graph.
        """
        trigger = self.bank.get_transaction(transaction_id)
        if trigger is None:
            return {"found": False, "transaction_id": transaction_id}
        dest = trigger["nameDest"]
        customer = trigger["customer_id"]
        from datetime import timedelta
        half = timedelta(minutes=window_minutes)
        lo, hi = trigger["_event_dt"] - half, trigger["_event_dt"] + half

        # Fan-in: other senders converging on the same destination (mule signal)
        to_dest = [
            t for t in self.bank.get_transactions_to_destination(dest)
            if lo <= t["_event_dt"] <= hi
        ]
        senders = {t["customer_id"] for t in to_dest} | {customer}
        distinct_senders = len(senders)

        # Build the graph. Always anchor on the customer + trigger destination,
        # then enrich: fan-in senders (if any) AND the customer's other recent
        # beneficiaries — so even a non-fan-in case shows a meaningful money map,
        # not just a single edge.
        nodes: list[dict[str, Any]] = [
            {"id": customer, "type": "CUSTOMER"},
            {"id": dest, "type": "DESTINATION"},
        ]
        edges: list[dict[str, Any]] = [{
            "source": customer, "target": dest,
            "transaction_id": trigger["transaction_id"],
            "amount": round(trigger["amount"], 2),
            "event_time": trigger["event_time"],
            "role": "TRIGGER",
        }]
        seen_nodes = {customer, dest}

        # add fan-in senders (other customers -> same destination)
        for t in to_dest:
            if t["transaction_id"] == trigger["transaction_id"]:
                continue
            sid = t["customer_id"]
            if sid not in seen_nodes:
                nodes.append({"id": sid, "type": "SENDER"})
                seen_nodes.add(sid)
            edges.append({
                "source": sid, "target": dest,
                "transaction_id": t["transaction_id"],
                "amount": round(t["amount"], 2),
                "event_time": t["event_time"],
                "role": "FAN_IN",
            })

        # enrich non-fan-in cases: the customer's other recent counterparties,
        # so "Trace the Money" shows the customer's payment neighbourhood.
        if distinct_senders <= 1:
            history = self.bank.get_transaction_history(
                customer, before=trigger["_event_dt"],
                exclude_transaction_id=trigger["transaction_id"],
            )
            recent = [t for t in history if t.get("destination_type") == "ACCOUNT"][-5:]
            for t in recent:
                other = t["nameDest"]
                if other not in seen_nodes:
                    nodes.append({"id": other, "type": "COUNTERPARTY"})
                    seen_nodes.add(other)
                edges.append({
                    "source": customer, "target": other,
                    "transaction_id": t["transaction_id"],
                    "amount": round(t["amount"], 2),
                    "event_time": t["event_time"],
                    "role": "HISTORICAL",
                })

        return {
            "found": True,
            "destination": dest,
            "window_minutes": window_minutes,
            "distinct_senders": distinct_senders,
            "nodes": nodes,
            "edges": edges,
        }

    # --- deterministic analytics ------------------------------------------

    def compute_features(
        self, transaction_id: str, *, prior_alert_count: int = 0
    ) -> dict[str, Any]:
        """All scalar risk features for the trigger (each 0..1 + evidence)."""
        results = feat.extract_features(
            transaction_id, self.bank, self.cfg, prior_alert_count=prior_alert_count
        )
        return {
            name: {"value": round(fr.clamped(), 4), "evidence": fr.evidence, "note": fr.note}
            for name, fr in results.items()
        }

    def detect_pattern(self, transaction_id: str) -> dict[str, Any]:
        """Deterministic named-pattern classification for the trigger."""
        r = pat.classify(transaction_id, self.bank)
        return {
            "detected": r.detected,
            "pattern": r.pattern,
            "confidence": round(r.confidence, 4),
            "evidence": r.evidence,
            "transaction_ids": r.transaction_ids,
            "note": r.note,
        }

    def get_transaction(self, transaction_id: str) -> dict[str, Any]:
        t = self.bank.get_transaction(transaction_id)
        if t is None:
            return {"found": False, "transaction_id": transaction_id}
        return {"found": True, **_txn_public(t), "customer_id": t["customer_id"]}


# tool registry — names the agents can reference
TOOL_NAMES = [
    "get_customer_profile",
    "get_kyc_profile",
    "get_transaction",
    "get_transaction_history",
    "get_behavior_baseline",
    "get_beneficiary_relationship",
    "trace_account_network",
    "compute_features",
    "detect_pattern",
]
