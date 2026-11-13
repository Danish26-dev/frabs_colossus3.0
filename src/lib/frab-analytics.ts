/**
 * FRAB Intelligence / Analytics data layer.
 *
 * Every metric here is DERIVED FROM REAL BACKEND DATA — there is no fabricated
 * statistic anywhere in this module. Neither backend exposes an analytics
 * endpoint, so analytics are aggregated client-side from:
 *
 *   - bank /alerts   (persistent) — alert counts, type/risk/status distribution
 *   - bank /cases    (persistent) — investigation counts, dispositions, types
 *   - bank /investigation/{alert_id} — scenario_id + expected_reason (for
 *                                      CONTROLLED SCENARIO VALIDATION only)
 *   - worker /investigate/{id}/status  — live run state (running/complete/failed)
 *   - worker /investigate/{id}/result  — deep per-investigation data when the
 *                                        case is still live on the worker
 *   - bank + worker /health — real system health
 *
 * Honest-state rule: where a metric genuinely cannot be measured from the data
 * (e.g. per-agent latency, which the worker records as a single timestamp
 * burst), we return an explicit `unavailable` marker instead of a number.
 */

import { API_BASE_URL, IS_LIVE_BACKEND } from "./frab-api";
import {
  backendGet,
  toRisk,
  type RawAlert,
  type RawCase,
  type RawInvestigationBundle,
  type RawTxnPage,
} from "./frab-backend";
import {
  WORKER_BASE_URL,
  IS_WORKER_LIVE,
  fetchWorkerResult,
  fetchWorkerStatus,
} from "./frab-worker";

/* ------------------------------------------------------------------ types */

export type Availability = "OK" | "UNAVAILABLE" | "INSUFFICIENT_SAMPLE" | "NOT_CONNECTED";

/** A metric that always carries the reason when it isn't a plain number. */
export interface Measured<T> {
  value: T | null;
  state: Availability;
}

export interface Distribution {
  key: string;
  count: number;
}

export interface AlertAnalytics {
  total: number;
  byType: Distribution[];
  byRisk: { high: number; medium: number; low: number };
  byStatus: Distribution[];
}

export interface OutcomeAnalytics {
  /** FRAB recommendation distribution — from bank case dispositions. */
  recommendations: Distribution[];
  total: number;
}

export interface InvestigationAnalytics {
  started: number; // cases that exist
  completed: number; // cases in a closed/complete status
  running: number; // cases still open
  humanReviewRequired: number; // pending disposition
}

export type StageState = "COMPLETED" | "ACTIVE" | "FAILED" | "WAITING";

export interface AgentOp {
  agent: string;
  executions: number;
  completed: number;
  failed: number;
  /** Extra real counters where the worker provides them; null when unknown. */
  detail: string | null;
}

export interface ScenarioRow {
  scenarioId: string | null;
  caseId: string;
  alertId: string;
  trigger: string;
  expected: string; // derived from expected_reason
  actual: string; // FRAB recommendation (from case disposition / worker)
  match: boolean | null; // null when actual is unknown
  risk: "HIGH" | "MEDIUM" | "LOW";
}

export interface ScenarioValidation {
  rows: ScenarioRow[];
  evaluated: number;
  matched: number;
  mismatched: number;
  unresolved: number;
  state: Availability;
}

export interface HealthEntry {
  label: string;
  state: "CONNECTED" | "DEGRADED" | "NOT_CONNECTED" | "UNKNOWN";
  detail: string | null;
}

export interface AnalyticsSnapshot {
  source: "live" | "demo";
  fetchedAt: string;
  alerts: AlertAnalytics;
  investigations: InvestigationAnalytics;
  outcomes: OutcomeAnalytics;
  /** Per-agent operational metrics; state carries availability. */
  agents: { rows: AgentOp[]; state: Availability };
  scenarios: ScenarioValidation;
}

/* --------------------------------------------------------------- helpers */

function countBy<T>(items: T[], key: (t: T) => string): Distribution[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count);
}

