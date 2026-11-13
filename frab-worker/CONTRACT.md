# FRAB Worker ↔ Backend Interface Contract

This is the wire contract between the **FRAB backend** (Danish) and the
**confidential investigation worker** (Omkar). Both sides build against this.
It is enforced in code by `frab_worker/api_models.py` and `frab_worker/api.py`.

Base URL (dev): `http://localhost:8000`

---

## 1. Start an investigation

`POST /investigate`

Request body:

```json
{
  "case_id": "CASE0007",
  "alert_id": "ALT0007",
  "alert": {
    "type": "MULE_PATTERN",
    "severity": "HIGH",
    "transaction_id": "TX009971"
  },
  "customer_id": "C009026167",
  "account_id": "ACC-C009026167",
  "scope": { "history_days": 90, "network_depth": 2, "include_prior_alerts": true },
  "prior_alert_count": 0
}
```

- `alert.transaction_id` is REQUIRED — it is the trigger the worker investigates.
- `customer_id` / `account_id` are optional (the worker derives them from the
  transaction).
- `scope` and `prior_alert_count` are optional.

Response `200`:

```json
{ "case_id": "CASE0007", "status": "STARTED" }
```

The investigation then runs asynchronously. Poll status / stream events / fetch
result using the endpoints below.

Error `422` (unknown trigger):

```json
{ "case_id": "CASE0007", "status": "FAILED",
  "error": { "code": "DATA_SOURCE_UNAVAILABLE", "message": "Trigger transaction 'X' not found." } }
```

---

## 2. Status

`GET /investigate/{case_id}/status` → `200`

```json
{
  "case_id": "CASE0007",
  "status": "RUNNING",
  "current_agent": "DETECTIVE",
  "current_event": "DETECTIVE_TRACING_NETWORK",
  "completed_stages": ["WATCHMAN"]
}
```

`status` ∈ `STARTED | RUNNING | COMPLETE | PARTIAL | FAILED`.
`404` with `CASE_NOT_FOUND` if the case id is unknown.

---

## 3. Result

`GET /investigate/{case_id}/result`

- `200` with the full result once the investigation has finished.
- `409` with `CASE_NOT_READY` if it is still running.
- `404` with `CASE_NOT_FOUND` if unknown.

Result shape:

```json
{
  "case_id": "CASE0007",
  "status": "COMPLETE",
  "investigation_tier": "HIGH",
  "risk": {
    "score": 0.6103,
    "level": "HIGH",
    "components": {
      "amount_deviation": { "value": 0.64, "weight": 0.25, "contribution": 0.16,
                            "evidence": { "...": "..." }, "note": "..." }
      /* ... one entry per risk feature ... */
    },
    "critical_signals": [
      { "feature": "pattern:MULE_COLLECTION", "value": 1.0, "raised_to": "HIGH", "note": "..." }
    ]
  },
  "observed_pattern": "MULE_COLLECTION",
  "recommendation": { "action": "ESCALATE", "reason": "..." },
  "evidence": [
    { "evidence_id": "E-001", "type": "AMOUNT_DEVIATION", "description": "...",
      "value": { "...": "..." }, "source": "behavior_baseline", "data_reference": "TX009971" }
  ],
  "findings": [
    { "statement": "...", "evidence_refs": ["E-001", "E-002"] }
  ],
  "regulatory_context": [
    { "source": "RBI Master Direction on KYC", "reference": "...",
      "excerpt": "...", "relevance": "..." }
  ],
  "network": { "destination": "C888000007", "distinct_senders": 5,
               "nodes": [ /* {id,type} */ ], "edges": [ /* {source,target,transaction_id,amount,event_time} */ ] },
  "case_file": { "summary": "...", "sections": { "...": "..." } },
  "completed_stages": ["WATCHMAN", "DETECTIVE", "JURIST", "SCRIBE"],
  "failed_stages": [],
  "agent_trace": [ /* raw events */ ],
  "timeline": [ { "event": "CASE_STARTED", "timestamp": 0.0 } ]
}
```

### Recommendation enum (the FIVE the UI must handle)

```
CLOSE  |  MONITOR  |  ESCALATE  |  BLOCK  |  INSUFFICIENT_EVIDENCE
```

`INSUFFICIENT_EVIDENCE` means "manual review required" — the UI needs a state
for it. `BLOCK`/`ESCALATE` are RECOMMENDATIONS only; the human analyst takes the
final action. The worker never acts.

