/**
 * Inference status, derived from what the worker actually reports on GET /health.
 *
 * Model inference runs on 0G Private Computer (Private trust mode). The worker, case storage
 * and this console run on Cloud Run / Firestore and are NOT inside that enclave boundary.
 * FRAB does not verify enclave attestation itself, so nothing here ever says "verified".
 */

import type { ConfidentialState } from "./frab-investigation";

/**
 *  "0g"       real inference on 0G Private Computer
 *  "0g-mock"  scripted text, no model call (spends nothing)
 *  "offline"  the worker is up but has no inference configured
 *  "down"     the worker could not be reached
 *  "unset"    no worker URL is configured in this build
 *  "checking" first probe still in flight
 */
export type LlmMode = "0g" | "0g-mock" | "offline" | "down" | "unset" | "checking";

export function normalizeLlmMode(raw: string | undefined | null): LlmMode {
  const m = (raw ?? "").toLowerCase();
  if (m === "0g" || m === "0g-mock" || m === "offline") return m;
  return "offline";
}

export type DotState = "ok" | "warn" | "bad" | "idle";

export interface InferenceBadge {
  /** Short, for tight status rows. */
  short: string;
  /** Longer, for sidebars and panels. */
  long: string;
  dot: DotState;
}

export function inferenceBadge(mode: LlmMode): InferenceBadge {
  switch (mode) {
    case "0g":
      return { short: "LIVE", long: "PRIVATE INFERENCE · 0G", dot: "ok" };
    case "0g-mock":
      return { short: "MOCK MODE", long: "INFERENCE · MOCK MODE", dot: "warn" };
    case "offline":
      return { short: "OFFLINE", long: "INFERENCE · OFFLINE", dot: "bad" };
    case "down":
      return { short: "UNREACHABLE", long: "WORKER UNREACHABLE", dot: "bad" };
    case "checking":
      return { short: "CHECKING", long: "CHECKING WORKER", dot: "idle" };
    default:
      return { short: "NOT CONNECTED", long: "WORKER NOT CONNECTED", dot: "idle" };
  }
}

/** The "private inference" rows of the workspace, driven by real state instead of constants. */
export function liveConfidential(mode: LlmMode, llmErrorCode: string | null): ConfidentialState {
  const reachable = mode === "0g" || mode === "0g-mock" || mode === "offline";
  const channel = reachable ? "HTTPS" : "NOT CONNECTED";
  // Attestation is never claimed: FRAB does not verify the enclave itself.
  const attestation = reachable ? "NOT VERIFIED BY FRAB" : "NOT CONNECTED";
  if (mode === "0g") {
    return {
      tee: "0G PRIVATE COMPUTER (PRIVATE MODE)",
      attestation,
      channel,
      model: "0G PRIVATE INFERENCE",
      inference: llmErrorCode ? `ERROR · ${llmErrorCode}` : "LIVE",
    };
  }
  if (mode === "0g-mock") {
    return {
      tee: "NONE (MOCK MODE)",
      attestation,
      channel,
      model: "SCRIPTED · NO MODEL CALLED",
      inference: "MOCK MODE",
    };
  }
  if (mode === "offline") {
    return { tee: "NOT CONFIGURED", attestation, channel, model: "NOT CONFIGURED", inference: "OFFLINE" };
  }
  if (mode === "checking") {
    return { tee: "CHECKING", attestation: "CHECKING", channel: "CHECKING", model: "CHECKING", inference: "CHECKING" };
  }
  return {
    tee: "NOT CONNECTED",
    attestation: "NOT CONNECTED",
    channel: "NOT CONNECTED",
    model: "NOT CONNECTED",
    inference: "NOT CONNECTED",
  };
}
