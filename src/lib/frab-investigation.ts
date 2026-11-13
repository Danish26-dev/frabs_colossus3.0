/**
 * FRAB investigation data layer.
 *
 * The workspace consumes an event-driven investigation run:
 *   GET  /investigations/:id            -> InvestigationCase
 *   GET  /investigations/:id/status     -> RunStatus + agent states
 *   GET  /investigations/:id/events     -> InvestigationEvent[]
 *   GET  /investigations/:id/evidence   -> Evidence[]
 *   GET  /investigations/:id/result     -> Recommendation
 *
 * Until VITE_FRAB_API_URL is configured the workspace runs in an explicitly
 * labelled DEMO MODE driven by a scripted event stream. No live-only claim
 * (TEE, attestation, encrypted channel) is reported as verified in demo mode.
 */

import { API_BASE_URL, IS_LIVE_BACKEND } from "./frab-api";

export type AgentId = "SUPERVISOR" | "WATCHMAN" | "DETECTIVE" | "JURIST" | "SCRIBE";

export type AgentState =
  "IDLE" | "QUEUED" | "ACTIVE" | "QUERYING" | "ANALYZING" | "COMPLETE" | "ERROR";

export type RunStatus = "DORMANT" | "RUNNING" | "PAUSED" | "COMPLETE" | "ERROR";

export interface AgentMeta {
  id: AgentId;
  role: string;
  summary: string;
  tools: string[];
  handoff: AgentId | "INVESTIGATION RESULT";
  input: string;
}

export interface AgentRuntime {
  state: AgentState;
  task: string;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  toolRuns: { name: string; done: boolean }[];
  outputs: string[];
  error?: string | undefined;
}

export interface InvestigationEvent {
  ts: string;
  code: string;
  agent?: AgentId | undefined;
}

export interface Evidence {
  id: string;
  agent: AgentId;
  text: string;
  ts: string;
}

export interface InvestigationCase {
  id: string;
  alertType: string;
  customer: string;
  account: string;
  risk: "HIGH" | "MEDIUM" | "LOW";
}

export interface ConfidentialState {
  tee: string;
  attestation: string;
  channel: string;
  model: string;
  inference: string;
}

export const AGENT_ORDER: AgentId[] = ["SUPERVISOR", "WATCHMAN", "DETECTIVE", "JURIST", "SCRIBE"];

export const AGENT_META: Record<AgentId, AgentMeta> = {
  SUPERVISOR: {
    id: "SUPERVISOR",
    role: "INVESTIGATION ORCHESTRATION",
    summary: "Owns the investigation state machine, agent sequencing and retries.",
    tools: ["open_case()", "dispatch_agent()", "collect_state()"],
    handoff: "WATCHMAN",
    input: "ALERT · rule-engine trigger",
  },
  WATCHMAN: {
    id: "WATCHMAN",
    role: "TRIAGE / VALIDATION",
    summary: "Validates the alert, scores severity and extracts behavioural signals.",
    tools: ["get_alert()", "get_behaviour_baseline()", "score_severity()"],
    handoff: "DETECTIVE",
    input: "ALERT payload + account reference",
  },
  DETECTIVE: {
    id: "DETECTIVE",
    role: "EVIDENCE ACQUISITION",
    summary: "Queries banking records and traces the account/beneficiary network.",
    tools: [
      "get_transaction_history()",
      "get_behaviour_baseline()",
      "get_beneficiaries()",
      "get_previous_alerts()",
      "trace_account_network()",
    ],
    handoff: "JURIST",
    input: "WATCHMAN triage report",
  },
  JURIST: {
    id: "JURIST",
    role: "REGULATORY CONTEXT",
    summary: "Retrieves regulatory references and assesses regulatory risk exposure.",
    tools: ["retrieve_regulation()", "assess_regulatory_risk()"],
    handoff: "SCRIBE",
    input: "Evidence set E-001…E-00n",
  },
  SCRIBE: {
    id: "SCRIBE",
    role: "AUDIT CASE BUILDER",
    summary: "Compiles the audit-ready case file and the final recommendation.",
    tools: ["compile_case_file()", "build_audit_package()"],
    handoff: "INVESTIGATION RESULT",
    input: "Evidence + regulatory assessment",
  },
};

