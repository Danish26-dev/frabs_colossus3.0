# FRAB Worker → Frontend: Integration Contract Diff

Answers to Danish's integration questions, with exact field shapes from the
worker's actual code (not assumptions). Pair this with `CONTRACT.md`.

Worker base URL: set `VITE_FRAB_WORKER_URL` to the worker's HTTPS Cloud Run URL
(`https://<service>-<hash>.asia-south1.run.app`, no trailing slash). It is stable
across restarts. The old VM / Cloudflare tunnel URLs no longer exist.

Revision: updated for the Cloud Run deployment, 0G Private Computer inference,
the optional shared token and durable result storage. Everything under
"Exact result shape" below is verified against the running code.

---

## 1. Answers to your open questions

### case_id — pass the bank's id through (worker does NOT mint its own)
`POST /investigate` uses the `case_id` YOU send, as-is. It does not generate one.
So: key everything off the bank's `CASE0001…` ids. Pass `case_id` in the POST
body, and the same id is what you use for `/status`, `/events`, `/result`.

Request body:
```json
{
  "case_id": "CASE0001",          // your id — worker echoes it back
  "alert_id": "ALT0001",          // worker uses this to load the investigation bundle
  "alert": { "type": "HIGH_VALUE_NEW_BENEFICIARY", "severity": "HIGH", "transaction_id": "TX009955" },
  "customer_id": "C009001507"     // optional
}
```
Response: `{ "case_id": "CASE0001", "status": "STARTED" }`

### CORS — DONE, including on the SSE endpoint
Allowed by default: `http://localhost:8080`, `http://localhost:3000`,
`http://127.0.0.1:8080`, `https://frab-frontend-rkv7mouqhq-el.a.run.app`,
`https://frab-frontend-200002205070.asia-south1.run.app`. Override the whole list
with `FRAB_CORS_ORIGINS` (comma-separated). Any other origin gets no CORS header.
SSE responses send `Cache-Control: no-cache`, `Connection: keep-alive`,
`X-Accel-Buffering: no`.

### Auth — shared token (when enabled)
When the worker is deployed with `FRAB_API_TOKEN`, every `/investigate*` route
requires the token; `/health` and `/readiness` stay open. Send it either way:
- `?token=<value>` on any URL (required for `EventSource`, which cannot set headers)
- `Authorization: Bearer <value>` on `fetch` calls

A missing or wrong token returns `401 {"detail": "Invalid or missing API token."}`.
The token is delivered to you privately, never in chat or in Git. It ends up in
the browser, so it deters casual misuse; it is not a per-user credential.

### TLS
The worker is served over HTTPS by Cloud Run, so `EventSource` works from the
HTTPS frontend with no mixed-content problem. The Cloud Run request timeout is
set to 60 minutes so SSE streams are not cut.

### /health and the LLM mode
`GET /health` -> `{"status":"ok","version":"0.1.0","llm_mode":"<mode>"}` where
`llm_mode` is one of:
- `0g` real inference on 0G Private Computer (Private trust mode)
- `0g-mock` scripted, no model call (clearly labelled in the result)
- `offline` deterministic narration, no model
Show or log this so it is always clear whether a real model ran.

### /result readiness and refresh
`/result` returns `404` (`CASE_NOT_FOUND`) for an unknown case and `409`
(`CASE_NOT_READY`) until the investigation has finished. The result is stored
BEFORE the stream's `STREAM_END` marker, so fetch `/result` after `STREAM_END` (or
once `/status` reports `COMPLETE` / `PARTIAL` / `FAILED`). The
`INVESTIGATION_COMPLETE` event itself fires a moment earlier, so if you react to
it and get a `409`, simply retry after a short delay. With durable storage on, a
finished case is reloadable after a page refresh or a worker restart; a case
interrupted by a restart is reported as `FAILED` with the reason, not as running
forever.

---

## 2. Exact result shape (for `mapWorkerResult`)

