# FRAB Frontend — Deploy to GCP Cloud Run

The frontend is a TanStack Start SSR app. The production build (nitro
`node-server` preset) emits a self-contained Node server at
`.output/server/index.mjs` that listens on `$PORT` — exactly what Cloud Run
needs. The `Dockerfile` builds and runs it.

## ⚠️ The one thing that trips everyone up: VITE_* is BUILD-TIME

The three backend URLs are read by Vite and **baked into the browser bundle at
build time**, not read at runtime. So they must be passed as Docker
`--build-arg` (they already have the current live values as defaults in the
`Dockerfile` and `cloudbuild.yaml`). Setting them as Cloud Run *runtime* env
vars does nothing for the client.

| Variable | Purpose | Current value (default) |
|---|---|---|
| `VITE_FRAB_API_URL` | Synthetic bank API | `https://frab-git-379796489354.asia-south1.run.app` |
| `VITE_FRAB_WORKER_URL` | Investigation worker (Gemma VM, HTTPS tunnel) | `https://beautiful-interaction-reg-listings.trycloudflare.com` |
| `VITE_FRAB_VOICE_URL` | Voice escalation service | `https://frab-voice-200002205070.asia-south1.run.app` |
| `VITE_FRAB_VOICE_TEST_PHONE` | Optional demo phone override | *(empty)* |

> Note: the worker is fronted by an HTTPS tunnel so it works from the HTTPS
> frontend (no mixed-content blocking). The tunnel URL is **temporary** — if the
> tunnel or VM restarts it changes, and the frontend must be rebuilt with the
> new `_WORKER_URL`. All three services (bank, worker, voice) are HTTPS.

---

## Prerequisites (one time)

```sh
gcloud auth login
gcloud config set project <YOUR_PROJECT_ID>
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# Artifact Registry repo to hold the image (once)
gcloud artifacts repositories create frab \
  --repository-format=docker \
  --location=asia-south1
```

---

## Option A — one command via Cloud Build (recommended)

Builds in the cloud, pushes, and deploys. Uses `cloudbuild.yaml`.

```sh
gcloud builds submit --config cloudbuild.yaml
```

Override a backend URL if it changes (e.g. new voice URL):

```sh
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_VOICE_URL=https://frab-voice-NEW.run.app
```

---

## Option B — build locally, then deploy

```sh
# 1. Build the image (bakes the public config into the bundle)
docker build \
  --build-arg VITE_FRAB_API_URL=https://frab-git-379796489354.asia-south1.run.app \
  --build-arg VITE_FRAB_WORKER_URL=https://beautiful-interaction-reg-listings.trycloudflare.com \
  --build-arg VITE_FRAB_VOICE_URL=https://frab-voice-200002205070.asia-south1.run.app \
  -t asia-south1-docker.pkg.dev/<PROJECT_ID>/frab/frab-frontend:latest .

# 2. Push
docker push asia-south1-docker.pkg.dev/<PROJECT_ID>/frab/frab-frontend:latest

# 3. Deploy
gcloud run deploy frab-frontend \
  --image asia-south1-docker.pkg.dev/<PROJECT_ID>/frab/frab-frontend:latest \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 8080
```

---

## Option C — source deploy (no Dockerfile handling by you)

Cloud Run builds from source using the `Dockerfile` automatically. Note: build
args aren't passed this way, so the `Dockerfile` defaults (current live URLs)
are used. To change a URL, use Option A/B instead.

```sh
gcloud run deploy frab-frontend \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 8080
```

---

## After deploy

Cloud Run prints a URL like `https://frab-frontend-xxxxx.asia-south1.run.app`.

**CORS reminder:** the browser now calls the bank / worker / voice services from
this new Cloud Run origin, not `localhost:8080`. Add the deployed origin to each
backend's CORS allowlist (bank, worker, voice) or those calls will be blocked.

Verify:

```sh
curl -s https://<your-cloud-run-url>/overview -o /dev/null -w "%{http_code}\n"   # expect 200
```

---

## Local sanity check before deploying

```sh
# Build the node-server output and run it like Cloud Run would
$env:NITRO_PRESET="node-server"; npm run build   # PowerShell
npm run start                                     # serves on PORT (default 3000)
```
