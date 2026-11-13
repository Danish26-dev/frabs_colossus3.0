# ─────────────────────────────────────────────────────────────────────────────
# FRAB frontend — GCP Cloud Run image (TanStack Start SSR via nitro node-server)
#
# IMPORTANT: the VITE_* values are BAKED INTO THE CLIENT BUNDLE AT BUILD TIME.
# They must be supplied as --build-arg (not runtime env) or the browser bundle
# will point at the wrong backends. Runtime env only affects the SSR server.
# ─────────────────────────────────────────────────────────────────────────────

# ---- build stage ----
FROM node:22-slim AS build
WORKDIR /app

# Build-time public config (safe to bake — these are public URLs, not secrets).
ARG VITE_FRAB_API_URL=https://frab-git-379796489354.asia-south1.run.app
ARG VITE_FRAB_WORKER_URL=https://beautiful-interaction-reg-listings.trycloudflare.com
ARG VITE_FRAB_VOICE_URL=https://frab-voice-200002205070.asia-south1.run.app
ARG VITE_FRAB_VOICE_TEST_PHONE=
ENV VITE_FRAB_API_URL=$VITE_FRAB_API_URL \
    VITE_FRAB_WORKER_URL=$VITE_FRAB_WORKER_URL \
    VITE_FRAB_VOICE_URL=$VITE_FRAB_VOICE_URL \
    VITE_FRAB_VOICE_TEST_PHONE=$VITE_FRAB_VOICE_TEST_PHONE \
    NITRO_PRESET=node-server

# Install dependencies. Using `npm install` (not `npm ci`) because the committed
# package-lock.json can drift from package.json (transitive deps like ajv);
# npm ci fails hard on any drift, npm install resolves against package.json.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Build the SSR + client bundle (nitro emits a Node server at .output/server).
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run injects PORT (default 8080); nitro's node-server honours it.
ENV PORT=8080

# The built server is fully self-contained under .output — no node_modules needed.
COPY --from=build /app/.output ./.output

EXPOSE 8080
CMD ["node", "./.output/server/index.mjs"]