`GET /investigate/{case_id}/result` returns:

```json
{
  "case_id": "CASE0001",
  "status": "COMPLETE",                      // COMPLETE | PARTIAL | FAILED
  "investigation_tier": "HIGH",
  "risk": {
    "score": 0.61,                           // -> your riskScore
    "level": "HIGH",                         // -> your derived level
    "components": {                          // -> your riskComponents (Financial Crime DNA)
      "amount_deviation":   { "value": 0.64, "weight": 0.25, "contribution": 0.16, "evidence": {...}, "note": "..." },
      "velocity":           { "value": 0.0,  ... },
      "beneficiary_novelty":{ "value": 1.0,  ... },
      "behaviour_deviation":{ "value": 1.0,  ... },
      "network_risk":       { "value": 1.0,  ... },
      "previous_alerts":    { "value": 0.0,  ... }
    },
    "critical_signals": [ { "feature": "...", "value": 1.0, "raised_to": "HIGH", "note": "..." } ]
  },
  "observed_pattern": "MULE_COLLECTION",     // ADD this field on your side
  "recommendation": {
    "action": "ESCALATE",                    // -> your recommendation (string)
    "reason": "..."                          // -> your rationale (string)
  },
  "evidence": [
    {
      "evidence_id": "E-001",                // -> your id
      "type": "AMOUNT_DEVIATION",            // -> your title (or type)
      "description": "Trigger is 6.8x ...",  // -> your summary
      "value": { "trigger_amount": 9283.93, "historical_avg_outgoing": 1370.85, "ratio": 6.77, ... }, // -> your observed / dataField
      "source": "behavior_baseline",         // -> your source
      "data_reference": "TX009971"
    }
  ],
  "findings": [
    { "statement": "...", "evidence_refs": ["E-001","E-002"] }   // evidence_refs -> your evidenceIds; synthesize no/title
  ],
  "regulatory_context": [
    { "source": "RBI Master Direction on KYC", "reference": "...", "excerpt": "...", "relevance": "..." }
    //  excerpt -> your context ; relevance -> your whyItMatters
  ],
  "network": {
    "found": true,
    "destination": "C888000007",
    "distinct_senders": 5,
    "nodes": [ { "id": "C888000007", "type": "DESTINATION" },
               { "id": "C009026167", "type": "SENDER" } ],       // node = {id, type}  (type: DESTINATION|SENDER)
    "edges": [ { "source": "C009026167", "target": "C888000007",
                 "transaction_id": "TX009971", "amount": 9283.93,
                 "event_time": "2026-10-30T15:10:00" } ]         // edge = {source,target,transaction_id,amount,event_time}
  },
  "case_file": { "summary": "...", "sections": {...}, "agentic": {...} },
  "completed_stages": ["WATCHMAN","DETECTIVE","JURIST","SCRIBE"],
  "failed_stages": [],
  "agent_trace": [ /* see below */ ],
  "timeline":    [ { "event": "CASE_STARTED", "timestamp": 1788436551.39 } ]   // timeline item = {event, timestamp(float epoch)}
}
```

### The two shapes you flagged as unknown

**network.nodes / edges:**
- node: `{ "id": string, "type": "DESTINATION" | "SENDER" }`
- edge: `{ "source": custId, "target": destId, "transaction_id": str, "amount": number, "event_time": ISO8601 }`

**timeline / agent_trace items:**
- `timeline[]` item: `{ "event": string, "timestamp": float_epoch_seconds }`
- `agent_trace[]` item (richer, for audit replay):
  ```json
  { "case_id": "CASE0001", "event": "DETECTIVE_TRACING_NETWORK",
    "agent": "DETECTIVE", "status": "RUNNING",
    "timestamp": 1788436551.43, "metadata": { "evidence_id": "E-001", ... } }
  ```
  Note: I don't have your `{ts, agent, action, result, evidenceIds[]}` exactly —
  map `event`→action, `agent`→agent, `metadata`→result, `metadata.evidence_id`→
  evidenceIds. `agent_trace` is the richer source for your timeline.

