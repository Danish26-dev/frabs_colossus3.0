# FRAB Voice Service — Integration Contract

Source of truth for how this frontend talks to the FRAB Voice Escalation
service. The voice service is a separate Cloud Run app (Vapi adapter); this
frontend calls it directly. Vapi secrets never leave the service.

**Status:** Live, real calls, verified end-to-end (identity verification → full
interview → structured assessment + summary + transcript + recording, stored
durably in Firestore).

## Base URL

```
https://frab-voice-200002205070.asia-south1.run.app
```

CORS allows `https://frab-frontend-200002205070.asia-south1.run.app` and
`http://localhost:8080`.

Configured in this repo via `VITE_FRAB_VOICE_URL` (`.env`, gitignored). When
set, `IS_VOICE_LIVE` is true and the voice flow is active.

## Architecture

```
Frontend
   1. POST /api/cases/{case_id}/voice-escalation   (start the call)
   2. poll GET /api/cases/{case_id}/voice          (until status terminal)
        |
        v
Voice Service (Cloud Run)
   - places real call via Vapi assistant  -> customer's phone
   - Vapi runs the interview, POSTs end-of-call report -> /api/voice/vapi/webhook
   - service parses structured output + summary + transcript, stores in Firestore
        |
        v
Firestore (durable) — read back on every poll, survives restarts/instances
```

## Endpoints

### 1. Start an escalation

`POST /api/cases/{case_id}/voice-escalation`

```json
{
  "alert_id": "ALT0005",
  "frab_recommendation": "ESCALATE",
  "risk_tier": "HIGH",
  "verification_question": "Which city is your account registered in?",
  "verification_expected_answer": "Bangalore"
}
```

Returns: `{ "case_id", "call_id", "status": "CALLING" }`

**REQUIRED: `verification_question` + `verification_expected_answer`.** Without
an approved verification factor the assistant has nothing to verify identity
against and **hangs up mid-call**. This frontend always sends them — a
caller-supplied Q&A wins, otherwise `startVoiceEscalation` fills a safe default
(`DEFAULT_VERIFICATION_QUESTION` / `DEFAULT_VERIFICATION_ANSWER` in
`src/lib/frab-voice.ts`).

### 2. Poll for status + result

`GET /api/cases/{case_id}/voice` — returns the latest call for the case. Poll
until `status` is terminal.

Statuses:

- `CALLING` — call in progress, keep polling
- `COMPLETED` — done, assessment ready
- `VOICE_ASSESSMENT_PENDING` — call ended but no assessment (rare now)
- `UNREACHABLE` — no answer / busy
- `FAILED` — could not place call
- `NONE` — no escalation for this case yet

`COMPLETED` response shape:

```json
{
  "case_id": "CASE0005",
  "call_id": "01a06e51-...",
  "status": "COMPLETED",
  "verification_status": "VERIFIED",
  "call_outcome": "INFORMATION_OBTAINED",
  "summary": "Identity verified... recurring monthly payment...",
  "customer_statements": ["Yeah, I added it. It's my son.", "It's every month."],
  "unresolved_questions": ["..."],
  "analyst_attention": ["Bot summary said 'first payment' but customer said monthly; review."],
  "customer_requested_human": false,
  "recommended_actions": ["Review customer statement", "..."],
  "transcript": "AI: Hello... User: ...",
  "recording_reference": "https://...mono.wav",
  "timeline": [
    { "event": "VOICE_ESCALATION_REQUESTED", "timestamp": "..." },
    { "event": "VOICE_CALL_STARTED", "timestamp": "...", "call_id": "..." },
    { "event": "VOICE_CALL_VERIFIED", "timestamp": "...", "call_id": "..." },
    { "event": "VOICE_CALL_COMPLETED", "timestamp": "...", "call_id": "..." },
    { "event": "VOICE_ASSESSMENT_RECEIVED", "timestamp": "...", "call_id": "..." }
  ]
}
```

### 3. Webhook (Vapi → service, already wired)

`POST /api/voice/vapi/webhook` — no action needed from the frontend.

### 4. Health

`GET /health` → `{ "status": "ok", "vapi_mode": "live", "assistant_configured": true }`

## Notes

- `GET /voice` returns the **latest** call for a case (a case can have multiple
  escalations).
- Timestamps are ISO 8601.
- Timeline event types: `VOICE_ESCALATION_REQUESTED`, `VOICE_CALL_STARTED`,
  `VOICE_CALL_VERIFIED`, `VOICE_CALL_COMPLETED`, `VOICE_ASSESSMENT_RECEIVED`,
  `VOICE_ASSESSMENT_PENDING`, `VOICE_CALL_FAILED`.
- Real calls take ~1–2 min (customer answers + talks), so `CALLING` persists
  longer than a mock. Poll accordingly (this frontend polls every 3s).

## Frontend integration map

| Concern | Location |
| --- | --- |
| Transport + types + defaults | `src/lib/frab-voice.ts` |
| Poll/start hook | `src/hooks/useVoiceEscalation.ts` |
| Account-drain harness (CASE0007) | `src/hooks/useAccountDrainProtection.ts`, `src/lib/demo-account-drain.ts` |
| CASE0007 protection popup (renders summary/statements/transcript/recording) | `src/components/app/alerts/AccountDrainProtection.tsx` |
| Case Book Page 08 voice panel | `src/components/app/result/pages/AuditTimeline.tsx` |

`transcript` and `recording_reference` are rendered in the CASE0007 protection
popup (transcript behind a disclosure, recording as a link).
