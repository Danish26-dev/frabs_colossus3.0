/**
 * Maps the worker's result contract onto the UI's InvestigationResult.
 *
 * This is the single reconciliation point between the worker's output
 * (CONTRACT_DIFF.md) and the Result-console types. The UI contract stays
 * stable; only this file changes if the worker's shapes move.
 */

import type {
  InvestigationResult,
  RiskComponent,
  EvidenceItem,
  Finding,
  RegulatoryEntry,
  TimelineEvent,
  NetworkGraph,
  NetworkNode,
  NetworkEdge,
  NetworkNodeKind,
  PipelineStep,
  Recommendation,
  RiskLevel,
  ResultStatus,
  AgentContribution,
  GuardrailInfo,
} from "./frab-result";
import type {
  WorkerResult,
  WorkerRiskComponent,
  WorkerEvidence,
  WorkerFinding,
  WorkerNetworkNode,
  WorkerNetworkEdge,
  WorkerRegulatoryEntry,
  WorkerAgentTraceItem,
  WorkerTimelineItem,
} from "./frab-worker";

/** Alert-side context the worker result does not carry (comes from the bank). */
export interface AlertContext {
  alertId: string;
  type: string;
  customer: string;
  account: string;
  transaction: string | null;
  risk?: RiskLevel;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function toRiskLevel(level: string | undefined): RiskLevel {
  const s = (level ?? "").toUpperCase();
  return s === "HIGH" ? "HIGH" : s === "LOW" ? "LOW" : "MEDIUM";
}

function toRecommendation(action: string): Recommendation {
  const s = (action ?? "").toUpperCase();
  if (["CLOSE", "MONITOR", "ESCALATE", "BLOCK", "INSUFFICIENT_EVIDENCE"].includes(s)) {
    return s as Recommendation;
  }
  return "MONITOR";
}

function resultStatusOf(status: string | undefined, recommendation: Recommendation): ResultStatus {
  const s = (status ?? "").toUpperCase();
  if (s === "PARTIAL") return "PARTIAL";
  if (recommendation === "INSUFFICIENT_EVIDENCE" || s === "INSUFFICIENT_EVIDENCE") {
    return "INSUFFICIENT_EVIDENCE";
  }
  return "COMPLETE";
}

/** risk.components is an object keyed by feature; flatten to the UI array. */
function mapComponents(
  components: Record<string, WorkerRiskComponent> | undefined,
): RiskComponent[] {
  if (!components) return [];
  return Object.entries(components).map(([key, c]) => ({
    key,
    label: key.replace(/_/g, " ").toUpperCase(),
    // component value is 0–1; present as 0–100.
    score: typeof c.value === "number" ? Math.round(c.value * 100) : null,
    evidenceIds: [],
    detail: c.note ?? null,
  }));
}

/** Turn a structured evidence value object into a readable one-liner. */
function stringifyValue(value: WorkerEvidence["value"]): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number") return String(value);
  // Object of {ratio, trigger_amount, ...} — surface the most useful fields.
  const v = value as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof v["ratio"] === "number") parts.push(`${(v["ratio"] as number).toFixed(1)}×`);
  if (typeof v["trigger_amount"] === "number") parts.push(inr(v["trigger_amount"] as number));
  if (typeof v["distinct_senders"] === "number") parts.push(`${v["distinct_senders"]} senders`);
  if (typeof v["relationship_status"] === "string") parts.push(String(v["relationship_status"]));
  if (typeof v["prior_alert_count"] === "number")
    parts.push(`${v["prior_alert_count"]} prior alerts`);
  if (parts.length) return parts.join(" · ");
  // Fallback: compact key=value list.
  return Object.entries(v)
    .slice(0, 3)
    .map(([k, val]) => `${k}: ${String(val)}`)
    .join(" · ");
}

function mapEvidence(evidence: WorkerEvidence[]): EvidenceItem[] {
  return evidence.map((e) => ({
    id: e.evidence_id,
    title: (e.type ?? "EVIDENCE").replace(/_/g, " ").toUpperCase(),
    summary: e.description,
    source: e.source,
    dataField: e.data_reference ?? e.type,
    observed: stringifyValue(e.value),
    baseline: "",
    whyItMatters: "",
  }));
}

