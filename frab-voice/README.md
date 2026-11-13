# FRAB Voice Escalation Microservice

An **isolated communication adapter** that lets a FRAB analyst escalate a case to
a voice call with the customer, via Vapi's existing **FRAB Voice Investigator**
assistant. The structured result flows back into the same case + audit trail.

## What this is (and is NOT)

FRAB is a monolithic investigation application (the CVM worker + agents + Gemma).
This service is **only** the Vapi adapter around it:

```
FRAB investigates the case  →  analyst escalates  →  Voice Service calls the
customer via Vapi  →  captures structured evidence  →  returns it to the SAME
FRAB case  →  human analyst decides.
```

It does **NOT**: run any FRAB agents, compute risk scores, detect fraud, make
final compliance decisions, create a new Vapi assistant, or touch the CVM worker.
It is a thin telephony adapter.

## Responsibilities
- Vapi authentication + outbound call creation (existing assistant, by id)
- Inject case-specific dynamic variables
- Handle the Vapi webhook (call lifecycle + end-of-call structured output)
- Persist voice-call records (keyed by `call_id`, not `case_id`)
- Expose call status/result back to FRAB (same case)
- Emit voice events into the case audit timeline

## Endpoints
```
POST /api/cases/{case_id}/voice-escalation   start a call
POST /api/voice/vapi/webhook                 Vapi lifecycle webhook (public HTTPS)
GET  /api/cases/{case_id}/voice              call status + result (poll)
GET  /health
```

## Config (server-side only, never sent to the browser)
```
VAPI_API_KEY          Vapi secret key
VAPI_ASSISTANT_ID     the existing "FRAB Voice Investigator" assistant id
VAPI_PHONE_NUMBER_ID  the Vapi outbound phone number id
FRAB_BANK_API_URL     source of authoritative case/customer data (default: deployed bank API)
VOICE_STORE_PATH      JSON store path (default: ./voice_store.json)
```

## Run
```bash
pip install -r requirements.txt
uvicorn frab_voice.api:app --host 0.0.0.0 --port 8090
```

Offline/dev mode (no real calls): set `VAPI_MOCK=1` to simulate Vapi without a key.
