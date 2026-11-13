# FRAB — Fraud Response & Autonomous Backbone

> **Moving Financial Security from Reactive Protection to Proactive Prevention.**

FRAB is an intelligent financial-security layer that sits on top of a bank's existing detection systems. When a transaction is flagged, FRAB investigates the story behind it: it gathers context and evidence, traces beneficiaries, maps findings to AML and compliance considerations, and produces an evidence-backed, audit-ready case. A human analyst always makes the final decision.

This repository is the **FRAB web application**: a cinematic landing page and the analyst console. It talks to three separate backend services (see [How it fits together](#how-it-fits-together)).

---

## What FRAB does

FRAB coordinates six specialised modules, orchestrated by a Supervisor:

| Module | Responsibility |
| --- | --- |
| **Supervisor** | Coordinates the investigation workflow, tracks case state and handles partial failures. |
| **Watchman** | Evaluates suspicious transaction signals and behavioural deviations against the customer's own baseline. |
| **Detective** | Investigates transaction history, beneficiary relationships and contextual evidence using deterministic tools. |
| **Jurist** | Evaluates relevant AML and compliance context and keeps regulatory evidence references. |
| **Scribe** | Builds the structured, evidence-backed investigation report and recommendation. |
| **Call Escalation** | Supports trusted customer verification by voice when more context is needed (analyst-triggered). |

**Design principle:** deterministic tools do the measuring (scores, deviations, network relationships); the language model reasons over that evidence and explains it. The model is not asked to invent values.

**Recommendations** are one of `ESCALATE`, `MONITOR`, `CLOSE_FALSE_POSITIVE` or `INSUFFICIENT_EVIDENCE`. FRAB supports bank decisions. It does not independently freeze accounts or reverse settled transfers.

## What is in this repository

**Landing page (`/`)**: a scroll-driven story built with React Three Fiber, Framer Motion and GSAP: a live financial-network hero, the customer story, the systemic gap, the FRAB reveal, an interactive agent map, a layered architecture view with honest status labels, security and trust, and the closing call to action. It respects reduced-motion settings and falls back gracefully without WebGL.

**Analyst console**

| Route | Purpose |
| --- | --- |
| `/overview` | Intelligence overview, analytics, dataset summary and the **Data Explorer** (every transaction and customer, kept current by polling the bank API). |
| `/alerts` | Alert queue with trigger conditions and a one-click hand-off to an investigation. |
| `/workspace`, `/investigation/:caseId` | Live investigation workspace: agent dialogue, evidence and a 3D investigation room. |
| `/result`, `/case/:caseId` | Case Book: evidence wall, reasoning chain, money trace, crime-DNA fingerprint, regulatory flow, audit timeline and decision room. |

## How it fits together

```text
                ┌──────────────────────────────┐
                │        FRAB web app          │   (this repository)
                └──────┬───────────┬───────────┘
        alerts, cases, │           │ start + stream
        transactions   │           │ investigations          voice escalation
                       ▼           ▼                               ▼
              ┌──────────────┐  ┌────────────────────┐   ┌──────────────────┐
              │ Bank API     │  │ Investigation      │   │ Voice service    │
              │ (synthetic   │  │ worker             │   │ (Vapi adapter)   │
              │  bank data)  │  │ (agents + 0G model)│   │                  │
              └──────────────┘  └────────────────────┘   └──────────────────┘
```

The three backends are **separate services and are not part of this repository**. Each one is optional at startup: if its URL is not set, the related screens show a clear "not connected" state (or, for the bank API, a labelled simulated feed).

## Capability status

| Capability | Status |
| --- | --- |
| Synthetic bank data and alert queue | Implemented |
| Backend API for alerts, cases, transactions, customers | Implemented |
| Supervisor and four specialist agents (worker) | Implemented |
| Deterministic analysis tools | Implemented |
| Model inference on 0G Private Computer (Private trust mode); the worker also has a mock mode that calls no model | Implemented |
| Voice escalation (Call Escalation) | Implemented |
| Evidence-backed case reports | Implemented |
| Worker and voice services on Cloud Run, case storage in Firestore | Implemented |
| Enclave attestation verified by FRAB itself | Planned |

All data is **synthetic**. No real customer information is used. This is a prototype, not a production system.

## Tech stack

- **Framework:** TanStack Start (SSR) and TanStack Router, React 19, TypeScript
- **Build:** Vite, Nitro (Node server output)
- **UI:** Tailwind CSS v4, shadcn/ui on Radix primitives
- **Motion and 3D:** Framer Motion, GSAP (ScrollTrigger), three.js with React Three Fiber and drei
- **Data:** TanStack Query, Recharts

## Getting started

**Prerequisites:** Node.js 22 and npm.

```bash
npm install
cp .env.example .env     # then fill in the values (see below)
npm run dev              # http://localhost:8080
```

Restart the dev server after changing `.env`. All `VITE_*` values are read at build time and baked into the client bundle, so they must be public URLs. Never put secrets in them.

### Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the dev server. |
| `npm run build` | Production build (SSR output in `.output`). |
| `npm run start` | Run the built server. |
| `npm run lint` | Lint with ESLint. |
| `npm run format` | Format with Prettier. |

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_FRAB_API_URL` | Recommended | Bank API base URL. When unset, the app uses a clearly labelled simulated feed. |
| `VITE_FRAB_WORKER_URL` | For live investigations | Investigation worker base URL. Must be HTTPS when the app is served over HTTPS. |
| `VITE_FRAB_WORKER_TOKEN` | For live investigations | Shared token the worker requires on `/investigate*` (sent as `?token=`). It ships in the client bundle, so it deters casual abuse but is not a secret. |
| `VITE_FRAB_VOICE_URL` | For voice escalation | Voice service base URL. |
| `VITE_FRAB_VOICE_TOKEN` | For voice escalation | Shared token the voice service requires (sent as `Authorization: Bearer`). Same caveat as above. |

`.env` is git-ignored. Use `.env.example` as the template.

## Project structure

```text
src/
├── routes/                 File-based routes (landing + console)
├── components/
│   ├── frab/               Landing page: hero, story acts, sections, nav
│   │   └── story/          Cinematic acts, Aarav character, hero 3D scene
│   ├── app/                Console: overview, alerts, workspace, result
│   └── ui/                 shadcn/ui components
├── hooks/                  Data and interaction hooks (ledger, voice, investigation run)
├── lib/                    API clients and adapters (bank, worker, voice, ledger)
└── styles.css              Design tokens and global styles
```

## Deployment

The app builds to a self-contained Node server (`.output`) and ships as a container for Cloud Run. See [`DEPLOY_CLOUDRUN.md`](./DEPLOY_CLOUDRUN.md) for the Docker and Cloud Build steps. Because `VITE_*` values are baked in at build time, changing a backend URL requires a rebuild.

The voice service contract used by the frontend is documented in [`VOICE_CONTRACT.md`](./VOICE_CONTRACT.md).

## Known limitations

- Data is synthetic, and the dataset is fixed. The data explorer follows the bank API by polling, not by a push stream.
- Live investigations need the investigation worker to be reachable. Without it, those screens show a "not connected" state.
- The bank API serves the full ledger uncompressed (about 4 MB), so the Data Explorer loads it once per session in chunks.
- Only the model call runs on 0G Private Computer. The worker, tools, storage and this site run outside that boundary. FRAB does not yet verify the enclave's attestation itself; that is planned.
- `VITE_*` tokens are compiled into the browser bundle, so they are a deterrent, not user authentication.

## License

MIT. See [`LICENSE`](./LICENSE).