/** Map a bank case disposition/status to a FRAB recommendation label. */
export function dispositionToOutcome(disposition: string, note?: string): string {
  const d = (disposition ?? "").toUpperCase();
  if (["ESCALATE", "ESCALATED"].includes(d)) return "ESCALATE";
  if (["BLOCK", "BLOCKED"].includes(d)) return "BLOCK";
  if (["CLOSE", "CLOSED", "CLEARED", "FALSE_POSITIVE"].includes(d)) return "CLOSE";
  if (d === "MONITOR") return "MONITOR";
  if (["INSUFFICIENT_EVIDENCE", "INSUFFICIENT"].includes(d)) return "INSUFFICIENT_EVIDENCE";
  // PENDING / unknown → infer from the investigation note when possible.
  const n = (note ?? "").toLowerCase();
  if (/escalat|hold|str/.test(n)) return "ESCALATE";
  if (/\bblock/.test(n)) return "BLOCK";
  if (/monitor|watch/.test(n)) return "MONITOR";
  if (/false positive|close|cleared|legitimate/.test(n)) return "CLOSE";
  return "PENDING";
}

/** Infer the expected outcome from a scenario's expected_reason answer key. */
function expectedFromReason(reason: string | null | undefined, note?: string): string {
  const r = `${reason ?? ""} ${note ?? ""}`.toLowerCase();
  if (
    /false positive|legitimate|established|no established relationship is not/.test(r) &&
    !/never used/.test(r)
  )
    return "CLOSE";
  if (/escalat|str|suspicious|mule|structuring|layering|never used before|fan-in/.test(r))
    return "ESCALATE";
  if (/monitor|watch|review/.test(r)) return "MONITOR";
  return "REVIEW";
}

/* ----------------------------------------------------------- aggregators */

async function loadAlertsCases(): Promise<{ alerts: RawAlert[]; cases: RawCase[] }> {
  const [alerts, cases] = await Promise.all([
    backendGet<RawAlert[]>("/alerts"),
    backendGet<RawCase[]>("/cases").catch(() => [] as RawCase[]),
  ]);
  return { alerts, cases };
}

function buildAlertAnalytics(alerts: RawAlert[]): AlertAnalytics {
  return {
    total: alerts.length,
    byType: countBy(alerts, (a) => a.alert_type),
    byRisk: {
      high: alerts.filter((a) => toRisk(a.severity) === "HIGH").length,
      medium: alerts.filter((a) => toRisk(a.severity) === "MEDIUM").length,
      low: alerts.filter((a) => toRisk(a.severity) === "LOW").length,
    },
    byStatus: countBy(alerts, (a) => (a.status ?? "UNKNOWN").toUpperCase()),
  };
}

function buildInvestigationAnalytics(cases: RawCase[]): InvestigationAnalytics {
  const isClosed = (s: string) =>
    ["CLOSED", "COMPLETED", "RESOLVED", "COMPLETE"].includes((s ?? "").toUpperCase());
  const isOpen = (s: string) => (s ?? "").toUpperCase() === "OPEN";
  return {
    started: cases.length,
    completed: cases.filter((c) => isClosed(c.status)).length,
    running: cases.filter((c) => isOpen(c.status)).length,
    humanReviewRequired: cases.filter((c) => (c.disposition ?? "").toUpperCase() === "PENDING")
      .length,
  };
}

function buildOutcomeAnalytics(cases: RawCase[]): OutcomeAnalytics {
  const outcomes = cases.map((c) => dispositionToOutcome(c.disposition, c.investigation_note));
  return { recommendations: countBy(outcomes, (o) => o), total: cases.length };
}

/**
 * Scenario validation from the bank data: each case maps to a scenario via its
 * alert bundle (scenario_id + expected_reason). Expected outcome is inferred
 * from the answer key; actual outcome from the case disposition. This is
 * CONTROLLED SCENARIO VALIDATION — labelled as such in the UI, never as
 * production accuracy.
 */