### `network.nodes` / `network.edges`

Directly feed the frontend "Trace the Money" graph — no inference needed on the
UI side. `risk.components` directly feeds the "Financial Crime DNA" panel.

---

## 4. Events (SSE)

`GET /investigate/{case_id}/events` — `text/event-stream`.

Each message:

```
event: DETECTIVE_TRACING_NETWORK
data: {"case_id":"CASE0007","event":"DETECTIVE_TRACING_NETWORK","agent":"DETECTIVE","status":"RUNNING","timestamp":...,"metadata":{}}
```

### Event enum (drives the 3D workspace)

```
CASE_STARTED
SUPERVISOR_ACTIVE
WATCHMAN_ANALYZING
WATCHMAN_COMPLETED
DETECTIVE_QUERYING_HISTORY
DETECTIVE_TRACING_NETWORK
DETECTIVE_COMPLETED
EVIDENCE_DISCOVERED          (one per evidence item, metadata: evidence_id, type, description)
JURIST_ASSESSING_RISK
JURIST_COMPLETED
JURIST_FAILED               (only if regulatory retrieval fails; investigation continues PARTIAL)
SCRIBE_COMPILING_REPORT
SCRIBE_COMPLETED
INVESTIGATION_COMPLETE      (terminal)
INVESTIGATION_PARTIAL       (terminal — some stage failed but a result exists)
INVESTIGATION_FAILED        (terminal — investigation could not produce a result)
```

The stream closes after a terminal event. `EVIDENCE_DISCOVERED` is emitted
progressively as Detective finds evidence, so the workspace can show real
evidence appearing rather than a placeholder animation.

---

## 5. Ops

`GET /health` → `{ "status": "ok", "version": "0.1.0", "llm_mode": "offline" }`

`GET /readiness` →

```json
{ "ready": true, "components": [
  { "name": "data_access", "ready": true, "detail": "..." },
  { "name": "scoring_config", "ready": true },
  { "name": "regulatory_corpus", "ready": true, "detail": "6 pattern entries" },
  { "name": "llm", "ready": true, "detail": "mode=offline" }
] }
```

Use `/readiness` to drive the Intelligence Overview status panel (real status,
not hardcoded).

---

## 6. Error codes

```
INVALID_REQUEST | CASE_NOT_FOUND | CASE_NOT_READY | DATA_SOURCE_UNAVAILABLE | INTERNAL_ERROR
```

All errors return `{ case_id, status: "FAILED", error: { code, message } }`.
Errors never leak raw prompts, KYC, or internal model details.

---

## Decisions (confirmed)

1. **Events transport: SSE.** (Implemented; WebSocket not used.)
2. **`customer_id` is PRIMARY from the alert.** The worker validates it against
   the transaction owner and rejects a mismatch (`INVALID_REQUEST`). If omitted,
   the worker derives it from the transaction as a fallback.
3. **Authentication:** service-to-service. Private GCP networking preferred;
   authenticated public HTTPS acceptable for the demo. `POST /investigate` must
   not be publicly unauthenticated.

## Still to confirm

4. **`alert.type` values the rule engine actually emits.** The worker expects
   the 10 scenario types (HIGH_VALUE_NEW_BENEFICIARY, VELOCITY_SPIKE,
   STRUCTURING_PATTERN, BEHAVIOUR_DEVIATION, NEW_BENEFICIARY, KYC_MISMATCH,
   MULE_PATTERN, REPEATED_CASHOUT, CROSS_ACCOUNT_BURST, FALSE_POSITIVE_HISTORY /
   HIGH_VALUE_TRANSFER). **Action: send one real alert JSON from the current
   rule engine to confirm.**

## Data access (worker → Synthetic Bank team)

The worker reads bank data through the `BankDataAccess` interface. Local/dev uses
`CSVDataAccess`; GCP uses `APIDataAccess` against the Synthetic Bank team's API
(`FRAB_DATA_SOURCE=api`). **The one external dependency to unblock GCP data
access is the bank team's API contract:**

- base URL + auth (bearer token)
- endpoints for: customer, account, kyc, transaction, customer transaction
  history, beneficiary relationship, and **transactions-to-a-destination**
  (the network/fan-in query — highest-value evidence source)
- response JSON field names
- confirmation IDs stay `C009…`, `TX00…`, `ACC-…`

Only `api_data_access.py` changes once this arrives; the rest of the worker is
untouched.