export const DEMO_CASE: InvestigationCase = {
  id: "FRAB-2026-001",
  alertType: "HIGH_VALUE_NEW_BENEFICIARY",
  customer: "CUST-0214",
  account: "ACC_0214",
  risk: "HIGH",
};

export const DEMO_CONFIDENTIAL: ConfidentialState = {
  tee: "NOT CONNECTED",
  attestation: "NOT CONNECTED",
  channel: "NOT CONNECTED",
  model: "GEMMA (NOT CONNECTED)",
  inference: "NOT CONNECTED",
};

export const READY_CONFIDENTIAL: ConfidentialState = {
  tee: "READY",
  attestation: "READY",
  channel: "READY",
  model: "GEMMA",
  inference: "READY",
};

export function emptyRuntime(): Record<AgentId, AgentRuntime> {
  const out = {} as Record<AgentId, AgentRuntime>;
  for (const id of AGENT_ORDER) {
    out[id] = {
      state: "IDLE",
      task: "AWAITING DISPATCH",
      toolRuns: AGENT_META[id].tools.map((name) => ({ name, done: false })),
      outputs: [],
    };
  }
  return out;
}

/* ------------------------------------------------------- demo event script */

export interface ScriptStep {
  at: number; // seconds from start
  code: string;
  agent?: AgentId | undefined;
  state?: AgentState;
  task?: string;
  tool?: string;
  output?: string;
  evidence?: { id: string; text: string };
}

export const DEMO_SCRIPT: ScriptStep[] = [
  { at: 0, code: "CASE_STARTED" },
  {
    at: 1,
    code: "SUPERVISOR_ACTIVE",
    agent: "SUPERVISOR",
    state: "ACTIVE",
    task: "ORCHESTRATING PIPELINE",
  },
  {
    at: 2,
    code: "WATCHMAN_ANALYZING",
    agent: "WATCHMAN",
    state: "ANALYZING",
    task: "TRIAGE / SIGNAL EXTRACTION",
    tool: "get_alert()",
  },
  { at: 4, code: "WATCHMAN_BASELINE_READ", agent: "WATCHMAN", tool: "get_behaviour_baseline()" },
  {
    at: 6,
    code: "WATCHMAN_SEVERITY_SCORED",
    agent: "WATCHMAN",
    tool: "score_severity()",
    output: "SEVERITY: HIGH",
  },
  {
    at: 7,
    code: "WATCHMAN_COMPLETE",
    agent: "WATCHMAN",
    state: "COMPLETE",
    task: "TRIAGE COMPLETE",
    output: "SIGNALS: amount deviation · new beneficiary · velocity spike",
  },
  {
    at: 8,
    code: "DETECTIVE_QUERYING_HISTORY",
    agent: "DETECTIVE",
    state: "QUERYING",
    task: "QUERYING CUSTOMER HISTORY",
    tool: "get_transaction_history()",
  },
  {
    at: 10,
    code: "DETECTIVE_QUERYING_BASELINE",
    agent: "DETECTIVE",
    task: "QUERYING BEHAVIOUR BASELINE",
    tool: "get_behaviour_baseline()",
    evidence: { id: "E-001", text: "Transaction is 6.2× customer baseline" },
  },
  {
    at: 12,
    code: "DETECTIVE_QUERYING_KYC",
    agent: "DETECTIVE",
    task: "QUERYING BENEFICIARY HISTORY",
    tool: "get_beneficiaries()",
    evidence: { id: "E-002", text: "Beneficiary has no previous relationship" },
  },
  {
    at: 14,
    code: "DETECTIVE_QUERYING_ALERTS",
    agent: "DETECTIVE",
    task: "QUERYING PREVIOUS ALERTS",
    tool: "get_previous_alerts()",
    evidence: { id: "E-003", text: "5 transactions within 18 minutes" },
  },
  {
    at: 16,
    code: "DETECTIVE_TRACING_NETWORK",
    agent: "DETECTIVE",
    state: "QUERYING",
    task: "TRACING ACCOUNT NETWORK",
    tool: "trace_account_network()",
    evidence: { id: "E-004", text: "Beneficiary connected to 4 accounts" },
  },
  {
    at: 19,
    code: "DETECTIVE_COMPLETE",
    agent: "DETECTIVE",
    state: "COMPLETE",
    task: "EVIDENCE ACQUIRED",
    output: "4 evidence items handed to JURIST",
  },
  {
    at: 20,
    code: "JURIST_RETRIEVING_REGULATION",
    agent: "JURIST",
    state: "QUERYING",
    task: "REGULATORY RETRIEVAL",
    tool: "retrieve_regulation()",
  },
  {
    at: 23,
    code: "JURIST_ASSESSING_RISK",
    agent: "JURIST",
    state: "ANALYZING",
    task: "REGULATORY RISK ASSESSMENT",
    tool: "assess_regulatory_risk()",
    output: "SOURCE: PMLA 2002 · RBI KYC/AML Master Direction · FATF R.10",
  },
  {
    at: 26,
    code: "JURIST_COMPLETE",
    agent: "JURIST",
    state: "COMPLETE",
    task: "REGULATORY CONTEXT ATTACHED",
    output: "Pattern consistent with layering indicators — reportable exposure",
  },
  {
    at: 27,
    code: "SCRIBE_COMPILING_REPORT",
    agent: "SCRIBE",
    state: "ACTIVE",
    task: "COMPILING CASE FILE",
    tool: "compile_case_file()",
  },
  {
    at: 30,
    code: "SCRIBE_BUILDING_PACKAGE",
    agent: "SCRIBE",
    task: "BUILDING AUDIT PACKAGE",
    tool: "build_audit_package()",
  },
  {
    at: 32,
    code: "SCRIBE_COMPLETE",
    agent: "SCRIBE",
    state: "COMPLETE",
    task: "AUDIT PACKAGE READY",
    output: "RECOMMENDATION: ESCALATE — FILE STR",
  },
  {
    at: 33,
    code: "SUPERVISOR_COMPLETE",
    agent: "SUPERVISOR",
    state: "COMPLETE",
    task: "INVESTIGATION CLOSED",
  },
  { at: 33, code: "INVESTIGATION_COMPLETE" },
];

