/**
 * FRAB Confidential Investigation Worker client.
 *
 * The worker (a FastAPI service on the GPU VM) is the AI engine of FRAB:
 * it takes a bank alert, runs the agentic investigation, and returns an
 * evidence-linked, audit-ready result. This module is the ONLY place that talks
 * to the worker.
 *
 * The bank API (frab-backend.ts) remains the alert source. The worker owns the
 * investigation: risk, evidence, findings, network, regulatory context, agent
 * reasoning and the recommendation.
 *
 * Everything is gated on VITE_FRAB_WORKER_URL — until it is set, IS_WORKER_LIVE
 * is false and the investigation screens keep their existing behaviour.
 */

/* ------------------------------------------------------------------ config */

export const WORKER_BASE_URL: string | undefined =
  (import.meta.env["VITE_FRAB_WORKER_URL"] as string | undefined) || undefined;

/** Optional query-param token. Native EventSource cannot send headers, so the
 *  worker accepts auth via ?token= — matches the scheme in CONTRACT_DIFF.md. */
export const WORKER_TOKEN: string | undefined =
  (import.meta.env["VITE_FRAB_WORKER_TOKEN"] as string | undefined) || undefined;

export const IS_WORKER_LIVE = Boolean(WORKER_BASE_URL);

function withToken(path: string): string {
  const url = `${WORKER_BASE_URL}${path}`;
  if (!WORKER_TOKEN) return url;
  return url + (url.includes("?") ? "&" : "?") + `token=${encodeURIComponent(WORKER_TOKEN)}`;
}

/* ---------------------------------------------------- raw worker contract */
/* Shapes below mirror CONTRACT_DIFF.md exactly — do not "improve" field names;
   the mapper (frab-worker-map.ts) is the single place that reconciles them. */

export type WorkerRecommendationAction =
  "CLOSE" | "MONITOR" | "ESCALATE" | "BLOCK" | "INSUFFICIENT_EVIDENCE";

export type WorkerRiskLevel = "HIGH" | "MEDIUM" | "LOW";

/** Each component: {value, weight, contribution, evidence, note}. Keyed by feature. */
export interface WorkerRiskComponent {
  value?: number | null;
  weight?: number | null;
  contribution?: number | null;
  evidence?: Record<string, unknown>;
  note?: string | null;
}

export interface WorkerCriticalSignal {
  feature: string;
  value: number;
  threshold: number;
  raised_to: string;
  note?: string;
}

export interface WorkerRisk {
  /** 0–1 scale on the worker; scaled to 0–100 in the mapper. */
  score: number | null;
  level: WorkerRiskLevel;
  /** Object keyed by feature name (amount_deviation, velocity, …). */
  components: Record<string, WorkerRiskComponent>;
  critical_signals?: WorkerCriticalSignal[];
}

export interface WorkerRecommendation {
  action: WorkerRecommendationAction;
  reason: string;
}

export interface WorkerEvidence {
  evidence_id: string;
  type: string;
  description: string;
  /** Structured evidence values (ratios, amounts, counts). */
  value: Record<string, unknown> | string | number | null;
  source: string;
  data_reference?: string;
}

export interface WorkerFinding {
  statement: string;
  evidence_refs: string[];
}

export interface WorkerNetworkNode {
  id: string;
  type: string; // DESTINATION | SENDER | ...
}

export interface WorkerNetworkEdge {
  source: string;
  target: string;
  transaction_id: string;
  amount: number;
  event_time: string;
}

export interface WorkerNetwork {
  nodes: WorkerNetworkNode[];
  edges: WorkerNetworkEdge[];
}

export interface WorkerRegulatoryEntry {
  source: string;
  reference: string;
  excerpt: string;
  relevance: string;
}

export interface WorkerTimelineItem {
  event: string;
  /** Unix epoch seconds (float). */
  timestamp: number | string;
}

export interface WorkerAgentTraceItem {
  case_id: string;
  event: string;
  agent: string;
  status: string;
  /** Unix epoch seconds (float). */
  timestamp: number | string;
  metadata?: Record<string, unknown>;
}

/** The deterministic-vs-LLM cross-check — powers the guardrail panel. */
export interface WorkerCrosscheck {
  deterministic_risk_level?: string;
  deterministic_risk_score?: number;
  deterministic_implied_recommendation?: string;
  llm_proposed_recommendation?: string;
  agree?: boolean;
}

export interface WorkerAgentic {
  mode?: string;
  steps?: number;
  transcript?: Array<Record<string, unknown>>;
  llm_proposed_recommendation?: string;
  llm_justification?: string;
  deterministic_crosscheck?: WorkerCrosscheck;
}

export interface WorkerCaseFile {
  agentic?: WorkerAgentic;
  [key: string]: unknown;
}

export interface WorkerResult {
  case_id: string;
  status?: string;
  investigation_tier?: string;
  risk: WorkerRisk;
  observed_pattern?: string | null;
  recommendation: WorkerRecommendation;
  evidence: WorkerEvidence[];
  findings: WorkerFinding[];
  network: WorkerNetwork;
  regulatory_context: WorkerRegulatoryEntry[];
  case_file?: WorkerCaseFile;
  completed_stages?: string[];
  failed_stages?: string[];
  agent_trace: WorkerAgentTraceItem[];
  timeline: WorkerTimelineItem[];
}

