# FRAB Frontend — Deploy to GCP Cloud Run

The frontend is a TanStack Start SSR app. The production build (Nitro `node-server`
preset) emits a self-contained Node server at `.output/server/index.mjs` that listens
on `$PORT`, which is what Cloud Run needs. The `Dockerfile` builds and runs it.

The three backends are separate Cloud Run services, deployed on their own:

| Service | Purpose | URL |
|---|---|---|
| Bank API | Synthetic bank: alerts, cases, transactions | `https://frab-git-379796489354.asia-south1.run.app` |
| Investigation worker | Agents + 0G model inference, SSE stream | `https://frab-worker-379796489354.asia-south1.run.app` |
| Voice service | Vapi voice escalation | `https://frab-voice-379796489354.asia-south1.run.app` |

## The one thing that trips everyone up: `VITE_*` is build-time

Vite reads `VITE_*` values **when the app is built** and compiles them into the browser
bundle. Setting them as Cloud Run runtime env vars does nothing for the client. They are
passed as Docker `--build-arg` (the URLs have defaults in the `Dockerfile` and
`cloudbuild.yaml`). Changing a URL or token means rebuilding and redeploying.

| Variable | Purpose |
|---|---|
| `VITE_FRAB_API_URL` | Bank API base URL |
| `VITE_FRAB_WORKER_URL` | Investigation worker base URL (HTTPS) |
| `VITE_FRAB_WORKER_TOKEN` | Shared token for `/investigate*` (sent as `?token=`) |
| `VITE_FRAB_VOICE_URL` | Voice service base URL |
| `VITE_FRAB_VOICE_TOKEN` | Shared token for voice endpoints (sent as `Authorization: Bearer`) |

> **The tokens are not secrets once built.** Anything compiled into a browser bundle can be
> read by anyone who opens the site. The tokens deter casual abuse and keep the services
> from being open to the world; they are not user authentication. Never commit them. Pass
> them at build time only.

---

## Deploy from Cloud Shell

### 0. One-time setup

```sh
# the project that hosts the frontend (keeps the existing CORS-allowed URL working)
export PROJECT_ID=frab-507310
gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# Artifact Registry repo to hold the image (only the first time)
gcloud artifacts repositories create frab --repository-format=docker --location=asia-south1
```

### 1. Clone the repo

```sh
git clone https://github.com/Danish26-dev/frabs_colossus3.0.git
cd frabs_colossus3.0
```

### 2. Read the two tokens (from the project where the worker and voice services live)

```sh
export WORKER_TOKEN="$(gcloud secrets versions access latest --secret FRAB_API_TOKEN --project frabs-514608)"
export VOICE_TOKEN="$(gcloud secrets versions access latest --secret VOICE_API_TOKEN --project frabs-514608)"
```

### 3. Build, push and deploy with Cloud Build

```sh
gcloud builds submit --config cloudbuild.yaml --project $PROJECT_ID \
  --substitutions=_WORKER_TOKEN="$WORKER_TOKEN",_VOICE_TOKEN="$VOICE_TOKEN"
```

Override a URL if one changes:

```sh
gcloud builds submit --config cloudbuild.yaml --project $PROJECT_ID \
  --substitutions=_WORKER_URL=https://NEW-WORKER-URL,_WORKER_TOKEN="$WORKER_TOKEN",_VOICE_TOKEN="$VOICE_TOKEN"
```

### 4. Get the URL and check it

```sh
gcloud run services describe frab-frontend --region asia-south1 --format='value(status.url)'
curl -s -o /dev/null -w "%{http_code}\n" "$(gcloud run services describe frab-frontend --region asia-south1 --format='value(status.url)')/overview"   # expect 200
```

---

## After deploying: CORS must allow the deployed origin

The browser calls the bank, worker and voice services from the deployed frontend's origin,
not from `localhost:8080`. Each service must list that exact origin or the calls are
blocked. Test each one (replace `<FRONTEND_ORIGIN>` with the URL printed above):

```sh
for u in \
  https://frab-git-379796489354.asia-south1.run.app/alerts \
  https://frab-worker-379796489354.asia-south1.run.app/health \
  https://frab-voice-379796489354.asia-south1.run.app/health ; do
  echo "== $u"
  curl -s -D - -o /dev/null -H "Origin: <FRONTEND_ORIGIN>" "$u" | grep -i -E "^HTTP|access-control-allow-origin"
done
```

Every line must show `access-control-allow-origin` equal to your frontend origin. If one
doesn't, ask that service's owner to add the origin.

---

## Build locally instead

```sh
docker build \
  --build-arg VITE_FRAB_WORKER_TOKEN="$WORKER_TOKEN" \
  --build-arg VITE_FRAB_VOICE_TOKEN="$VOICE_TOKEN" \
  -t asia-south1-docker.pkg.dev/$PROJECT_ID/frab/frab-frontend:latest .
docker push asia-south1-docker.pkg.dev/$PROJECT_ID/frab/frab-frontend:latest
gcloud run deploy frab-frontend \
  --image asia-south1-docker.pkg.dev/$PROJECT_ID/frab/frab-frontend:latest \
  --region asia-south1 --allow-unauthenticated --port 8080
```

## Local sanity check before deploying

```sh
# PowerShell
$env:NITRO_PRESET = "node-server"; npm run build
npm run start      # serves on PORT (default 3000)
```
