# FRAB Worker: Deployment

The worker runs on **Cloud Run** in project `frabs-514608`, region `asia-south1`.
Model inference goes to **0G Private Computer** (Private trust mode).

Live service: `https://frab-worker-379796489354.asia-south1.run.app`

## What is already in place

| Resource | Value |
|---|---|
| Cloud Run service | `frab-worker` |
| Runtime service account | `frab-worker-sa@frabs-514608.iam.gserviceaccount.com` |
| Roles | Firestore user (project); secret accessor on its own secrets only |
| Firestore | `(default)`, native mode, `asia-south1`, collection `frab_investigations` |
| Secrets (Secret Manager) | `FRAB_API_TOKEN`; `ZG_API_KEY` once the 0G key is added |

## Deploy or redeploy

From the `frab-worker/` folder:

```bash
gcloud run deploy frab-worker --source . \
  --region asia-south1 --project frabs-514608 \
  --service-account frab-worker-sa@frabs-514608.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --min-instances 1 --max-instances 1 --no-cpu-throttling \
  --timeout 3600 --memory 1Gi --cpu 1 --port 8080 \
  --set-env-vars "FRAB_DATA_SOURCE=api,FRAB_STORE=firestore,GOOGLE_CLOUD_PROJECT=frabs-514608,LLM_PROVIDER=0g,LLM_MOCK_MODE=true,FRAB_BANK_API_URL=https://frab-git-379796489354.asia-south1.run.app" \
  --set-secrets "FRAB_API_TOKEN=FRAB_API_TOKEN:latest"
```

Why these settings:

- `--max-instances 1`: running investigations and their live event streams are
  held by the instance that started them, so every request must reach it.
- `--min-instances 1` and `--no-cpu-throttling`: an investigation runs in a
  background thread after `POST /investigate` returns; it needs CPU between
  requests and must not be lost to scale-to-zero.
- `--timeout 3600`: SSE streams stay open for up to 60 minutes.
- `--allow-unauthenticated`: the browser calls the worker directly. Every
  `/investigate*` route is protected by `FRAB_API_TOKEN` instead.

## Switch on real 0G inference

1. Store the key (Cloud Shell; prompts without echoing it):

   ```bash
   read -s -p "0G key: " ZG; printf '%s' "$ZG" | gcloud secrets create ZG_API_KEY --data-file=- --project=frabs-514608; unset ZG
   gcloud secrets add-iam-policy-binding ZG_API_KEY --member="serviceAccount:frab-worker-sa@frabs-514608.iam.gserviceaccount.com" --role="roles/secretmanager.secretAccessor" --project=frabs-514608
   ```

2. Enable it, with the exact model id your account can use in Private mode:

   ```bash
   gcloud run services update frab-worker --region asia-south1 --project frabs-514608 \
     --update-env-vars "LLM_MOCK_MODE=false,ZG_MODEL=<model id>" \
     --update-secrets "ZG_API_KEY=ZG_API_KEY:latest"
   ```

3. Check: `GET /health` must report `"llm_mode": "0g"` (not `0g-mock`).

Optional spend controls: `LLM_MAX_OUTPUT_TOKENS`, `ZG_MAX_PRICE_USD_PROMPT`,
`ZG_MAX_PRICE_USD_COMPLETION`, `ZG_ALLOW_FALLBACKS`. See `.env.example`.

## Verify from outside

```bash
curl -i https://frab-worker-379796489354.asia-south1.run.app/health
curl -i -X OPTIONS https://frab-worker-379796489354.asia-south1.run.app/investigate \
     -H "Origin: https://frab-frontend-v7fdif2gha-el.a.run.app" -H "Access-Control-Request-Method: POST"
curl -N "https://frab-worker-379796489354.asia-south1.run.app/investigate/<case_id>/events?token=<token>"
```

Read the token yourself with
`gcloud secrets versions access latest --secret FRAB_API_TOKEN --project frabs-514608`.
Never paste it into chat or commit it.

## Run locally

```bash
pip install -r requirements.txt
python -m pytest -q
uvicorn frab_worker.api:app --port 8000
```

Local runs default to the CSV dataset and offline mode, with no auth and no
credits spent. Set `FRAB_DATA_SOURCE=api` to use the live bank API.