export const CASE_FILE_ITEMS = [
  "Evidence",
  "Investigation timeline",
  "Agent trace",
  "Regulatory context",
  "Risk assessment",
  "Recommendation",
];

/* -------------------------------------------------------------- transport */

export const INVESTIGATION_MODE: "live" | "demo" = IS_LIVE_BACKEND ? "live" : "demo";

export async function fetchInvestigationCase(id: string): Promise<InvestigationCase> {
  if (!API_BASE_URL) return DEMO_CASE;
  const { backendGet, toRisk } = await import("./frab-backend");
  // Resolve a case id to its alert id, then load the evidence bundle.
  let alertId = id;
  if (!id.toUpperCase().startsWith("ALT")) {
    try {
      const cases = await backendGet<Array<{ case_id: string; alert_id: string }>>("/cases");
      const match = cases.find((c) => c.case_id === id);
      if (match) alertId = match.alert_id;
    } catch {
      /* fall back to treating id as an alert id */
    }
  }
  const bundle = await backendGet<{
    alert: { alert_id: string; alert_type: string; customer_id: string; severity: string };
    account: { account_id: string };
  }>(`/investigation/${alertId}`);
  return {
    id: bundle.alert.alert_id,
    alertType: bundle.alert.alert_type,
    customer: bundle.alert.customer_id,
    account: bundle.account.account_id,
    risk: toRisk(bundle.alert.severity),
  };
}

export async function fetchInvestigationEvents(_id: string): Promise<InvestigationEvent[]> {
  // The synthetic bank has no per-investigation event stream; the workspace
  // drives its own timeline from the scripted run. Return no live events.
  return [];
}

export function clockLabel(d = new Date()) {
  return d.toTimeString().slice(0, 8);
}

export function elapsedLabel(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
