"""Build Vapi dynamic variables from FRAB case context.

Maps case/customer/transaction data into the variableValues the existing
"FRAB Voice Investigator" assistant expects. Never fabricates data — missing
fields are passed as empty strings, and the assistant's own prompt decides how
to handle absent verification info (it must not disclose case details without
verification).
"""

from __future__ import annotations

import os
from typing import Any

# the variable keys the existing assistant references at runtime
VARIABLE_KEYS = [
    "case_id", "case_type", "customer_name", "customer_id", "account_id",
    "transaction_id", "transaction_amount", "transaction_date", "beneficiary",
    "alert_reason", "risk_tier", "known_evidence", "frab_recommendation",
    "verification_question", "verification_expected_answer",
]


def _demo_defaults() -> dict[str, str]:
    """Fallback values used only when the case has no real value for a field.
    Lets a demo call address a known identity. Configured via env so nothing is
    hardcoded: DEMO_CUSTOMER_NAME (e.g. "Danish"), DEMO_ACCOUNT_ID (e.g. "2006").
    """
    return {
        "customer_name": os.environ.get("DEMO_CUSTOMER_NAME", ""),
        "account_id": os.environ.get("DEMO_ACCOUNT_ID", ""),
    }


def build_variables(case_ctx: dict[str, Any],
                    overrides: dict[str, Any] | None = None) -> dict[str, str]:
    """Merge case context + caller overrides into the assistant variableValues.

    `overrides` lets the escalation request supply values the bank bundle
    doesn't have (e.g. frab_recommendation, known_evidence, risk_tier, and the
    verification question/answer) — these come from the FRAB case, the source
    of truth, not the frontend.

    Demo defaults (DEMO_CUSTOMER_NAME / DEMO_ACCOUNT_ID), when set, OVERRIDE the
    case value for those fields — so a demo call always uses a known identity.
    If a default env var is unset/empty, the real case value is used as normal.
    """
    overrides = overrides or {}
    defaults = _demo_defaults()
    merged: dict[str, str] = {}
    for key in VARIABLE_KEYS:
        # a set demo default takes precedence for its field (always-override)
        if defaults.get(key):
            merged[key] = defaults[key]
            continue
        val = overrides.get(key, case_ctx.get(key, ""))
        merged[key] = "" if val is None else str(val)
    return merged