function mapFindings(findings: WorkerFinding[]): Finding[] {
  return findings.map((f, i) => ({
    no: String(i + 1).padStart(2, "0"),
    title: `FINDING ${i + 1}`,
    statement: f.statement,
    evidenceIds: f.evidence_refs ?? [],
  }));
}

function mapRegulatory(entries: WorkerRegulatoryEntry[]): RegulatoryEntry[] {
  return entries.map((r) => ({
    source: r.source,
    reference: r.reference,
    context: r.excerpt,
    whyItMatters: r.relevance,
  }));
}

/** Worker node type -> UI NetworkNodeKind. */
function nodeKind(type: string): NetworkNodeKind {
  const s = (type ?? "").toUpperCase();
  if (s === "DESTINATION" || s === "BENEFICIARY") return "BENEFICIARY";
  if (s === "SENDER" || s === "SOURCE") return "CONNECTED_ACCOUNT";
  if (s === "MERCHANT") return "MERCHANT";
  if (s === "ACCOUNT") return "ACCOUNT";
  if (s === "CUSTOMER") return "CUSTOMER";
  if (s === "TRANSACTION") return "TRANSACTION";
  return "COUNTERPARTY";
}

function mapNetwork(
  nodes: WorkerNetworkNode[],
  edges: WorkerNetworkEdge[],
  findings: Finding[],
): NetworkGraph {
  const uiNodes: NetworkNode[] = nodes.map((n) => ({
    id: n.id,
    kind: nodeKind(n.type),
    label: n.id,
    detail: `${(n.type ?? "node").toUpperCase()} node.`,
    evidenceIds: [],
  }));
  const uiEdges: NetworkEdge[] = edges.map((e) => ({
    from: e.source,
    to: e.target,
    kind: "TRANSFER",
    label: `${inr(e.amount)}${e.transaction_id ? ` · ${e.transaction_id}` : ""}`,
  }));
  return { nodes: uiNodes, edges: uiEdges, findings };
}

const KNOWN_AGENTS = ["SUPERVISOR", "WATCHMAN", "DETECTIVE", "JURIST", "SCRIBE"] as const;
type KnownAgent = (typeof KNOWN_AGENTS)[number];

function agentOf(raw: string | undefined): string {
  const s = (raw ?? "").toUpperCase();
  const hit = KNOWN_AGENTS.find((a) => s.includes(a));
  return hit ?? (s || "SYSTEM");
}

/** Build the audit timeline from agent_trace (richer) falling back to timeline. */
function mapTimeline(
  trace: WorkerAgentTraceItem[],
  timeline: WorkerTimelineItem[],
): TimelineEvent[] {
  if (trace && trace.length) {
    return trace.map((t) => ({
      ts: clock(t.timestamp),
      agent: agentOf(t.agent),
      action: t.event,
      result: t.status ?? summarizeMeta(t.metadata),
      evidenceIds: evidenceRefsFromMeta(t.metadata),
    }));
  }
  return (timeline ?? []).map((t) => ({
    ts: clock(t.timestamp),
    agent: "SYSTEM",
    action: t.event,
    result: "",
    evidenceIds: [],
  }));
}

function evidenceRefsFromMeta(meta: Record<string, unknown> | undefined): string[] {
  if (!meta) return [];
  const refs = meta["evidence_refs"] ?? meta["evidence_id"];
  if (Array.isArray(refs)) return refs.map(String);
  if (typeof refs === "string") return [refs];
  return [];
}

function summarizeMeta(meta: Record<string, unknown> | undefined): string {
  if (!meta) return "";
  const reason = meta["reason"] ?? meta["tool"] ?? meta["detail"];
  return typeof reason === "string" ? reason : "";
}

/** Worker timestamps are Unix epoch seconds (float) or ISO strings. */
function clock(ts: number | string | undefined): string {
  if (ts === undefined || ts === null) return "";
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts) : d.toTimeString().slice(0, 8);
}

/** Which contributors ran, derived from the agent trace. */
function mapContributors(trace: WorkerAgentTraceItem[]): AgentContribution[] {
  const roles: Record<KnownAgent, string> = {
    SUPERVISOR: "Workflow orchestration",
    WATCHMAN: "Triage + validation",
    DETECTIVE: "Evidence acquisition",
    JURIST: "Regulatory context",
    SCRIBE: "Audit case generation",
  };
  const seen = new Set<string>();
  for (const t of trace ?? []) seen.add(agentOf(t.agent));
  return KNOWN_AGENTS.map((a) => ({
    agent: a,
    role: roles[a],
    status: seen.has(a) ? "COMPLETE" : "UNAVAILABLE",
  }));
}

