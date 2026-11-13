"""Case data source — fetches the authoritative case/customer data used to
build the Vapi dynamic variables.

The FRAB main backend / database is the source of truth. For this self-contained
service we resolve case + customer + transaction context from the deployed
Synthetic Bank API's /investigation/{alert_id} bundle (same source the worker
uses), plus optional overrides the caller passes in the escalation request.

Answer-key fields (expected_reason / scenario_id) are stripped — the voice agent
must not be handed the "answer".

This is behind an interface so it can point at the real main backend later.
"""

from __future__ import annotations

from typing import Any, Protocol

import httpx


class CaseSource(Protocol):
    def get_case_context(self, case_id: str, alert_id: str) -> dict[str, Any]: ...


_ANSWER_KEY = {"expected_reason", "scenario_id", "scenario"}


class BankApiCaseSource:
    def __init__(self, bank_api_url: str, timeout: float = 15.0) -> None:
        self.bank_api_url = bank_api_url.rstrip("/")
        self.timeout = timeout

    def _get(self, path: str) -> dict[str, Any] | None:
        try:
            resp = httpx.get(f"{self.bank_api_url}{path}", timeout=self.timeout)
        except httpx.HTTPError:
            return None
        if resp.status_code != 200:
            return None
        try:
            return resp.json()
        except ValueError:
            return None

    def resolve_customer_phone(self, customer_id: str) -> str:
        """Resolve the customer's phone from the backend directory.

        The bank bundle doesn't carry a phone number, so the service owns this
        lookup (backend is source of truth — the frontend should NOT have to
        supply it). Configured via CUSTOMER_PHONE_MAP env as
        "customer_id:+phone,customer_id:+phone", or a default demo number via
        DEMO_CUSTOMER_PHONE. Returns "" if unknown.
        """
        import os
        raw = os.environ.get("CUSTOMER_PHONE_MAP", "")
        for pair in raw.split(","):
            if ":" in pair:
                cid, phone = pair.split(":", 1)
                if cid.strip() == customer_id:
                    return phone.strip()
        return os.environ.get("DEMO_CUSTOMER_PHONE", "")

    def get_case_context(self, case_id: str, alert_id: str) -> dict[str, Any]:
        """Return a flat dict of case/customer/transaction fields for the call.

        Falls back gracefully if the bank API is unreachable — returns what it
        can, with empty strings for missing fields (never fabricated data).
        """
        bundle = self._get(f"/investigation/{alert_id}") if alert_id else None
        if not isinstance(bundle, dict) or not bundle:
            # `_case_data_ok` False: the service refuses to call a customer with
            # blank case details (a bank outage must not look like a success)
            return {
                "case_id": case_id, "alert_id": alert_id,
                "customer_name": "", "customer_id": "", "account_id": "",
                "transaction_id": "", "transaction_amount": "", "transaction_date": "",
                "beneficiary": "", "alert_reason": "", "case_type": "",
                "_customer_phone": "", "_case_data_ok": False,
            }

        def _obj(key: str) -> dict[str, Any]:
            v = bundle.get(key)
            return v if isinstance(v, dict) else {}

        alert = {k: v for k, v in _obj("alert").items() if k not in _ANSWER_KEY}
        customer = _obj("customer")
        account = _obj("account")
        trigger = _obj("trigger_transaction")

        return {
            "_case_data_ok": True,
            "case_id": case_id,
            "alert_id": alert_id,
            "case_type": alert.get("alert_type", ""),
            "customer_name": customer.get("customer_name", ""),
            "customer_id": customer.get("customer_id", ""),
            "account_id": account.get("account_id", ""),
            "transaction_id": trigger.get("transaction_id", ""),
            "transaction_amount": str(trigger.get("amount", "")),
            "transaction_date": trigger.get("event_time", ""),
            "beneficiary": trigger.get("nameDest", ""),
            "alert_reason": alert.get("alert_type", ""),
            "severity": alert.get("severity", ""),
            # phone isn't in the bank bundle; resolved from the backend directory
            # so the frontend doesn't have to be authoritative for it.
            "_customer_phone": self.resolve_customer_phone(
                customer.get("customer_id", "")),
            # identity check built server-side from the bank record, so the
            # expected answer never reaches the browser
            **_verification_from_record(customer),
        }


def _verification_from_record(customer: dict[str, Any]) -> dict[str, str]:
    """One non-sensitive question whose answer is on the bank's customer record.
    Empty when the record has no usable value (the assistant then ends the call
    without disclosing case details, as its prompt requires)."""
    city = str(customer.get("city") or "").strip()
    if not city:
        return {}
    return {
        "verification_question": "Which city is your account registered in?",
        "verification_expected_answer": city,
        "_verification_source": "bank_record",
    }