---

## 3. Event stream (drives the 3D floor)

`GET /investigate/{case_id}/events` (SSE). Each message:
```
event: DETECTIVE_TRACING_NETWORK
data: {"case_id":"CASE0001","event":"DETECTIVE_TRACING_NETWORK","agent":"DETECTIVE","status":"RUNNING","timestamp":...,"metadata":{}}
```

Event enum (order for a HIGH/full case):
```
CASE_STARTED
SUPERVISOR_ACTIVE
WATCHMAN_ANALYZING
WATCHMAN_COMPLETED
DETECTIVE_AGENTIC_START        (agentic mode only)
AGENT_REASONING                (agentic: metadata.reasoning, metadata.action — the LLM's thought)
TOOL_SELECTED                  (agentic: metadata.tool, metadata.args)
DETECTIVE_QUERYING_HISTORY     (fixed-pipeline mode)
DETECTIVE_TRACING_NETWORK
DETECTIVE_COMPLETED
EVIDENCE_DISCOVERED            (one per evidence item; metadata: evidence_id, type, description)
JURIST_ASSESSING_RISK
JURIST_COMPLETED
SCRIBE_COMPILING_REPORT
SCRIBE_COMPLETED
LLM_ERROR                      (agentic only, NEW: the inference provider failed;
                                metadata: type, code, message, http_status, request_id)
INVESTIGATION_COMPLETE | INVESTIGATION_PARTIAL | INVESTIGATION_FAILED
STREAM_END                     (marker to close the EventSource cleanly)
```

`agent` is always one of `SUPERVISOR | WATCHMAN | DETECTIVE | JURIST | SCRIBE`.

### `case_file.agentic` (verified keys)
```json
{
  "mode": "agentic",
  "steps": 4,
  "transcript": [ { "reasoning": "...", "action": "compute_features", "args": {}, "result_keys": [] } ],
  "llm_proposed_recommendation": "ESCALATE",
  "llm_justification": "...",
  "deterministic_crosscheck": { "deterministic_risk_level": "HIGH", "deterministic_risk_score": 0.55,
                                "deterministic_implied_recommendation": "ESCALATE",
                                "llm_proposed_recommendation": "ESCALATE", "agree": true },
  "llm": { "provider": "0g", "model": "<model id>",
           "usage": { "calls": 4, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0,
                      "cost_usd": null, "cost_is_estimate": false } },
  "llm_error": { "type": "...", "code": "no_available_provider", "message": "...",
                 "http_status": 503, "request_id": "..." }
}
```
- `llm` and `llm_error` are NEW and additive; the other keys are unchanged.
- `llm_error` is present only when inference failed. The case still completes from
  the deterministic evidence and risk score, and the transcript shows "(fallback)"
  steps so it is never mistaken for model reasoning.
- When `llm.provider` is `0g-mock` the text is scripted and begins `[MOCK INFERENCE]`.
- `case_file.agentic` is `{}` in `offline` mode (no model, no agentic loop).
- Costs: `cost_usd` is `null` unless the provider reports it.
Replace your `DEMO_SCRIPT` timer with this stream. `AGENT_REASONING` +
`TOOL_SELECTED` carry the LLM's live reasoning/tool choices — good for the
dialogue panel.

---

## 4. What you correctly keep on the bank API
- alert queue (`/alerts`), customer context (KYC, account txns, prior alerts).
Those stay bank-sourced. Only the **investigation** (evidence, risk, reasoning,
recommendation, network, regulatory, timeline) moves to the worker.

## 5. Answer-key removal
Confirmed on my side: the worker strips `expected_reason` / `scenario_id` from
the bank bundle before reasoning. Your reasoning should come from `findings` +
`agent_trace`, never `expected_reason`.