/**
 * Convert a worker result (+ bank-side alert context) into the UI's
 * InvestigationResult. This is the boundary that keeps the answer key out of
 * the UI — nothing from the bank's expected_reason/scenario_id reaches here.
 */
export function mapWorkerResult(
  caseId: string,
  w: WorkerResult,
  alert: AlertContext,
): InvestigationResult {
  const recommendation = toRecommendation(w.recommendation?.action);
  const risk = alert.risk ?? toRiskLevel(w.risk?.level);
  const findings = mapFindings(w.findings ?? []);
  const evidence = mapEvidence(w.evidence ?? []);
  const timeline = mapTimeline(w.agent_trace ?? [], w.timeline ?? []);

  const pipeline: PipelineStep[] = [
    {
      no: "01",
      key: "dna",
      title: "CRIME DNA FINGERPRINT",
      state: w.risk ? "COMPLETE" : "NOT_RUN",
    },
    {
      no: "02",
      key: "evidence",
      title: "CONTEXTUAL EVIDENCE",
      state: evidence.length ? "COMPLETE" : "NOT_RUN",
    },
    {
      no: "03",
      key: "regulatory",
      title: "REGULATORY RISK",
      state: (w.regulatory_context ?? []).length ? "COMPLETE" : "NOT_RUN",
    },
    {
      no: "04",
      key: "explanation",
      title: "AUDIT-READY EXPLANATION",
      state: findings.length ? "COMPLETE" : "NOT_RUN",
    },
    {
      no: "05",
      key: "recommendation",
      title: "RECOMMENDATION",
      state: w.recommendation ? "COMPLETE" : "NOT_RUN",
    },
  ];

  return {
    caseId,
    status: resultStatusOf(w.status, recommendation),
    source: "live",
    alert: {
      alertId: alert.alertId,
      type: alert.type,
      customer: alert.customer,
      account: alert.account,
      transaction: alert.transaction,
      risk,
      investigationTime: "00:00",
      completedAt: timeline.length ? (timeline[timeline.length - 1]?.ts ?? "") : "",
    },
    tee: "NOT CONNECTED",
    // Worker score is 0–1; the UI shows 0–100.
    riskScore: typeof w.risk?.score === "number" ? Math.round(w.risk.score * 100) : null,
    riskComponents: mapComponents(w.risk?.components),
    pipeline,
    recommendation,
    // Reasoning comes from the worker — NOT the bank answer key.
    rationale: w.recommendation?.reason ?? "",
    rationaleEvidenceIds: (w.findings ?? []).flatMap((f) => f.evidence_refs ?? []).slice(0, 4),
    regulatoryRisk: toRiskLevel(w.risk?.level),
    findings,
    evidence,
    network: mapNetwork(w.network?.nodes ?? [], w.network?.edges ?? [], []),
    regulatory: mapRegulatory(w.regulatory_context ?? []),
    timeline,
    contributors: mapContributors(w.agent_trace ?? []),
    unavailable: [],
    decision: null,
    callingAgent: {
      state: "NOT_CONNECTED",
      contact: null,
      detail: "Escalation calling backend is not connected in this environment.",
    },
    observedPattern: w.observed_pattern ?? null,
    guardrail: buildGuardrail(w, recommendation),
  };
}

/** Extract the deterministic-vs-LLM cross-check for the guardrail panel. */
function buildGuardrail(w: WorkerResult, shipped: Recommendation): GuardrailInfo | null {
  const agentic = w.case_file?.agentic;
  if (!agentic) return null;
  const cross = agentic.deterministic_crosscheck;
  const llmProposed =
    agentic.llm_proposed_recommendation ?? cross?.llm_proposed_recommendation ?? null;
  if (!llmProposed && !cross) return null;
  return {
    llmProposed,
    llmJustification: agentic.llm_justification ?? null,
    deterministicImplied: cross?.deterministic_implied_recommendation ?? null,
    agree: cross?.agree ?? true,
    shipped,
  };
}