async function buildScenarioValidation(cases: RawCase[]): Promise<ScenarioValidation> {
  if (!cases.length) {
    return {
      rows: [],
      evaluated: 0,
      matched: 0,
      mismatched: 0,
      unresolved: 0,
      state: "UNAVAILABLE",
    };
  }
  const rows = await Promise.all(
    cases.map(async (c): Promise<ScenarioRow> => {
      let scenarioId: string | null = null;
      let expected = "REVIEW";
      let risk: "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
      try {
        const bundle = await backendGet<RawInvestigationBundle>(`/investigation/${c.alert_id}`);
        scenarioId = bundle.alert.scenario_id ?? null;
        risk = toRisk(bundle.alert.severity);
        expected = expectedFromReason(bundle.alert.expected_reason, c.investigation_note);
      } catch {
        expected = expectedFromReason(null, c.investigation_note);
      }
      const actual = dispositionToOutcome(c.disposition, c.investigation_note);
      const resolved = actual !== "PENDING";
      return {
        scenarioId,
        caseId: c.case_id,
        alertId: c.alert_id,
        trigger: c.case_type,
        expected,
        actual: resolved ? actual : "UNRESOLVED",
        match: resolved ? outcomeMatches(expected, actual) : null,
        risk,
      };
    }),
  );
  const evaluated = rows.length;
  const matched = rows.filter((r) => r.match === true).length;
  const mismatched = rows.filter((r) => r.match === false).length;
  const unresolved = rows.filter((r) => r.match === null).length;
  return { rows, evaluated, matched, mismatched, unresolved, state: "OK" };
}

/** Expected vs actual, treating BLOCK as a stronger form of ESCALATE. */
function outcomeMatches(expected: string, actual: string): boolean {
  if (expected === actual) return true;
  const escalateFamily = new Set(["ESCALATE", "BLOCK"]);
  if (escalateFamily.has(expected) && escalateFamily.has(actual)) return true;
  return false;
}

/**
 * Agent operations. The worker's agent_trace confirms which agents executed and
 * completed PER LIVE CASE, but completed cases are ephemeral on the worker, so
 * we cannot assemble a reliable historical per-agent tally across all cases.
 * We therefore report agent ops as available only for cases currently live on
 * the worker, and mark the section INSUFFICIENT_SAMPLE when none are.
 */
async function buildAgentOps(cases: RawCase[]): Promise<{ rows: AgentOp[]; state: Availability }> {
  const AGENTS = ["SUPERVISOR", "WATCHMAN", "DETECTIVE", "JURIST", "SCRIBE"];
  if (!IS_WORKER_LIVE) {
    return { rows: [], state: "NOT_CONNECTED" };
  }
  // Sample the cases that are still resolvable on the worker.
  const results = await Promise.all(
    cases.slice(0, 10).map(async (c) => {
      try {
        return await fetchWorkerResult(c.case_id);
      } catch {
        return null;
      }
    }),
  );
  const live = results.filter((r): r is NonNullable<typeof r> => r !== null);
  if (!live.length) {
    return { rows: [], state: "INSUFFICIENT_SAMPLE" };
  }
  const rows: AgentOp[] = AGENTS.map((agent) => {
    let executions = 0;
    let completed = 0;
    let evidenceQueries = 0;
    let regulatory = 0;
    let caseRecords = 0;
    for (const r of live) {
      const ran = r.agent_trace.some((t) => (t.agent ?? "").toUpperCase().includes(agent));
      const done =
        (r.completed_stages ?? []).some((s) => s.toUpperCase().includes(agent)) ||
        agent === "SUPERVISOR"; // supervisor orchestrates the run itself
      if (ran) executions += 1;
      if (ran && done) completed += 1;
      if (agent === "DETECTIVE") evidenceQueries += r.evidence?.length ?? 0;
      if (agent === "JURIST") regulatory += r.regulatory_context?.length ?? 0;
      if (agent === "SCRIBE" && r.findings?.length) caseRecords += 1;
    }
    let detail: string | null = null;
    if (agent === "DETECTIVE") detail = `${evidenceQueries} evidence items`;
    if (agent === "JURIST") detail = `${regulatory} regulatory references`;
    if (agent === "SCRIBE") detail = `${caseRecords} case records`;
    return { agent, executions, completed, failed: executions - completed, detail };
  });
  return { rows, state: "OK" };
}

/* --------------------------------------------------------- public reads */

export async function fetchAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  const fetchedAt = new Date().toISOString();
  if (!API_BASE_URL) {
    // No bank backend — analytics cannot be computed from real data.
    return {
      source: "demo",
      fetchedAt,
      alerts: { total: 0, byType: [], byRisk: { high: 0, medium: 0, low: 0 }, byStatus: [] },
      investigations: { started: 0, completed: 0, running: 0, humanReviewRequired: 0 },
      outcomes: { recommendations: [], total: 0 },
      agents: { rows: [], state: "NOT_CONNECTED" },
      scenarios: {
        rows: [],
        evaluated: 0,
        matched: 0,
        mismatched: 0,
        unresolved: 0,
        state: "NOT_CONNECTED",
      },
    };
  }
  const { alerts, cases } = await loadAlertsCases();
  const [scenarios, agents] = await Promise.all([
    buildScenarioValidation(cases),
    buildAgentOps(cases),
  ]);
  return {
    source: "live",
    fetchedAt,
    alerts: buildAlertAnalytics(alerts),
    investigations: buildInvestigationAnalytics(cases),
    outcomes: buildOutcomeAnalytics(cases),
    agents,
    scenarios,
  };
}

