# FRAB — Demo Rehearsal Script

**Duration:** ~4–5 minutes. **Centerpiece:** the ESCALATE-vs-CLOSE contrast + the guardrail panel.

**Before you start (pre-flight, 30s, off-stage):**
- Worker healthy: `GET https://frab-worker-379796489354.asia-south1.run.app/health` → `{"status":"ok","llm_mode":"0g"}` (`0g-mock` means no model is called)
- Frontend up at `http://localhost:8080` (HTTP, not HTTPS — avoids the SSE mixed-content block)
- The services scale to zero when idle, and the first request after that is slow. Open the worker `/health` and a case a minute before going on stage.
- Both cases are pre-run and cached on the worker, so results load instantly. A fresh launch takes ~20s (real model calls) — see the note under Case A.

---

## 0. The setup line (one sentence)

> "FRAB turns a bank's fraud alert into a full, audit-ready investigation — five AI agents pull the real banking data, reconstruct what happened, and hand the analyst an evidence-linked recommendation."

---

## Case A — the MULE case → **ESCALATE** (lead with this)

**Click path:**
1. Start on **Alert Intelligence** (`/alerts`). Point at the queue of real bank flags.
2. Click the **MULE_PATTERN** alert (`ALT0007`). The drawer opens — show the customer context (KYC, typical range).
3. Click **[ INITIALIZE INVESTIGATION ]** → lands in the **Investigation Workspace** (3D floor).
4. Watch the agents light up in sequence: **Supervisor → Watchman → Detective → Jurist → Scribe.** These are live events streaming from the worker, not an animation loop.
5. When it completes, go to **Investigation Results** → open `CASE0007`.

**What to say while the agents work:**
> "This is running live; the model call is served by 0G Private Computer. Detective is pulling the customer's real 41-transaction history, computing the deviation, and tracing the beneficiary network right now."

**Land on the result — the evidence:**
- Risk **61/100, HIGH**, pattern **MULE_COLLECTION**.
- Open the **Trace the Money** page → point at the fan-in.
> "Five distinct customers sent funds to this one destination within thirty minutes. That's the mule-collection signature — and it's computed from the real ledger, not guessed."
- Recommendation: **ESCALATE for STR consideration.**

**➜ THE GUARDRAIL MOMENT (page 06 — Audit-Ready Explanation). This is the line that wins the room:**
> "Here's the part that matters for compliance. The AI model actually proposed *INSUFFICIENT_EVIDENCE* — it wasn't sure. But our deterministic engine recomputed the answer from the evidence and confirmed **ESCALATE**, and *that's* what shipped. **The model can never silently override the computed numbers.** In an AML system, that guarantee is everything — every number on screen is auditable and reproducible, not an LLM's opinion."

*(Point directly at the panel: LLM PROPOSED `INSUFFICIENT_EVIDENCE` → DETERMINISTIC ENGINE `ESCALATE` → SHIPPED `ESCALATE`, "OVERRIDE APPLIED".)*

---

## Case B — the FALSE-POSITIVE → **CLOSE** (the contrast)

**Click path:** same path — back to **Alerts** → the `HIGH_VALUE_TRANSFER` alert (`ALT0010`) → Initialize → Workspace → Results → open `CASE0010`.

**The pitch — deliver the contrast explicitly:**
> "Same kind of high-value alert. But watch — opposite decision."

**Land on the result:**
- Risk **14/100, LOW**, pattern **NONE**.
- Open **Contextual Evidence** → point at the beneficiary line.
> "The system found the beneficiary is **established — five prior transfers** with this customer. A big transfer to someone you've paid five times before isn't fraud, it's Tuesday. So FRAB recommends **CLOSE** as a likely false positive."

**The kicker:**
> "Same alert type, opposite decision — and here's *exactly* why, line by line. That's the difference between an alarm and an investigation. Analysts drown in false positives; FRAB tells them which ones to ignore, with evidence."

---

## Close (30s)

> "So: five autonomous agents, driven by a privately hosted LLM, producing audit-ready cases — where the AI's judgment is always cross-checked against deterministic, reproducible numbers. The analyst still makes the final call; FRAB does the investigation. And it's designed to run inside a confidential compute enclave, so the bank's data never leaves a verifiable trusted environment."

---

## Timing / safety notes

- **Fresh launch takes ~20s** (real model calls). The live 3D event stream fills that window so it reads as "the agents are working," not "the app is hanging." If you want zero wait on stage, open the already-cached `CASE0007` / `CASE0010` directly from the Results library instead of launching fresh.
- **If the floor doesn't animate:** the SSE named-event fix should have resolved this. If ordering/timing looks off (vs. shape), check the worker's event emission order.
- **If the worker looks down:** re-check `/health`. If the worker URL changed, update `VITE_FRAB_WORKER_URL` in `.env` and restart the dev server.
- **One-liner to memorize:** *"The AI can never silently override the computed numbers."*