export interface WorkerStartRequest {
  case_id: string;
  alert_id: string;
  alert: { type: string; severity: string; transaction_id: string };
  customer_id: string;
}

export interface WorkerStartResponse {
  case_id: string;
  status?: string;
}

/** Live SSE event as emitted by the worker. */
export interface WorkerEvent {
  case_id?: string;
  event: string; // CASE_STARTED | SUPERVISOR_ACTIVE | AGENT_REASONING | ...
  agent?: string;
  status?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

/* --------------------------------------------------------------- transport */

/** Start an investigation on the worker. Returns the worker's case handle. */
export async function startWorkerInvestigation(
  req: WorkerStartRequest,
): Promise<WorkerStartResponse> {
  if (!WORKER_BASE_URL) throw new Error("No worker configured (VITE_FRAB_WORKER_URL unset)");
  const res = await fetch(withToken("/investigate"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`worker /investigate failed (${res.status})`);
  return (await res.json()) as WorkerStartResponse;
}

/** Fetch the full structured investigation result. */
export async function fetchWorkerResult(caseId: string): Promise<WorkerResult> {
  if (!WORKER_BASE_URL) throw new Error("No worker configured (VITE_FRAB_WORKER_URL unset)");
  const res = await fetch(withToken(`/investigate/${caseId}/result`));
  if (!res.ok) throw new Error(`worker result failed (${res.status})`);
  return (await res.json()) as WorkerResult;
}

/** Worker lifecycle status. */
export async function fetchWorkerStatus(caseId: string): Promise<{ status: string }> {
  if (!WORKER_BASE_URL) throw new Error("No worker configured (VITE_FRAB_WORKER_URL unset)");
  const res = await fetch(withToken(`/investigate/${caseId}/status`));
  if (!res.ok) throw new Error(`worker status failed (${res.status})`);
  return (await res.json()) as { status: string };
}

export interface SseHandlers {
  onEvent: (evt: WorkerEvent) => void;
  onError?: (err: unknown) => void;
  onDone?: () => void;
}

/**
 * Subscribe to the worker's live investigation event stream (SSE).
 *
 * Uses native EventSource with a query-param token (EventSource cannot set
 * headers). The worker emits a STREAM_END marker on completion so we close
 * cleanly. Returns an unsubscribe function.
 */
/**
 * The worker emits *named* SSE events (`event: WATCHMAN_ANALYZING`), not default
 * `message` events, so EventSource.onmessage never fires for them — we must
 * addEventListener for each name. This is the full event enum the worker sends.
 */
const WORKER_EVENT_NAMES = [
  "CASE_STARTED",
  "SUPERVISOR_ACTIVE",
  "WATCHMAN_ANALYZING",
  "WATCHMAN_COMPLETED",
  "DETECTIVE_AGENTIC_START",
  "DETECTIVE_ANALYZING",
  "DETECTIVE_COMPLETED",
  "AGENT_REASONING",
  "TOOL_SELECTED",
  "EVIDENCE_DISCOVERED",
  "JURIST_ASSESSING_RISK",
  "JURIST_COMPLETED",
  "SCRIBE_COMPILING_REPORT",
  "SCRIBE_COMPLETED",
  "INVESTIGATION_COMPLETE",
  "PARTIAL",
  "FAILED",
] as const;

const TERMINAL_EVENTS = new Set(["INVESTIGATION_COMPLETE", "PARTIAL", "FAILED"]);

export function subscribeToInvestigation(caseId: string, handlers: SseHandlers): () => void {
  if (!WORKER_BASE_URL || typeof EventSource === "undefined") return () => {};
  const url = withToken(`/investigate/${caseId}/events`);
  const source = new EventSource(url);
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    source.close();
  };

  const handle = (raw: string, fallbackName?: string) => {
    if (!raw) return;
    if (raw === "STREAM_END") {
      handlers.onDone?.();
      close();
      return;
    }
    try {
      const evt = JSON.parse(raw) as WorkerEvent;
      // Named-event frames may omit `event` in the body; use the SSE name.
      if (!evt.event && fallbackName) evt.event = fallbackName;
      if (evt.event === "STREAM_END") {
        handlers.onDone?.();
        close();
        return;
      }
      handlers.onEvent(evt);
      if (TERMINAL_EVENTS.has(evt.event)) {
        handlers.onDone?.();
        close();
      }
    } catch (err) {
      handlers.onError?.(err);
    }
  };

  // Named events (the worker's actual format).
  for (const name of WORKER_EVENT_NAMES) {
    source.addEventListener(name, (e) => handle((e as MessageEvent).data as string, name));
  }
  source.addEventListener("STREAM_END", () => {
    handlers.onDone?.();
    close();
  });
  // Default/unnamed frames, as a fallback.
  source.onmessage = (e) => handle(e.data as string);

  source.onerror = (err) => {
    // EventSource auto-reconnects; only surface the error, don't hard-close so
    // transient blips self-heal. Callers close via the returned unsubscribe.
    handlers.onError?.(err);
  };

  return close;
}
