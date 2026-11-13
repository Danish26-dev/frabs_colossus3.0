"""Data access layer for the FRAB worker (Phase 0).

Clean, typed-ish loaders over the synthetic-bank CSVs. In production these
functions would call the bank's live APIs; the signatures stay the same so the
rest of the worker never has to change.

INTEGRITY BOUNDARY
------------------
This layer will ONLY load the collections that are legitimate investigation
inputs:

    customers, accounts, transactions, beneficiaries, kyc_profiles,
    behaviour_baseline

It intentionally REFUSES to load the "answer-key" artifacts:

    cases.csv, demo_runs.csv (and the disposition / expected_action /
    investigation_note fields they contain)

Those describe the expected outcome of an investigation and must never be fed
into the worker. They are used only by the test suite, which reads them
directly (bypassing this layer) as oracles.
"""

from __future__ import annotations

import csv
import os
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class BankDataAccess(Protocol):
    """The data-access interface every backend implements.

    The worker (Detective, features, patterns) depends ONLY on this interface,
    never on a concrete source. Two implementations exist:

      * CSVDataAccess  — local synthetic CSVs (dev / offline / tests)
      * APIDataAccess  — the Synthetic Bank team's GCP API (production/GCP)

    Swapping the source is therefore a one-line selection in default_bank_data()
    and requires no change anywhere else in the worker.

    Return shapes:
      - transactions are dicts with parsed 'amount' (float) and '_event_dt'
        (datetime) fields, plus the raw PaySim/FRAB fields.
      - customer/account/kyc/beneficiary are plain dicts (or None if absent).
    """

    def get_customer(self, customer_id: str) -> dict[str, Any] | None: ...
    def get_account(self, account_id: str) -> dict[str, Any] | None: ...
    def get_kyc(self, customer_id: str) -> dict[str, Any] | None: ...
    def get_transaction(self, transaction_id: str) -> dict[str, Any] | None: ...
    def get_transaction_history(
        self, customer_id: str, *, before: datetime | None = None,
        exclude_transaction_id: str | None = None,
    ) -> list[dict[str, Any]]: ...
    def get_transactions_to_destination(
        self, dest: str, *, before: datetime | None = None,
    ) -> list[dict[str, Any]]: ...
    def get_beneficiary_relationship(
        self, customer_id: str, beneficiary_id: str
    ) -> dict[str, Any] | None: ...

# Files this layer is allowed to read as investigation input.
_ALLOWED_FILES = {
    "customers",
    "accounts",
    "transactions",
    "beneficiaries",
    "kyc_profiles",
    "behaviour_baseline",
    "merchants",
}

# Files that encode the expected answer — never usable as investigation input.
_FORBIDDEN_FILES = {"cases", "demo_runs", "simulator_feed"}


def _default_data_dir() -> str:
    env = os.environ.get("FRAB_DATA_DIR")
    if env:
        return env
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(here, "..", "..", "FRAB_DEMO_READY_DATASET"))


def parse_event_time(value: str) -> datetime:
    """Parse an ISO event_time string into a naive datetime.

    Timezone-aware values are converted to naive UTC, so aware and naive
    timestamps never meet in a comparison (which would raise TypeError)."""
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _read_csv(name: str, data_dir: str | None = None) -> list[dict[str, str]]:
    if name in _FORBIDDEN_FILES:
        raise PermissionError(
            f"'{name}' is an answer-key artifact and must not be used as "
            f"investigation input. Use it only as a test oracle, read directly."
        )
    if name not in _ALLOWED_FILES:
        raise ValueError(f"Unknown collection '{name}'.")
    path = os.path.join(data_dir or _default_data_dir(), f"{name}.csv")
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


