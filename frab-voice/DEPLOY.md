# FRAB Voice Service: Deployment

The voice service runs on **Cloud Run** in project `frabs-514608`, region
`asia-south1`. It must be publicly reachable over HTTPS because Vapi calls its
webhook.

Live service: `https://frab-voice-379796489354.asia-south1.run.app`

## What is already in place

| Resource | Value |
|---|---|
| Cloud Run service | `frab-voice` |
| Runtime service account | `frab-voice-sa@frabs-514608.iam.gserviceaccount.com` |
| Roles | Firestore user (project); secret accessor on its own secrets only |
| Firestore | `(default)`, collections `voice_calls` and `voice_timeline` |
| Secrets (Secret Manager) | `VAPI_API_KEY`, `VOICE_API_TOKEN`, `VOICE_WEBHOOK_SECRET`, `DEMO_CUSTOMER_PHONE` |

## Deploy or redeploy

From the `frab-voice/` folder:

```bash
gcloud run deploy frab-voice --source . \
  --region asia-south1 --project frabs-514608 \
  --service-account frab-voice-sa@frabs-514608.iam.gserviceaccount.com \
  --allow-unauthenticated --min-instances 1 --max-instances 2 --memory 512Mi \
  --set-env-vars "VOICE_STORE=firestore,GOOGLE_CLOUD_PROJECT=frabs-514608,FRAB_BANK_API_URL=https://frab-git-379796489354.asia-south1.run.app,VAPI_ASSISTANT_ID=fad86425-0119-4af0-a8e0-1bb54854d93c,VAPI_PHONE_NUMBER_ID=2a8e455b-1e1a-4bfa-840b-22e7c409c10c" \
  --set-secrets "VAPI_API_KEY=VAPI_API_KEY:latest,VOICE_API_TOKEN=VOICE_API_TOKEN:latest,VOICE_WEBHOOK_SECRET=VOICE_WEBHOOK_SECRET:latest,DEMO_CUSTOMER_PHONE=DEMO_CUSTOMER_PHONE:latest"
```

Production must run live: leave `VAPI_MOCK`, `VAPI_MOCK_AUTOCOMPLETE`,
`DEMO_CUSTOMER_NAME` and `DEMO_ACCOUNT_ID` unset. `GET /health` must report
`"vapi_mode": "live"`.

## Auth

- `POST /api/cases/{case_id}/voice-escalation` and `GET /api/cases/{case_id}/voice`
  require `VOICE_API_TOKEN`, sent as `Authorization: Bearer <token>` or `?token=<token>`.
- `POST /api/voice/vapi/webhook` requires the `X-Vapi-Secret` header to equal
  `VOICE_WEBHOOK_SECRET`.
- `GET /health` is open.

## Vapi configuration

On the "FRAB Voice Investigator" assistant, set the Server URL to
`https://frab-voice-379796489354.asia-south1.run.app/api/voice/vapi/webhook` and its
secret to the value of `VOICE_WEBHOOK_SECRET`. Keep `end-of-call-report` enabled.
The assistant's structured output must keep the fields `verification_status`,
`call_outcome`, `summary`, `customer_statements`, `unresolved_questions`,
`analyst_attention`, `consistency_assessment` and `customer_requested_human`.

## Run locally

```bash
pip install -r requirements.txt
python -m pytest -q
VAPI_MOCK=1 uvicorn frab_voice.api:app --port 8090
```

`VAPI_MOCK=1` simulates Vapi for local development only.
