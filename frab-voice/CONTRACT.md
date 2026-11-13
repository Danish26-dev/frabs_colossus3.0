# FRAB Voice Service — Frontend/Backend Integration Contract

The analyst-facing endpoints for the Voice Escalation feature. The frontend
(or the FRAB main backend proxying it) calls these. It never talks to Vapi
directly; all Vapi secrets stay inside this service.

Base URL (dev): `http://localhost:8090` · (prod): the Cloud Run / tunnel URL.

---

## 1. Start a voice escalation

`POST /api/cases/{case_id}/voice-escalation`

Body:
```json
{
  "alert_id": "ALT0007",
  "customer_phone": "+910000000000",
  "risk_tier": "HIGH",
  "known_evidence": "6.8x avg outgoing; new beneficiary; 5-way fan-in",
  "frab_recommendation": "ESCALATE",
  "verification_question": "Which city is your account registered in?",
  "verification_expected_answer": "Ahmedabad",
  "extra_variables": {}
}
```
- `customer_phone` (E.164) is required — the number to call.
- The rest are case-derived values from the FRAB case (source of truth), passed
  into the assistant's dynamic variables. Case/transaction details are pulled
  from the bank bundle via `alert_id`; these fields fill what the bundle lacks.

Response `200`:
```json
{ "case_id": "CASE0007", "call_id": "…", "status": "CALLING" }
```

---

## 2. Poll status + result (same case)

`GET /api/cases/{case_id}/voice`

Returns the latest call for the case:
```json
{
  "case_id": "CASE0007",
  "call_id": "…",
  "status": "COMPLETED",
  "verification_status": "VERIFIED",
  "call_outcome": "INFORMATION_OBTAINED",
  "summary": "Customer confirmed the transfer was to a friend for rent.",
  "customer_statements": ["It was for rent"],
  "unresolved_questions": [],
  "analyst_attention": [],
  "customer_requested_human": false,
  "recommended_actions": ["Review customer statement", "Incorporate new evidence…", "Maintain monitoring"],
  "timeline": [ { "event": "VOICE_ESCALATION_REQUESTED", "timestamp": "…" }, … ]
}
```

**Poll while active, stop on terminal status.**
- `status` ∈ `QUEUED | CALLING | IN_PROGRESS | COMPLETED | FAILED | UNREACHABLE | VOICE_ASSESSMENT_PENDING`
- Active: `QUEUED, CALLING, IN_PROGRESS` → keep polling (every ~2–3s).
- Terminal: the other four → stop polling.
- If no call has been started, `status` is `"NONE"`.

`recommended_actions` are populated only when COMPLETED. They are suggestions
for the human — the voice agent never blocks/closes/decides.

---

## 3. Timeline events (fold into the case audit trail)

The `timeline` array carries these event types, in order:
```
VOICE_ESCALATION_REQUESTED
VOICE_CALL_STARTED
VOICE_CALL_VERIFIED        (when the customer is verified)
VOICE_CALL_COMPLETED
VOICE_ASSESSMENT_RECEIVED  (structured result captured)
VOICE_ASSESSMENT_PENDING   (call ended, no structured output — not fabricated)
VOICE_CALL_FAILED
```
Merge these into the existing Case Book audit timeline alongside the
WATCHMAN/DETECTIVE/JURIST/SCRIBE events.

---

## 4. Frontend UX notes
- Analyst clicks **VOICE ESCALATION** → POST #1 → show "CALLING…".
- Poll #2 → show CALLING / IN_PROGRESS spinner during the ~call window.
- On COMPLETED → render verification, outcome, summary, statements, unresolved
  questions, analyst-attention, recommended actions — **on the same case page**.
- On UNREACHABLE / FAILED / VOICE_ASSESSMENT_PENDING → show the honest state,
  don't invent a summary.
- Refresh-safe: results persist server-side, so reloading the case keeps them.
- A second escalation creates a new call record without corrupting the first.

---

## 5. Webhook (Vapi → service, not for frontend)
`POST /api/voice/vapi/webhook` — registered as the Vapi Server URL. Public HTTPS
required in production (Cloud Run or a tunnel). Idempotent; always 2xx.

## 6. Health
`GET /health` → `{ "status": "ok", "vapi_mode": "mock|live", "assistant_configured": true }`
