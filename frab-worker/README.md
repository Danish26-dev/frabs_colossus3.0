# FRAB Investigation Worker

The investigation worker for FRAB (Financial Risk Analysis & Behavioral
Investigation). It receives a bank-generated alert, investigates it against
banking context, and returns an evidence-linked recommendation for a human
analyst. Model inference runs on 0G Private Computer under Private trust mode
(TEE-backed providers only); the worker itself runs on Cloud Run.

## Governing rule

> Every important number and every important conclusion returned by the
> investigation must be traceable to either deterministic computation or a
> specific evidence ID. The LLM is never the source of truth.

The deterministic foundation (no AI involved):

- `data_access/` — clean loaders over the synthetic-bank CSVs
- `features/`     — deterministic 0–1 risk features
- `scoring/`      — configurable weighted risk score
- `config/`       — feature thresholds and score weights (tunable, explainable)
- `tests/`        — verification against the 10 demo scenarios

## Key integrity guarantees

1. **Baseline trigger-exclusion.** Behavioural baselines are recomputed from raw
   `transactions.csv` with the trigger transaction removed, so the transaction
   under investigation can never influence the baseline it is judged against.
2. **Answer-key isolation.** `cases.csv`, `demo_runs.csv`, and
   `cases.investigation_note` are NEVER used as investigation inputs. They are
   used only as test oracles (what a correct investigation *should* conclude).
3. **Deterministic scoring.** The risk score is a configurable weighted sum of
   normalized features computed in Python. No LLM involvement.

## Phase 0 scope

Given a trigger transaction id, produce:
- normalized feature values (each 0–1) with the raw evidence behind them
- a deterministic risk score + component breakdown + risk level

## Data

Reads the CSVs in `../FRAB_DEMO_READY_DATASET/` by default (configurable via
`FRAB_DATA_DIR`). See that folder's README for schemas.

## Run

```bash
python -m pytest -q                 # run the full test suite (85 tests)
python -m frab_worker.main SCN01    # run one scenario end-to-end (deterministic)

# start the API service
uvicorn frab_worker.api:app --reload --port 8000
# then POST an investigation (see CONTRACT.md):
#   POST /investigate  -> STARTED
#   GET  /investigate/{case_id}/status
#   GET  /investigate/{case_id}/events   (SSE)
#   GET  /investigate/{case_id}/result
#   GET  /health  |  GET /readiness
```

## Interface contract

`CONTRACT.md` is the wire contract between this worker and the FRAB backend
(request/result/event/error schemas, event enum, recommendation set). Freeze it
with the backend owner before integrating.

## LLM mode

Runs offline-deterministic by default (no model needed).

Production inference is **0G Private Computer** (`LLM_PROVIDER=0g`), always sent
with `X-0G-Provider-Trust-Mode: private`. It ships in **mock mode**
(`LLM_MOCK_MODE=true`, the default): a scripted client that makes no network
calls and spends no credits. See `.env.example` for every setting. Real
inference needs `ZG_API_KEY` and `ZG_MODEL` and `LLM_MOCK_MODE=false`.
