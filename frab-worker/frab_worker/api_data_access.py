"""APIDataAccess — BankDataAccess backed by the deployed Synthetic Bank API.

Wired to the REAL Cloud Run service. Verified against:
  https://frab-git-379796489354.asia-south1.run.app

Real endpoints (from the live OpenAPI + probing):
    GET /customers/{customer_id}
    GET /customers/{customer_id}/kyc
    GET /accounts/{account_id}
    GET /accounts/{account_id}/transactions   -> array (currently only trigger; history gap)
    GET /alerts/{alert_id}
    GET /investigation/{alert_id}             -> rich bundle (the primary source)

STRATEGY: /investigation/{alert_id} returns everything the worker needs in one
call — trigger_transaction, customer, account, kyc, beneficiaries, and
related_transactions (the fan-in / mule signal). So the adapter fetches that
bundle once per case and serves lookups from it, falling back to the individual
GET endpoints when a query isn't covered by the bundle.

INTEGRITY: the bundle also contains answer-key fields (alert.expected_reason,
alert.scenario_id) — these are STRIPPED and never surfaced to the worker. Only
raw facts are exposed.

KNOWN GAP: the API does not currently serve per-customer transaction history
(transaction_history is empty, /accounts/{id}/transactions returns only the
trigger). History-based features degrade gracefully; the fan-in (related_
transactions) and beneficiary-novelty signals work today.

Env config:
    FRAB_BANK_API_URL   base URL (defaults to the deployed Cloud Run service)
    FRAB_BANK_API_TOKEN optional bearer token
    FRAB_ALERT_ID       the alert id whose bundle to load (set per investigation)
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import datetime
from typing import Any

from .data_access import parse_event_time

_DEFAULT_BASE = "https://frab-git-379796489354.asia-south1.run.app"

# fields in the investigation bundle's alert object that are answer-key / must
# not reach the worker's reasoning.
_ANSWER_KEY_FIELDS = {"expected_reason", "scenario_id", "scenario"}


class APIDataAccess:
    def __init__(self, base_url: str | None = None, token: str | None = None,
                 alert_id: str | None = None, timeout: float = 20.0) -> None:
        self.base_url = (base_url or os.environ.get("FRAB_BANK_API_URL", _DEFAULT_BASE)).rstrip("/")
        self.token = token or os.environ.get("FRAB_BANK_API_TOKEN", "")
        self.timeout = timeout
        self.alert_id = alert_id or os.environ.get("FRAB_ALERT_ID", "")
        self._bundle: dict[str, Any] | None = None

    # --- HTTP ---------------------------------------------------------------

    def _get(self, path: str) -> Any:
        url = f"{self.base_url}{path}"
        req = urllib.request.Request(url, method="GET")
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            raise
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise RuntimeError(f"Bank API unreachable ({path}): {exc}") from exc

    # --- investigation bundle (primary source) ------------------------------

    def load_alert(self, alert_id: str) -> dict[str, Any] | None:
        """Fetch and cache the investigation bundle for an alert."""
        self.alert_id = alert_id
        self._bundle = self._get(f"/investigation/{alert_id}")
        return self._bundle

    def _ensure_bundle(self) -> dict[str, Any]:
        if self._bundle is None and self.alert_id:
            self.load_alert(self.alert_id)
        return self._bundle or {}

    # --- normalization ------------------------------------------------------

    @staticmethod
    def _normalize_txn(raw: dict[str, Any] | None) -> dict[str, Any] | None:
        if not raw:
            return None
        t = dict(raw)
        t["amount"] = float(t.get("amount", 0.0))
        if t.get("event_time"):
            t["_event_dt"] = parse_event_time(t["event_time"])
        return t

    # --- BankDataAccess interface ------------------------------------------

    def get_customer(self, customer_id: str) -> dict[str, Any] | None:
        b = self._ensure_bundle()
        if b.get("customer", {}).get("customer_id") == customer_id:
            return b["customer"]
        return self._get(f"/customers/{customer_id}")

    def get_account(self, account_id: str) -> dict[str, Any] | None:
        b = self._ensure_bundle()
        if b.get("account", {}).get("account_id") == account_id:
            return b["account"]
        return self._get(f"/accounts/{account_id}")

    def get_kyc(self, customer_id: str) -> dict[str, Any] | None:
        b = self._ensure_bundle()
        if b.get("kyc", {}).get("customer_id") == customer_id:
            return b["kyc"]
        return self._get(f"/customers/{customer_id}/kyc")

    def get_transaction(self, transaction_id: str) -> dict[str, Any] | None:
        b = self._ensure_bundle()
        trig = b.get("trigger_transaction")
        if trig and trig.get("transaction_id") == transaction_id:
            return self._normalize_txn(trig)
        # search related + history in the bundle
        for t in b.get("related_transactions", []) + b.get("transaction_history", []):
            if t.get("transaction_id") == transaction_id:
                return self._normalize_txn(t)
        return None

    def get_transaction_history(
        self, customer_id: str, *, before: datetime | None = None,
        exclude_transaction_id: str | None = None,
    ) -> list[dict[str, Any]]:
        b = self._ensure_bundle()
        raw = list(b.get("transaction_history", []))
        # fall back to the account endpoint if the bundle history is empty
        if not raw:
            cust = self.get_customer(customer_id) or {}
            acct = cust.get("account_id")
            if acct:
                fetched = self._get(f"/accounts/{acct}/transactions") or []
                raw = fetched if isinstance(fetched, list) else []
        txns = [self._normalize_txn(r) for r in raw if r]
        out = []
        for t in txns:
            if exclude_transaction_id and t["transaction_id"] == exclude_transaction_id:
                continue
            if before is not None and t.get("_event_dt") and t["_event_dt"] > before:
                continue
            out.append(t)
        out.sort(key=lambda x: x.get("_event_dt") or datetime.min)
        return out

    def get_transactions_to_destination(
        self, dest: str, *, before: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """Fan-in: senders to a destination. From the bundle's related_transactions
        (plus the trigger itself), which is where the API exposes the mule signal."""
        b = self._ensure_bundle()
        candidates = list(b.get("related_transactions", []))
        trig = b.get("trigger_transaction")
        if trig:
            candidates.append(trig)
        txns = [self._normalize_txn(t) for t in candidates
                if t and t.get("nameDest") == dest]
        if before is None:
            return txns
        return [t for t in txns if t.get("_event_dt") and t["_event_dt"] <= before]

    def get_beneficiary_relationship(
        self, customer_id: str, beneficiary_id: str
    ) -> dict[str, Any] | None:
        b = self._ensure_bundle()
        for bene in b.get("beneficiaries", []):
            if (bene.get("customer_id") == customer_id
                    and bene.get("beneficiary_id") == beneficiary_id):
                return bene
        return None

    # --- alert helper (answer-key stripped) --------------------------------

    def get_alert_sanitized(self, alert_id: str) -> dict[str, Any] | None:
        """The alert with answer-key fields removed — safe for the worker."""
        b = self._ensure_bundle() if self.alert_id == alert_id else (self.load_alert(alert_id) or {})
        alert = dict(b.get("alert", {}))
        for f in _ANSWER_KEY_FIELDS:
            alert.pop(f, None)
        return alert or None