class CSVDataAccess:
    """BankDataAccess over the local synthetic-bank CSVs.

    Loads once, indexes for fast lookup. Instantiate with a data_dir to point at
    a different dataset (used by tests). This is the dev/offline implementation;
    the GCP deployment uses APIDataAccess against the bank team's API.
    """

    def __init__(self, data_dir: str | None = None) -> None:
        self.data_dir = data_dir or _default_data_dir()

        self._customers = {r["customer_id"]: r for r in _read_csv("customers", self.data_dir)}
        self._accounts = {r["account_id"]: r for r in _read_csv("accounts", self.data_dir)}
        self._kyc = {r["customer_id"]: r for r in _read_csv("kyc_profiles", self.data_dir)}

        # transactions: keep the full list, plus an index by customer_id and by
        # destination (nameDest) for fan-in / network queries.
        self._transactions: list[dict[str, Any]] = []
        self._txn_by_id: dict[str, dict[str, Any]] = {}
        self._txn_by_customer: dict[str, list[dict[str, Any]]] = {}
        self._txn_by_dest: dict[str, list[dict[str, Any]]] = {}
        for r in _read_csv("transactions", self.data_dir):
            row = dict(r)
            row["amount"] = float(row["amount"])
            row["_event_dt"] = parse_event_time(row["event_time"])
            self._transactions.append(row)
            self._txn_by_id[row["transaction_id"]] = row
            self._txn_by_customer.setdefault(row["customer_id"], []).append(row)
            self._txn_by_dest.setdefault(row["nameDest"], []).append(row)

        # beneficiaries keyed by (customer_id, beneficiary_id)
        self._beneficiaries: dict[tuple[str, str], dict[str, str]] = {}
        for r in _read_csv("beneficiaries", self.data_dir):
            self._beneficiaries[(r["customer_id"], r["beneficiary_id"])] = r

        # keep sorted transaction lists per customer for time-window queries
        for txns in self._txn_by_customer.values():
            txns.sort(key=lambda t: t["_event_dt"])

    # --- lookups -----------------------------------------------------------

    def get_customer(self, customer_id: str) -> dict[str, str] | None:
        return self._customers.get(customer_id)

    def get_account(self, account_id: str) -> dict[str, str] | None:
        return self._accounts.get(account_id)

    def get_kyc(self, customer_id: str) -> dict[str, str] | None:
        return self._kyc.get(customer_id)

    def get_transaction(self, transaction_id: str) -> dict[str, Any] | None:
        return self._txn_by_id.get(transaction_id)

    def get_transaction_history(
        self,
        customer_id: str,
        *,
        before: datetime | None = None,
        exclude_transaction_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return a customer's transactions, sorted by time.

        `before`: if set, only transactions at or before this time are returned
        (prevents leaking activity that happened after the alert).
        `exclude_transaction_id`: if set, that transaction is removed — used to
        keep the trigger out of the baseline it is judged against.
        """
        txns = self._txn_by_customer.get(customer_id, [])
        out = []
        for t in txns:
            if exclude_transaction_id and t["transaction_id"] == exclude_transaction_id:
                continue
            if before is not None and t["_event_dt"] > before:
                continue
            out.append(t)
        return out

    def get_transactions_to_destination(
        self,
        dest: str,
        *,
        before: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """All transactions sent to a destination (for fan-in / network analysis)."""
        txns = self._txn_by_dest.get(dest, [])
        if before is None:
            return list(txns)
        return [t for t in txns if t["_event_dt"] <= before]

    def get_beneficiary_relationship(
        self, customer_id: str, beneficiary_id: str
    ) -> dict[str, str] | None:
        return self._beneficiaries.get((customer_id, beneficiary_id))


# Backwards-compatible alias: existing call sites / tests used `BankData`.
BankData = CSVDataAccess


def bank_for_alert(alert_id: str) -> BankDataAccess:
    """Data access for ONE investigation.

    In API mode this is a fresh APIDataAccess bound to the alert, with its
    bundle fetched up front (raises BankDataError if the bank API fails), so
    concurrent investigations never share or overwrite each other's data.
    CSV data is immutable, so the shared instance is safe to reuse.
    """
    if os.environ.get("FRAB_DATA_SOURCE", "csv").lower() == "api" and alert_id:
        from .api_data_access import APIDataAccess
        bank = APIDataAccess(alert_id=alert_id)
        bank.load_alert(alert_id)
        return bank
    return default_bank_data()


@lru_cache(maxsize=1)
def default_bank_data() -> BankDataAccess:
    """Shared data-access instance, selected by FRAB_DATA_SOURCE.

        FRAB_DATA_SOURCE=csv  (default) -> CSVDataAccess over local dataset
        FRAB_DATA_SOURCE=api            -> APIDataAccess over the bank team's API
    """
    source = os.environ.get("FRAB_DATA_SOURCE", "csv").lower()
    if source == "api":
        from .api_data_access import APIDataAccess
        return APIDataAccess()
    return CSVDataAccess()