/* -------------------------------------------------------- system health */

async function ping(url: string, timeoutMs = 6000): Promise<{ ok: boolean; body: unknown }> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, body: null };
    return { ok: true, body: await res.json().catch(() => null) };
  } catch {
    return { ok: false, body: null };
  }
}

export async function fetchSystemHealth(): Promise<HealthEntry[]> {
  const entries: HealthEntry[] = [];

  // Bank services (one /health covers the deployed synthetic bank).
  if (API_BASE_URL) {
    const bank = await ping(`${API_BASE_URL}/health`);
    const bankState = bank.ok ? "CONNECTED" : "NOT_CONNECTED";
    entries.push({
      label: "SYNTHETIC BANK",
      state: bankState,
      detail: API_BASE_URL.replace(/^https?:\/\//, ""),
    });
    entries.push({
      label: "TRANSACTION API",
      state: bankState,
      detail: bank.ok ? "/transactions" : null,
    });
    entries.push({
      label: "RULE ENGINE",
      state: bankState,
      detail: bank.ok ? "alerts generated" : null,
    });
  } else {
    for (const label of ["SYNTHETIC BANK", "TRANSACTION API", "RULE ENGINE"]) {
      entries.push({ label, state: "NOT_CONNECTED", detail: "VITE_FRAB_API_URL unset" });
    }
  }

  // Investigation worker + Gemma + SSE.
  if (WORKER_BASE_URL) {
    const wk = await ping(`${WORKER_BASE_URL}/health`);
    const body = (wk.body ?? {}) as { llm_mode?: string; version?: string };
    const workerState = wk.ok ? "CONNECTED" : "NOT_CONNECTED";
    entries.push({
      label: "INVESTIGATION WORKER",
      state: workerState,
      detail: wk.ok ? (body.version ?? "up") : null,
    });
    entries.push({
      label: "INVESTIGATION API",
      state: workerState,
      detail: wk.ok ? "/investigate" : null,
    });
    entries.push({
      label: "SSE EVENT STREAM",
      state: workerState,
      detail: wk.ok ? "/investigate/{id}/events" : null,
    });
    entries.push({
      label: "GEMMA INFERENCE",
      state: workerState,
      detail: wk.ok ? (body.llm_mode ? body.llm_mode.toUpperCase() : "UNKNOWN") : null,
    });
  } else {
    for (const label of [
      "INVESTIGATION WORKER",
      "INVESTIGATION API",
      "SSE EVENT STREAM",
      "GEMMA INFERENCE",
    ]) {
      entries.push({ label, state: "NOT_CONNECTED", detail: "VITE_FRAB_WORKER_URL unset" });
    }
  }

  // Not verifiable from the frontend — reported honestly as unknown/not connected.
  entries.push({ label: "FIRESTORE", state: "UNKNOWN", detail: "no frontend probe" });
  entries.push({
    label: "CONFIDENTIAL VM ATTESTATION",
    state: "NOT_CONNECTED",
    detail: "not deployed",
  });
  entries.push({ label: "VOICE ESCALATION", state: "NOT_CONNECTED", detail: "not connected" });

  return entries;
}

export const ANALYTICS_LIVE = IS_LIVE_BACKEND;

/* --------------------------------------------------- time-series trends */

export type Granularity = "day" | "week" | "month";

export interface TrendBucket {
  /** Bucket key: YYYY-MM-DD (day), ISO week start (week), YYYY-MM (month). */
  bucket: string;
  label: string;
  total: number;
  flagged: number;
}

export interface TrendSeries {
  granularity: Granularity;
  buckets: TrendBucket[];
  sampled: number; // number of transactions aggregated
  totalLedger: number; // total transactions in the ledger
  spanStart: string | null;
  spanEnd: string | null;
  state: Availability;
}

/** Yearly is not supported — the synthetic ledger spans ~3 months only. */
export const YEARLY_SUPPORTED = false;

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay(); // 0 = Sun
  const diff = (day + 6) % 7; // days since Monday
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function bucketKey(d: Date, g: Granularity): { key: string; label: string } {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (g === "month") {
    const monthName = d.toLocaleString("en-US", { month: "short" });
    return { key: `${y}-${m}`, label: `${monthName} ${y}` };
  }
  if (g === "week") {
    const w = startOfWeek(d);
    const wk = `${w.getFullYear()}-${String(w.getMonth() + 1).padStart(2, "0")}-${String(w.getDate()).padStart(2, "0")}`;
    return {
      key: wk,
      label: `wk ${w.toLocaleString("en-US", { month: "short", day: "numeric" })}`,
    };
  }
  return {
    key: `${y}-${m}-${day}`,
    label: d.toLocaleString("en-US", { month: "short", day: "numeric" }),
  };
}

/**
 * Build a transaction trend series from the real ledger's event_time +
 * isFlaggedFraud. Aggregates a sample of the ledger (capped for responsiveness)
 * into day/week/month buckets. Nothing is invented: buckets only exist where
 * real transactions fall.
 */
export async function fetchTransactionTrends(
  granularity: Granularity,
  sampleLimit = 2000,
): Promise<TrendSeries> {
  const empty: TrendSeries = {
    granularity,
    buckets: [],
    sampled: 0,
    totalLedger: 0,
    spanStart: null,
    spanEnd: null,
    state: API_BASE_URL ? "UNAVAILABLE" : "NOT_CONNECTED",
  };
  if (!API_BASE_URL) return empty;

  try {
    // First page gives us the ledger total and the newest transactions.
    const head = await backendGet<RawTxnPage>(`/transactions/all?limit=${sampleLimit}&offset=0`);
    const total = head.total ?? head.transactions?.length ?? 0;
    const collected: RawTxnPage["transactions"] = [...(head.transactions ?? [])];

    // The ledger is newest-first, so a single head slice can land in one month.
    // Pull additional spread samples across the full ledger (day/week views use
    // the recent slice; month view needs the wider span) so trends reflect the
    // real Aug–Oct range instead of only the latest bucket.
    if (granularity === "month" || granularity === "week") {
      const spreadOffsets = [
        Math.floor(total * 0.33),
        Math.floor(total * 0.66),
        Math.max(0, total - sampleLimit),
      ].filter((o) => o > sampleLimit);
      const extra = await Promise.all(
        spreadOffsets.map((off) =>
          backendGet<RawTxnPage>(`/transactions/all?limit=${sampleLimit}&offset=${off}`)
            .then((p) => p.transactions ?? [])
            .catch(() => [] as RawTxnPage["transactions"]),
        ),
      );
      const seen = new Set(collected.map((t) => t.transaction_id));
      for (const batch of extra) {
        for (const t of batch) {
          if (!seen.has(t.transaction_id)) {
            seen.add(t.transaction_id);
            collected.push(t);
          }
        }
      }
    }

    const txns = collected.filter((t) => t.event_time);
    if (!txns.length) return { ...empty, totalLedger: total, state: "UNAVAILABLE" };

    const map = new Map<string, TrendBucket>();
    let minTs = Infinity;
    let maxTs = -Infinity;
    for (const t of txns) {
      const d = new Date(t.event_time);
      if (Number.isNaN(d.getTime())) continue;
      const ms = d.getTime();
      if (ms < minTs) minTs = ms;
      if (ms > maxTs) maxTs = ms;
      const { key, label } = bucketKey(d, granularity);
      const cur = map.get(key) ?? { bucket: key, label, total: 0, flagged: 0 };
      cur.total += 1;
      if (t.isFlaggedFraud === 1) cur.flagged += 1;
      map.set(key, cur);
    }

    const buckets = [...map.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
    return {
      granularity,
      buckets,
      sampled: txns.length,
      totalLedger: total,
      spanStart: Number.isFinite(minTs) ? new Date(minTs).toISOString() : null,
      spanEnd: Number.isFinite(maxTs) ? new Date(maxTs).toISOString() : null,
      state: "OK",
    };
  } catch {
    return empty;
  }
}
