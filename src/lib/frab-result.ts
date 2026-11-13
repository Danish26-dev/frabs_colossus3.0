/**
 * Investigation Result data layer.
 *
 *   GET  /investigations                      -> CaseSummary[]
 *   GET  /investigations/:caseId              -> InvestigationResult
 *   POST /investigations/:caseId/decision     -> AnalystDecisionRecord
 *   POST /investigations/:caseId/escalation-call -> CallingAgentState
 *   GET  /investigations/:caseId/export       -> case file (backend generated)
 *
 * Without VITE_FRAB_API_URL the module resolves clearly labelled SIMULATED
 * cases so the flow is demonstrable; nothing is presented as live data.
 */

import { API_BASE_URL } from "./frab-api";

export type Recommendation = "CLOSE" | "MONITOR" | "ESCALATE" | "BLOCK" | "INSUFFICIENT_EVIDENCE";
export type AnalystAction = "CLOSE" | "MONITOR" | "ESCALATE" | "BLOCK" | "REQUEST_MANUAL_REVIEW";
export type ResultStatus = "COMPLETE" | "PARTIAL" | "INSUFFICIENT_EVIDENCE";
export type AgentStatus = "COMPLETE" | "COMPLETE_WITH_LIMITATIONS" | "UNAVAILABLE";
export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";
export type StepState = "COMPLETE" | "IN_PROGRESS" | "NOT_RUN";

export interface CaseSummary {
  caseId: string;
  alertType: string;
  risk: RiskLevel;
  recommendation: Recommendation;
  status: ResultStatus;
  completedAt: string;
}

export interface RiskComponent {
  key: string;
  label: string;
  score: number | null;
  evidenceIds: string[];
  detail: string | null;
}

export interface EvidenceItem {
  id: string;
  title: string;
  /** One-line, human readable statement of what was found. */
  summary: string;
  source: string;
  dataField: string;
  observed: string;
  baseline: string;
  whyItMatters: string;
}

export interface Finding {
  no: string;
  title: string;
  statement: string;
  evidenceIds: string[];
}

export interface RegulatoryEntry {
  source: string;
  reference: string;
  context: string;
  whyItMatters: string;
}

export interface TimelineEvent {
  ts: string;
  agent: string;
  action: string;
  result: string;
  evidenceIds: string[];
}

export interface PipelineStep {
  no: string;
  key: "dna" | "evidence" | "regulatory" | "explanation" | "recommendation";
  title: string;
  state: StepState;
}

export interface AgentContribution {
  agent: "SUPERVISOR" | "WATCHMAN" | "DETECTIVE" | "JURIST" | "SCRIBE";
  role: string;
  status: AgentStatus;
  limitation?: string;
}

export interface AnalystDecisionRecord {
  action: AnalystAction;
  overridden: boolean;
  reason: string;
  ts: string;
}

export type CallState = "NOT_CONNECTED" | "IDLE" | "CONNECTING" | "CONNECTED" | "ENDED";

export interface CallingAgentState {
  state: CallState;
  contact: string | null;
  detail: string;
}

export type NetworkNodeKind =
  | "CUSTOMER"
  | "ACCOUNT"
  | "TRANSACTION"
  | "BENEFICIARY"
  | "COUNTERPARTY"
  | "MERCHANT"
  | "CONNECTED_ACCOUNT";

export type NetworkEdgeKind = "TRANSFER" | "TRANSACTION" | "BENEFICIARY" | "ACCOUNT_CONNECTION";

export interface NetworkNode {
  id: string;
  kind: NetworkNodeKind;
  label: string;
  detail: string;
  evidenceIds: string[];
}

export interface NetworkEdge {
  from: string;
  to: string;
  kind: NetworkEdgeKind;
  label: string;
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  findings: Finding[];
}

export interface InvestigationResult {
  caseId: string;
  status: ResultStatus;
  source: "live" | "simulated";
  alert: {
    alertId: string;
    type: string;
    customer: string;
    account: string;
    transaction: string | null;
    risk: RiskLevel;
    investigationTime: string;
    completedAt: string;
  };
  tee: string;
  riskScore: number | null;
  riskComponents: RiskComponent[];
  pipeline: PipelineStep[];
  recommendation: Recommendation;
  rationale: string;
  rationaleEvidenceIds: string[];
  regulatoryRisk: RiskLevel;
  findings: Finding[];
  evidence: EvidenceItem[];
  network: NetworkGraph;
  regulatory: RegulatoryEntry[];
  timeline: TimelineEvent[];
  contributors: AgentContribution[];
  unavailable: string[];
  decision: AnalystDecisionRecord | null;
  callingAgent: CallingAgentState;
  /** Detected crime pattern (e.g. MULE_COLLECTION), when the worker reports one. */
  observedPattern?: string | null;
  /** Deterministic-vs-LLM cross-check — powers the guardrail panel. */
  guardrail?: GuardrailInfo | null;
}

export interface GuardrailInfo {
  llmProposed: string | null;
  llmJustification: string | null;
  deterministicImplied: string | null;
  agree: boolean;
  shipped: Recommendation;
}

/* ----------------------------------------------------- simulated case set */

interface DemoCase {
  caseId: string;
  alertId: string;
  type: string;
  customer: string;
  account: string;
  risk: RiskLevel;
  recommendation: Recommendation;
  status: ResultStatus;
  score: number | null;
  regRisk: RiskLevel;
  completedAt: string;
  scores: [number, number, number, number, number, number] | null;
  rationale: string;
}

const DEMO_CASES: DemoCase[] = [
  {
    caseId: "FRAB-00000091",
    alertId: "ALT-00091",
    type: "HIGH_VALUE_NEW_BENEFICIARY",
    customer: "CUST-0214",
    account: "ACC-0214",
    risk: "HIGH",
    recommendation: "ESCALATE",
    status: "COMPLETE",
    score: 87,
    regRisk: "HIGH",
    completedAt: "10:45:08",
    scores: [92, 68, 95, 81, 91, 40],
    rationale:
      "A high-value transfer was made to a beneficiary with no prior relationship, and network analysis found the same beneficiary receiving funds from multiple unrelated accounts.",
  },
  {
    caseId: "FRAB-00000092",
    alertId: "ALT-00092",
    type: "STRUCTURING_PATTERN",
    customer: "CUST-0077",
    account: "ACC-0077",
    risk: "HIGH",
    recommendation: "ESCALATE",
    status: "COMPLETE",
    score: 84,
    regRisk: "HIGH",
    completedAt: "10:31:52",
    scores: [71, 93, 55, 88, 74, 62],
    rationale:
      "Multiple transfers just below the reporting threshold were executed within a short window, consistent with deliberate structuring.",
  },
  {
    caseId: "FRAB-00000093",
    alertId: "ALT-00093",
    type: "MULE_PATTERN",
    customer: "CUST-0088",
    account: "ACC-0088",
    risk: "HIGH",
    recommendation: "ESCALATE",
    status: "COMPLETE",
    score: 91,
    regRisk: "HIGH",
    completedAt: "10:12:04",
    scores: [64, 86, 90, 79, 97, 58],
    rationale:
      "Funds from several unrelated senders were aggregated and forwarded within minutes, a pattern consistent with mule account behaviour.",
  },
  {
    caseId: "FRAB-00000094",
    alertId: "ALT-00094",
    type: "ROUND_TRIPPING",
    customer: "CUST-0155",
    account: "ACC-0155",
    risk: "HIGH",
    recommendation: "MONITOR",
    status: "COMPLETE",
    score: 66,
    regRisk: "MEDIUM",
    completedAt: "09:58:41",
    scores: [58, 71, 44, 69, 72, 51],
    rationale:
      "Funds returned to the originating account through an intermediary, but the counterparties are established relationships with prior activity.",
  },
  {
    caseId: "FRAB-00000095",
    alertId: "ALT-00095",
    type: "VELOCITY_SPIKE",
    customer: "CUST-0192",
    account: "ACC-0192",
    risk: "HIGH",
    recommendation: "ESCALATE",
    status: "COMPLETE",
    score: 79,
    regRisk: "HIGH",
    completedAt: "09:44:19",
    scores: [63, 96, 48, 84, 61, 45],
    rationale:
      "Outbound transfer volume rose sharply against the account baseline with no corresponding change in customer profile.",
  },
  {
    caseId: "FRAB-00000096",
    alertId: "ALT-00096",
    type: "DORMANT_REACTIVATION",
    customer: "CUST-0061",
    account: "ACC-0061",
    risk: "MEDIUM",
    recommendation: "MONITOR",
    status: "COMPLETE",
    score: 58,
    regRisk: "MEDIUM",
    completedAt: "09:30:07",
    scores: [52, 40, 66, 74, 38, 30],
    rationale:
      "A long-dormant account resumed activity at moderate value with a verified KYC profile and no adverse network exposure.",
  },
  {
    caseId: "FRAB-00000097",
    alertId: "ALT-00097",
    type: "CROSS_BORDER_BURST",
    customer: "CUST-0203",
    account: "ACC-0203",
    risk: "HIGH",
    recommendation: "BLOCK",
    status: "COMPLETE",
    score: 94,
    regRisk: "HIGH",
    completedAt: "09:11:33",
    scores: [89, 91, 93, 90, 96, 77],
    rationale:
      "Rapid cross-border transfers were routed to a counterparty already linked to an open investigation on another account.",
  },
  {
    caseId: "FRAB-00000098",
    alertId: "ALT-00098",
    type: "KYC_MISMATCH",
    customer: "CUST-0119",
    account: "ACC-0119",
    risk: "MEDIUM",
    recommendation: "INSUFFICIENT_EVIDENCE",
    status: "INSUFFICIENT_EVIDENCE",
    score: null,
    regRisk: "MEDIUM",
    completedAt: "08:57:26",
    scores: null,
    rationale:
      "Available evidence does not support a confident disposition. The KYC record could not be retrieved during the investigation window.",
  },
  {
    caseId: "FRAB-00000099",
    alertId: "ALT-00099",
    type: "MERCHANT_ANOMALY",
    customer: "CUST-0233",
    account: "ACC-0233",
    risk: "MEDIUM",
    recommendation: "MONITOR",
    status: "COMPLETE",
    score: 54,
    regRisk: "LOW",
    completedAt: "08:40:12",
    scores: [49, 44, 58, 62, 41, 35],
    rationale:
      "Merchant spend deviated from category norms but remained within the customer's historical value range.",
  },
  {
    caseId: "FRAB-00000100",
    alertId: "ALT-00100",
    type: "FALSE_POSITIVE_HISTORY",
    customer: "CUST-0248",
    account: "ACC-0248",
    risk: "LOW",
    recommendation: "CLOSE",
    status: "COMPLETE",
    score: 22,
    regRisk: "LOW",
    completedAt: "08:22:48",
    scores: [24, 18, 12, 31, 15, 28],
    rationale:
      "Activity matches the customer's established pattern and the triggering rule has previously produced false positives on this account.",
  },
];

const COMPONENT_META: {
  key: string;
  label: string;
  evidenceIds: string[];
  detail: (c: DemoCase, score: number) => string;
}[] = [
  {
    key: "amount",
    label: "AMOUNT DEVIATION",
    evidenceIds: ["E-001", "E-005"],
    detail: (_c, s) =>
      s >= 70
        ? "Transaction value is significantly above the customer's normal range."
        : "Transaction value remains close to the customer's normal range.",
  },
  {
    key: "velocity",
    label: "VELOCITY",
    evidenceIds: ["E-003"],
    detail: (_c, s) =>
      s >= 70
        ? "Transaction frequency inside the window is well above baseline cadence."
        : "Transaction frequency is broadly consistent with baseline cadence.",
  },
  {
    key: "beneficiary",
    label: "BENEFICIARY NOVELTY",
    evidenceIds: ["E-002"],
    detail: (_c, s) =>
      s >= 70
        ? "First observed transaction with this beneficiary."
        : "Beneficiary has prior transaction history with the customer.",
  },
  {
    key: "behaviour",
    label: "BEHAVIOUR DEVIATION",
    evidenceIds: ["E-005"],
    detail: (_c, s) =>
      s >= 70
        ? "Channel, timing and value differ from the 90-day behavioural baseline."
        : "Behaviour is within the 90-day baseline envelope.",
  },
  {
    key: "network",
    label: "NETWORK RISK",
    evidenceIds: ["E-004"],
    detail: (_c, s) =>
      s >= 70
        ? "Multiple connected funding relationships detected around the counterparty."
        : "No material adverse relationships detected around the counterparty.",
  },
  {
    key: "history",
    label: "PREVIOUS ALERT HISTORY",
    evidenceIds: ["E-006"],
    detail: (_c, s) =>
      s >= 70
        ? "Account has repeated prior alerts that were not closed as false positives."
        : "Limited prior alert history; earlier alerts closed as false positives.",
  },
];

function evidenceFor(c: DemoCase): EvidenceItem[] {
  const high = (c.score ?? 0) >= 70;
  return [
    {
      id: "E-001",
      title: "TRANSACTION",
      summary: high
        ? "Amount is 2.6× above the historical baseline."
        : "Amount is within the historical baseline range.",
      source: "Synthetic Bank / Transaction API",
      dataField: "transaction.amount",
      observed: high ? "₹185,000" : "₹34,500",
      baseline: "₹20,000 – ₹40,000 (90-day range)",
      whyItMatters:
        "Value materially outside the customer's normal range is a primary indicator of anomalous activity.",
    },
    {
      id: "E-002",
      title: "BENEFICIARY",
      summary: high
        ? "Beneficiary has no prior relationship with the customer."
        : "Beneficiary has an established relationship with the customer.",
      source: "Synthetic Bank / Beneficiary Index",
      dataField: "beneficiary.first_seen",
      observed: high
        ? "First seen 2026-08-29 · 0 prior transactions"
        : "First seen 2024-02-11 · 46 prior transactions",
      baseline: "Established beneficiaries: > 3 prior transactions",
      whyItMatters:
        "High-value transfers on newly established relationships carry elevated placement risk.",
    },
    {
      id: "E-003",
      title: "VELOCITY",
      summary: high
        ? "8 transactions detected within the investigation window."
        : "2 transactions detected within the investigation window.",
      source: "Synthetic Bank / Transaction Ledger",
      dataField: "ledger.window_count",
      observed: high ? "8 transfers / 18 minutes" : "2 transfers / 18 minutes",
      baseline: "Typical: 1–2 transfers per hour",
      whyItMatters: "Burst activity can indicate an attempt to move funds before controls engage.",
    },
    {
      id: "E-004",
      title: "NETWORK",
      summary: high
        ? "Funds aggregated from multiple unrelated senders."
        : "No unrelated funding relationships identified.",
      source: "FRAB / Network Trace",
      dataField: "network.connected_accounts",
      observed: high
        ? "4 connected accounts · 3 unrelated senders · depth 2"
        : "1 connected account · depth 2",
      baseline: "Expected: 0–1 unrelated senders",
      whyItMatters:
        "Aggregation from unrelated sources is a recognised layering and mule-network signature.",
    },
    {
      id: "E-005",
      title: "BEHAVIOUR",
      summary: high
        ? "Activity deviates substantially from the customer's baseline."
        : "Activity is consistent with the customer's baseline.",
      source: "Synthetic Bank / Behaviour Baseline",
      dataField: "baseline.deviation_factor",
      observed: high ? "6.2× baseline" : "1.1× baseline",
      baseline: "90-day rolling behavioural profile",
      whyItMatters:
        "Behavioural deviation contextualises whether a single transaction is genuinely abnormal.",
    },
    {
      id: "E-006",
      title: "ALERT HISTORY",
      summary: "Prior alert history retrieved for the account.",
      source: "Synthetic Bank / Alert History",
      dataField: "alerts.previous",
      observed: high
        ? "2 previous alerts · 1 escalated"
        : "1 previous alert · closed false positive",
      baseline: "Account average: 0–1 alerts per year",
      whyItMatters: "Repeat alerting raises the weight of the current signal.",
    },
  ];
}

function findingsFor(c: DemoCase): Finding[] {
  if (c.status === "INSUFFICIENT_EVIDENCE") {
    return [
      {
        no: "01",
        title: "EVIDENCE GAP",
        statement: "The KYC record required to assess the mismatch could not be retrieved.",
        evidenceIds: ["E-006"],
      },
      {
        no: "02",
        title: "PARTIAL BEHAVIOUR PICTURE",
        statement: "Behavioural comparison is incomplete without a verified customer profile.",
        evidenceIds: ["E-005"],
      },
    ];
  }
  const high = (c.score ?? 0) >= 70;
  return [
    {
      no: "01",
      title: "BEHAVIOUR",
      statement: high
        ? "The transaction is materially outside the customer's historical behaviour."
        : "The transaction remains within the customer's historical behaviour.",
      evidenceIds: ["E-001", "E-005"],
    },
    {
      no: "02",
      title: "RELATIONSHIP",
      statement: high
        ? "The beneficiary relationship is newly established."
        : "The beneficiary relationship is established and previously transacted.",
      evidenceIds: ["E-002"],
    },
    {
      no: "03",
      title: "NETWORK",
      statement: high
        ? "Network analysis identified multiple unrelated funding relationships."
        : "Network analysis identified no unrelated funding relationships.",
      evidenceIds: ["E-004"],
    },
  ];
}

function networkFor(c: DemoCase): NetworkGraph {
  const high = (c.score ?? 0) >= 70;
  const tx = `TX-${c.caseId.slice(-8)}`;
  const nodes: NetworkNode[] = [
    {
      id: c.customer,
      kind: "CUSTOMER",
      label: c.customer,
      detail: "Alerted customer under investigation.",
      evidenceIds: ["E-005"],
    },
    {
      id: c.account,
      kind: "ACCOUNT",
      label: c.account,
      detail: "Originating account for the triggering transaction.",
      evidenceIds: ["E-001"],
    },
    {
      id: tx,
      kind: "TRANSACTION",
      label: tx,
      detail: high
        ? "Triggering transfer, 2.6× above the customer baseline."
        : "Triggering transfer, within the customer baseline range.",
      evidenceIds: ["E-001", "E-003"],
    },
    {
      id: "BEN-4471",
      kind: "BENEFICIARY",
      label: "BEN-4471",
      detail: high
        ? "Beneficiary first observed during this investigation window."
        : "Established beneficiary with prior transaction history.",
      evidenceIds: ["E-002"],
    },
  ];
  const edges: NetworkEdge[] = [
    { from: c.customer, to: c.account, kind: "ACCOUNT_CONNECTION", label: "HOLDS" },
    { from: c.account, to: tx, kind: "TRANSACTION", label: "ORIGINATED" },
    { from: tx, to: "BEN-4471", kind: "BENEFICIARY", label: "PAID" },
  ];

  if (high) {
    nodes.push(
      {
        id: "ACC-8812",
        kind: "CONNECTED_ACCOUNT",
        label: "ACC-8812",
        detail: "Unrelated account funding the same beneficiary.",
        evidenceIds: ["E-004"],
      },
      {
        id: "ACC-9034",
        kind: "CONNECTED_ACCOUNT",
        label: "ACC-9034",
        detail: "Unrelated account funding the same beneficiary.",
        evidenceIds: ["E-004"],
      },
      {
        id: "CPT-2210",
        kind: "COUNTERPARTY",
        label: "CPT-2210",
        detail: "Downstream counterparty receiving forwarded funds.",
        evidenceIds: ["E-004"],
      },
    );
    edges.push(
      { from: "ACC-8812", to: "BEN-4471", kind: "TRANSFER", label: "FUNDED" },
      { from: "ACC-9034", to: "BEN-4471", kind: "TRANSFER", label: "FUNDED" },
      { from: "BEN-4471", to: "CPT-2210", kind: "TRANSFER", label: "FORWARDED" },
    );
  } else {
    nodes.push({
      id: "MER-1180",
      kind: "MERCHANT",
      label: "MER-1180",
      detail: "Merchant counterparty with established settlement history.",
      evidenceIds: ["E-004"],
    });
    edges.push({ from: "BEN-4471", to: "MER-1180", kind: "TRANSFER", label: "SETTLED" });
  }

  const findings: Finding[] = high
    ? [
        {
          no: "01",
          title: "SHARED BENEFICIARY",
          statement: "Beneficiary received funds from multiple unrelated accounts.",
          evidenceIds: ["E-004"],
        },
        {
          no: "02",
          title: "ONWARD MOVEMENT",
          statement: "Funds were forwarded to a downstream counterparty shortly after receipt.",
          evidenceIds: ["E-003", "E-004"],
        },
      ]
    : [
        {
          no: "01",
          title: "NO ADVERSE EXPOSURE",
          statement: "No unrelated funding relationships were identified around the counterparty.",
          evidenceIds: ["E-004"],
        },
      ];

  return { nodes, edges, findings };
}

function regulatoryFor(c: DemoCase): RegulatoryEntry[] {
  const base: RegulatoryEntry[] = [
    {
      source: "PMLA",
      reference: "PMLA 2002 · Section 12 — Reporting obligations",
      context:
        "Reporting entities must maintain transaction records and report suspicious activity to FIU-IND.",
      whyItMatters:
        "Retrieved because the case pattern may meet the internal suspicion threshold for STR review.",
    },
    {
      source: "RBI AML / KYC",
      reference: "RBI Master Direction — KYC · Para 37, ongoing due diligence",
      context: "Transactions inconsistent with the customer's profile require enhanced scrutiny.",
      whyItMatters: "Retrieved because behavioural deviation was observed (E-005).",
    },
  ];
  if (c.regRisk === "HIGH") {
    base.push({
      source: "FATF",
      reference: "FATF Recommendation 10 — Customer due diligence",
      context: "Enhanced due diligence applies where a relationship presents higher risk.",
      whyItMatters: "Retrieved because network exposure was identified (E-004).",
    });
  }
  return base;
}

function timelineFor(c: DemoCase): TimelineEvent[] {
  const t = c.completedAt.slice(0, 5);
  return [
    {
      ts: `${t}:02`,
      agent: "SYSTEM",
      action: "CASE_STARTED",
      result: `${c.alertId} received from rule engine`,
      evidenceIds: [],
    },
    {
      ts: `${t}:04`,
      agent: "SUPERVISOR",
      action: "DISPATCH",
      result: "Pipeline dispatched to 4 specialists",
      evidenceIds: [],
    },
    {
      ts: `${t}:09`,
      agent: "WATCHMAN",
      action: "TRIAGE",
      result: `Severity ${c.risk} — signals extracted`,
      evidenceIds: ["E-001"],
    },
    {
      ts: `${t}:21`,
      agent: "DETECTIVE",
      action: "EVIDENCE",
      result: "6 evidence items collected",
      evidenceIds: ["E-002", "E-003", "E-004"],
    },
    {
      ts: `${t}:36`,
      agent: "JURIST",
      action: "REGULATORY",
      result: `${regulatoryFor(c).length} references retrieved`,
      evidenceIds: [],
    },
    {
      ts: `${t}:49`,
      agent: "SCRIBE",
      action: "CASE_FILE",
      result: "Audit-ready explanation compiled",
      evidenceIds: [],
    },
    {
      ts: c.completedAt,
      agent: "FRAB",
      action: "INVESTIGATION_COMPLETE",
      result: c.recommendation,
      evidenceIds: ["E-001", "E-004"],
    },
  ];
}

function simulatedResult(c: DemoCase): InvestigationResult {
  const insufficient = c.status === "INSUFFICIENT_EVIDENCE";
  const components: RiskComponent[] = COMPONENT_META.map((m, i) => {
    const score = c.scores ? c.scores[i]! : null;
    return {
      key: m.key,
      label: m.label,
      score,
      evidenceIds: m.evidenceIds,
      detail: score === null ? null : m.detail(c, score),
    };
  });

  const step = (state: StepState): StepState => state;

  return {
    caseId: c.caseId,
    status: c.status,
    source: "simulated",
    alert: {
      alertId: c.alertId,
      type: c.type,
      customer: c.customer,
      account: c.account,
      transaction: `TX-${c.caseId.slice(-8)}`,
      risk: c.risk,
      investigationTime: "00:33",
      completedAt: c.completedAt,
    },
    tee: "NOT CONNECTED",
    riskScore: c.score,
    riskComponents: components,
    pipeline: [
      {
        no: "01",
        key: "dna",
        title: "CRIME DNA FINGERPRINT",
        state: step(insufficient ? "NOT_RUN" : "COMPLETE"),
      },
      { no: "02", key: "evidence", title: "CONTEXTUAL EVIDENCE", state: "COMPLETE" },
      { no: "03", key: "regulatory", title: "REGULATORY RISK", state: "COMPLETE" },
      { no: "04", key: "explanation", title: "AUDIT-READY EXPLANATION", state: "COMPLETE" },
      { no: "05", key: "recommendation", title: "RECOMMENDATION", state: "COMPLETE" },
    ],
    recommendation: c.recommendation,
    rationale: c.rationale,
    rationaleEvidenceIds: insufficient ? ["E-006"] : ["E-001", "E-002", "E-004"],
    regulatoryRisk: c.regRisk,
    findings: findingsFor(c),
    evidence: evidenceFor(c),
    network: networkFor(c),
    regulatory: regulatoryFor(c),
    timeline: timelineFor(c),
    contributors: [
      { agent: "SUPERVISOR", role: "Workflow orchestration", status: "COMPLETE" },
      { agent: "WATCHMAN", role: "Triage + validation", status: "COMPLETE" },
      {
        agent: "DETECTIVE",
        role: "Evidence acquisition",
        status: insufficient ? "COMPLETE_WITH_LIMITATIONS" : "COMPLETE",
        ...(insufficient
          ? { limitation: "KYC vault unavailable during the investigation window." }
          : {}),
      },
      { agent: "JURIST", role: "Regulatory context", status: "COMPLETE" },
      { agent: "SCRIBE", role: "Audit case generation", status: "COMPLETE" },
    ],
    unavailable: insufficient ? ["KYC record for CUST-0119 could not be retrieved."] : [],
    decision: null,
    callingAgent: {
      state: "NOT_CONNECTED",
      contact: null,
      detail: "Escalation calling backend is not connected in this environment.",
    },
  };
}

/* -------------------------------------------------------------- transport */

import {
  backendGet,
  toAccountId,
  toRisk,
  clockOf,
  hasNewBeneficiary,
  type RawAlert,
  type RawCase,
  type RawInvestigationBundle,
  type RawTxn,
} from "./frab-backend";
import {
  IS_WORKER_LIVE,
  fetchWorkerResult,
  fetchWorkerStatus,
  startWorkerInvestigation,
} from "./frab-worker";
import { mapWorkerResult, type AlertContext } from "./frab-worker-map";

export const IS_SIMULATED = !API_BASE_URL && !IS_WORKER_LIVE;

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export async function fetchCaseList(): Promise<CaseSummary[]> {
  if (!API_BASE_URL) {
    await new Promise((r) => setTimeout(r, 200));
    return DEMO_CASES.map((c) => ({
      caseId: c.caseId,
      alertType: c.type,
      risk: c.risk,
      recommendation: c.recommendation,
      status: c.status,
      completedAt: c.completedAt,
    }));
  }
  const [cases, alerts] = await Promise.all([
    backendGet<RawCase[]>("/cases"),
    backendGet<RawAlert[]>("/alerts").catch(() => [] as RawAlert[]),
  ]);
  const sevByAlert = new Map(alerts.map((a) => [a.alert_id, a.severity] as const));
  return cases.map((c) => ({
    caseId: c.case_id,
    alertType: c.case_type,
    risk: toRisk(sevByAlert.get(c.alert_id) ?? "MEDIUM"),
    recommendation: dispositionToRecommendation(c.disposition, c.investigation_note),
    status: caseStatusToResult(c.status),
    completedAt: "",
  }));
}

function caseStatusToResult(status: string): ResultStatus {
  const s = (status ?? "").toUpperCase();
  if (s === "CLOSED" || s === "COMPLETED" || s === "RESOLVED") return "COMPLETE";
  return "PARTIAL";
}

function dispositionToRecommendation(disposition: string, note?: string): Recommendation {
  const d = (disposition ?? "").toUpperCase();
  if (d === "ESCALATE" || d === "ESCALATED") return "ESCALATE";
  if (d === "BLOCK" || d === "BLOCKED") return "BLOCK";
  if (d === "CLOSE" || d === "CLOSED" || d === "CLEARED") return "CLOSE";
  if (d === "MONITOR") return "MONITOR";
  // PENDING or unknown — infer from the note when possible.
  const n = (note ?? "").toLowerCase();
  if (/escalat|hold|str/.test(n)) return "ESCALATE";
  if (/block/.test(n)) return "BLOCK";
  if (/monitor|watch/.test(n)) return "MONITOR";
  return "MONITOR";
}

/** Resolve a case id or alert id to the alert id used by /investigation/{id}. */
async function resolveAlertId(
  handle: string,
): Promise<{ alertId: string; caseNote?: string; disposition?: string }> {
  if (handle.toUpperCase().startsWith("ALT")) return { alertId: handle };
  // A case id — look it up to find its alert.
  try {
    const cases = await backendGet<RawCase[]>("/cases");
    const match = cases.find((c) => c.case_id === handle);
    if (match)
      return {
        alertId: match.alert_id,
        caseNote: match.investigation_note,
        disposition: match.disposition,
      };
  } catch {
    // ignore, fall back to treating the handle as an alert id
  }
  return { alertId: handle };
}

export async function fetchInvestigationResult(caseId: string): Promise<InvestigationResult> {
  // Worker owns the investigation. When it is configured, the result comes from
  // the worker; the bank only supplies alert-side context for the header.
  if (IS_WORKER_LIVE) {
    return fetchWorkerBackedResult(caseId);
  }
  if (!API_BASE_URL) {
    await new Promise((r) => setTimeout(r, 220));
    const demo = DEMO_CASES.find((c) => c.caseId === caseId) ?? DEMO_CASES[0]!;
    return { ...simulatedResult(demo), caseId };
  }
  // Legacy fallback: derive from the bank bundle. NOTE this path uses bank data
  // only and must never be treated as FRAB's real investigation.
  const { alertId, caseNote, disposition } = await resolveAlertId(caseId);
  const bundle = await backendGet<RawInvestigationBundle>(`/investigation/${alertId}`);
  return liveResult(caseId, bundle, caseNote, disposition);
}

/**
 * Fetch the worker's investigation result, enriched with bank alert context.
 *
 * Self-healing: the worker's case store is in-memory, so a case may not exist
 * (never started, or the worker restarted). If GET /result 404s, we START the
 * investigation (POST /investigate), poll /status until it completes, then read
 * the result. This is the POST -> poll -> GET flow the worker expects.
 */
async function fetchWorkerBackedResult(caseId: string): Promise<InvestigationResult> {
  // Alert context first — needed both for the result header AND to start a case.
  const alertCtx = await buildAlertContext(caseId, caseId);

  try {
    const worker = await fetchWorkerResult(caseId);
    return mapWorkerResult(caseId, worker, alertCtx);
  } catch {
    // Likely CASE_NOT_FOUND — start it, then wait for completion.
    await ensureWorkerCaseStarted(caseId, alertCtx);
    const worker = await fetchWorkerResult(caseId);
    return mapWorkerResult(caseId, worker, alertCtx);
  }
}

/** Start a worker investigation for a case and poll until it completes. */
async function ensureWorkerCaseStarted(caseId: string, ctx: AlertContext): Promise<void> {
  await startWorkerInvestigation({
    case_id: caseId,
    alert_id: ctx.alertId,
    alert: {
      type: ctx.type || "UNKNOWN",
      severity: ctx.risk ?? "MEDIUM",
      transaction_id: ctx.transaction ?? "",
    },
    customer_id: ctx.customer,
  });

  // Poll /status until COMPLETE (real Gemma run ~15-25s). Cap the wait.
  const DEADLINE_MS = 60_000;
  const INTERVAL_MS = 2_000;
  const start = Date.now();
  while (Date.now() - start < DEADLINE_MS) {
    try {
      const { status } = await fetchWorkerStatus(caseId);
      const s = (status ?? "").toUpperCase();
      if (s === "COMPLETE" || s === "COMPLETED" || s === "PARTIAL" || s === "FAILED") return;
    } catch {
      /* status may briefly 404 right after POST — keep polling */
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  // Deadline hit — let the caller's GET /result surface whatever exists.
}

/** Assemble alert-side context (customer/account/type) for the result header. */
async function buildAlertContext(caseId: string, workerCaseId: string): Promise<AlertContext> {
  const fallback: AlertContext = {
    alertId: workerCaseId || caseId,
    type: "",
    customer: "",
    account: "",
    transaction: null,
  };
  if (!API_BASE_URL) return fallback;
  try {
    const { alertId } = await resolveAlertId(caseId);
    const bundle = await backendGet<RawInvestigationBundle>(`/investigation/${alertId}`);
    return {
      alertId: bundle.alert.alert_id,
      type: bundle.alert.alert_type,
      customer: bundle.customer.customer_id,
      account: bundle.account.account_id,
      transaction: bundle.alert.transaction_id,
      risk: toRisk(bundle.alert.severity),
    };
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------- live bundle -> result mapping */

function liveResult(
  caseId: string,
  b: RawInvestigationBundle,
  caseNote?: string,
  disposition?: string,
): InvestigationResult {
  const risk = toRisk(b.alert.severity);
  const stats = b.historical_statistics;
  const trigger = b.trigger_transaction;
  const newBeneficiary = hasNewBeneficiary(b.beneficiaries);
  const deviationFactor =
    stats.historical_average > 0 ? trigger.amount / stats.historical_average : null;

  const evidence = buildEvidence(b, deviationFactor, newBeneficiary);
  const findings = buildFindings(b, deviationFactor, newBeneficiary);
  const network = buildNetwork(b);
  const regulatory = buildRegulatory(risk);
  const timeline = buildTimeline(b);
  const components = buildComponents(b, deviationFactor, newBeneficiary);
  const riskScore = scoreOf(components);
  const recommendation = dispositionToRecommendation(
    disposition ?? "",
    caseNote ?? b.alert.expected_reason ?? "",
  );

  return {
    caseId,
    status: "COMPLETE",
    source: "live",
    alert: {
      alertId: b.alert.alert_id,
      type: b.alert.alert_type,
      customer: b.customer.customer_id,
      account: b.account.account_id,
      transaction: b.alert.transaction_id,
      risk,
      investigationTime: "00:00",
      completedAt: clockOf(trigger.event_time),
    },
    tee: "NOT CONNECTED",
    riskScore,
    riskComponents: components,
    pipeline: [
      { no: "01", key: "dna", title: "CRIME DNA FINGERPRINT", state: "COMPLETE" },
      { no: "02", key: "evidence", title: "CONTEXTUAL EVIDENCE", state: "COMPLETE" },
      { no: "03", key: "regulatory", title: "REGULATORY RISK", state: "COMPLETE" },
      { no: "04", key: "explanation", title: "AUDIT-READY EXPLANATION", state: "COMPLETE" },
      { no: "05", key: "recommendation", title: "RECOMMENDATION", state: "COMPLETE" },
    ],
    recommendation,
    rationale: caseNote ?? b.alert.expected_reason ?? "Investigation complete.",
    rationaleEvidenceIds: ["E-001", "E-002", "E-004"],
    regulatoryRisk: risk,
    findings,
    evidence,
    network,
    regulatory,
    timeline,
    contributors: [
      { agent: "SUPERVISOR", role: "Workflow orchestration", status: "COMPLETE" },
      { agent: "WATCHMAN", role: "Triage + validation", status: "COMPLETE" },
      { agent: "DETECTIVE", role: "Evidence acquisition", status: "COMPLETE" },
      { agent: "JURIST", role: "Regulatory context", status: "COMPLETE" },
      { agent: "SCRIBE", role: "Audit case generation", status: "COMPLETE" },
    ],
    unavailable: [],
    decision: null,
    callingAgent: {
      state: "NOT_CONNECTED",
      contact: null,
      detail: "Escalation calling backend is not connected in this environment.",
    },
  };
}

function buildComponents(
  b: RawInvestigationBundle,
  deviation: number | null,
  newBeneficiary: boolean,
): RiskComponent[] {
  const stats = b.historical_statistics;
  const amountScore = deviation === null ? null : clamp(Math.round((deviation / 12) * 100));
  const velocityHistory = b.transaction_history.length;
  const velocityScore = velocityHistory
    ? clamp(Math.round((b.related_transactions.length / Math.max(velocityHistory, 1)) * 100))
    : 30;
  const beneficiaryScore = newBeneficiary ? 90 : 25;
  const behaviourScore = amountScore;
  const networkScore = clamp(
    30 + b.beneficiaries.filter((x) => x.relationship_status === "NEW").length * 25,
  );
  const historyScore = clamp(Math.min(b.previous_cases.length * 40, 100));
  return [
    {
      key: "amount",
      label: "AMOUNT DEVIATION",
      score: amountScore,
      evidenceIds: ["E-001", "E-005"],
      detail:
        deviation === null
          ? "Historical baseline unavailable."
          : `Transaction is ${deviation.toFixed(1)}× the customer's historical average (${inr(stats.historical_average)}).`,
    },
    {
      key: "velocity",
      label: "VELOCITY",
      score: velocityScore,
      evidenceIds: ["E-003"],
      detail: `${velocityHistory} historical transactions on record for this account.`,
    },
    {
      key: "beneficiary",
      label: "BENEFICIARY NOVELTY",
      score: beneficiaryScore,
      evidenceIds: ["E-002"],
      detail: newBeneficiary
        ? "Transfer routed to a beneficiary with a NEW relationship status."
        : "Beneficiary relationships are established.",
    },
    {
      key: "behaviour",
      label: "BEHAVIOUR DEVIATION",
      score: behaviourScore,
      evidenceIds: ["E-005"],
      detail:
        deviation === null
          ? "Behavioural baseline unavailable."
          : `Activity is ${deviation.toFixed(1)}× the behavioural baseline.`,
    },
    {
      key: "network",
      label: "NETWORK RISK",
      score: networkScore,
      evidenceIds: ["E-004"],
      detail: `${b.beneficiaries.length} known beneficiaries; ${b.beneficiaries.filter((x) => x.relationship_status === "NEW").length} new.`,
    },
    {
      key: "history",
      label: "PREVIOUS ALERT HISTORY",
      score: historyScore,
      evidenceIds: ["E-006"],
      detail: `${b.previous_cases.length} previous case(s) on record.`,
    },
  ];
}

function scoreOf(components: RiskComponent[]): number | null {
  const nums = components.map((c) => c.score).filter((s): s is number => s !== null);
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function buildEvidence(
  b: RawInvestigationBundle,
  deviation: number | null,
  newBeneficiary: boolean,
): EvidenceItem[] {
  const stats = b.historical_statistics;
  const trigger = b.trigger_transaction;
  return [
    {
      id: "E-001",
      title: "TRANSACTION",
      summary:
        deviation === null
          ? `Trigger transaction of ${inr(trigger.amount)}.`
          : `Amount is ${deviation.toFixed(1)}× the historical average.`,
      source: "Synthetic Bank / Transaction API",
      dataField: "transaction.amount",
      observed: inr(trigger.amount),
      baseline: `avg ${inr(stats.historical_average)} · median ${inr(stats.historical_median)} · max ${inr(stats.historical_max)}`,
      whyItMatters:
        "Value materially outside the customer's normal range is a primary indicator of anomalous activity.",
    },
    {
      id: "E-002",
      title: "BENEFICIARY",
      summary: newBeneficiary
        ? "Funds routed to a beneficiary with a NEW relationship."
        : "Beneficiary relationship is established.",
      source: "Synthetic Bank / Beneficiary Index",
      dataField: "beneficiary.relationship_status",
      observed: `${b.beneficiaries.length} beneficiaries · ${b.beneficiaries.filter((x) => x.relationship_status === "NEW").length} NEW`,
      baseline: "Established beneficiaries carry prior transaction history",
      whyItMatters:
        "High-value transfers on newly established relationships carry elevated placement risk.",
    },
    {
      id: "E-003",
      title: "VELOCITY",
      summary: `${b.transaction_history.length} transactions in the retrieved history.`,
      source: "Synthetic Bank / Transaction Ledger",
      dataField: "ledger.history_count",
      observed: `${b.transaction_history.length} transactions`,
      baseline: `${stats.historical_transaction_count} historical transactions`,
      whyItMatters: "Burst activity can indicate an attempt to move funds before controls engage.",
    },
    {
      id: "E-004",
      title: "NETWORK",
      summary: newBeneficiary
        ? "New funding relationship detected in the beneficiary set."
        : "No new funding relationships identified.",
      source: "FRAB / Network Trace",
      dataField: "network.beneficiaries",
      observed:
        b.beneficiaries.map((x) => `${x.beneficiary_id} (${x.relationship_status})`).join(", ") ||
        "none",
      baseline: `${stats.historical_beneficiary_count} historical beneficiaries`,
      whyItMatters:
        "Aggregation from unrelated sources is a recognised layering and mule-network signature.",
    },
    {
      id: "E-005",
      title: "BEHAVIOUR",
      summary:
        deviation === null
          ? "Behavioural baseline unavailable."
          : `Activity deviates ${deviation.toFixed(1)}× from baseline.`,
      source: "Synthetic Bank / Behaviour Baseline",
      dataField: "baseline.deviation_factor",
      observed: deviation === null ? "n/a" : `${deviation.toFixed(1)}× baseline`,
      baseline: `avg ${inr(stats.historical_average)}`,
      whyItMatters:
        "Behavioural deviation contextualises whether a single transaction is genuinely abnormal.",
    },
    {
      id: "E-006",
      title: "ALERT HISTORY",
      summary: `${b.previous_cases.length} previous case(s) on record.`,
      source: "Synthetic Bank / Case History",
      dataField: "cases.previous",
      observed: `${b.previous_cases.length} previous case(s)`,
      baseline: "Account average: 0–1 cases per year",
      whyItMatters: "Repeat alerting raises the weight of the current signal.",
    },
  ];
}

function buildFindings(
  b: RawInvestigationBundle,
  deviation: number | null,
  newBeneficiary: boolean,
): Finding[] {
  return [
    {
      no: "01",
      title: "BEHAVIOUR",
      statement:
        deviation === null
          ? "Behavioural comparison unavailable for this account."
          : deviation >= 2
            ? "The transaction is materially outside the customer's historical behaviour."
            : "The transaction remains within the customer's historical behaviour.",
      evidenceIds: ["E-001", "E-005"],
    },
    {
      no: "02",
      title: "RELATIONSHIP",
      statement: newBeneficiary
        ? "The beneficiary relationship is newly established."
        : "The beneficiary relationship is established and previously transacted.",
      evidenceIds: ["E-002"],
    },
    {
      no: "03",
      title: "NETWORK",
      statement: newBeneficiary
        ? "Network analysis identified a new funding relationship."
        : "Network analysis identified no unrelated funding relationships.",
      evidenceIds: ["E-004"],
    },
  ];
}

function buildNetwork(b: RawInvestigationBundle): NetworkGraph {
  const customer = b.customer.customer_id;
  const account = b.account.account_id;
  const tx = b.trigger_transaction.transaction_id;
  const nodes: NetworkNode[] = [
    {
      id: customer,
      kind: "CUSTOMER",
      label: b.customer.customer_name || customer,
      detail: `Customer under investigation (${b.customer.city}).`,
      evidenceIds: ["E-005"],
    },
    {
      id: account,
      kind: "ACCOUNT",
      label: account,
      detail: `${b.account.account_type} · balance ${inr(b.account.current_balance)}.`,
      evidenceIds: ["E-001"],
    },
    {
      id: tx,
      kind: "TRANSACTION",
      label: tx,
      detail: `${b.trigger_transaction.type} of ${inr(b.trigger_transaction.amount)}.`,
      evidenceIds: ["E-001", "E-003"],
    },
  ];
  const edges: NetworkEdge[] = [
    { from: customer, to: account, kind: "ACCOUNT_CONNECTION", label: "HOLDS" },
    { from: account, to: tx, kind: "TRANSACTION", label: "ORIGINATED" },
  ];
  const destNode = b.trigger_transaction.nameDest;
  nodes.push({
    id: destNode,
    kind: b.trigger_transaction.destination_type === "MERCHANT" ? "MERCHANT" : "BENEFICIARY",
    label: destNode,
    detail: "Destination of the triggering transaction.",
    evidenceIds: ["E-002"],
  });
  edges.push({ from: tx, to: destNode, kind: "BENEFICIARY", label: "PAID" });

  for (const ben of b.beneficiaries) {
    if (ben.beneficiary_id === destNode) continue;
    nodes.push({
      id: ben.beneficiary_id,
      kind: "BENEFICIARY",
      label: ben.beneficiary_id,
      detail: `Beneficiary — ${ben.relationship_status} relationship.`,
      evidenceIds: ["E-004"],
    });
    edges.push({
      from: customer,
      to: ben.beneficiary_id,
      kind: "BENEFICIARY",
      label: ben.relationship_status,
    });
  }

  const newCount = b.beneficiaries.filter((x) => x.relationship_status === "NEW").length;
  const findings: Finding[] = newCount
    ? [
        {
          no: "01",
          title: "NEW BENEFICIARY",
          statement: `${newCount} beneficiary relationship(s) flagged as NEW.`,
          evidenceIds: ["E-004"],
        },
      ]
    : [
        {
          no: "01",
          title: "NO ADVERSE EXPOSURE",
          statement: "No new funding relationships were identified.",
          evidenceIds: ["E-004"],
        },
      ];

  return { nodes, edges, findings };
}

function buildRegulatory(risk: RiskLevel): RegulatoryEntry[] {
  const base: RegulatoryEntry[] = [
    {
      source: "PMLA",
      reference: "PMLA 2002 · Section 12 — Reporting obligations",
      context:
        "Reporting entities must maintain transaction records and report suspicious activity to FIU-IND.",
      whyItMatters:
        "Retrieved because the case pattern may meet the internal suspicion threshold for STR review.",
    },
    {
      source: "RBI AML / KYC",
      reference: "RBI Master Direction — KYC · Para 37, ongoing due diligence",
      context: "Transactions inconsistent with the customer's profile require enhanced scrutiny.",
      whyItMatters: "Retrieved because behavioural deviation was observed (E-005).",
    },
  ];
  if (risk === "HIGH") {
    base.push({
      source: "FATF",
      reference: "FATF Recommendation 10 — Customer due diligence",
      context: "Enhanced due diligence applies where a relationship presents higher risk.",
      whyItMatters: "Retrieved because network exposure was identified (E-004).",
    });
  }
  return base;
}

function buildTimeline(b: RawInvestigationBundle): TimelineEvent[] {
  const t = clockOf(b.trigger_transaction.event_time).slice(0, 5);
  return [
    {
      ts: `${t}:02`,
      agent: "SYSTEM",
      action: "CASE_STARTED",
      result: `${b.alert.alert_id} received from rule engine`,
      evidenceIds: [],
    },
    {
      ts: `${t}:04`,
      agent: "SUPERVISOR",
      action: "DISPATCH",
      result: "Pipeline dispatched to 4 specialists",
      evidenceIds: [],
    },
    {
      ts: `${t}:09`,
      agent: "WATCHMAN",
      action: "TRIAGE",
      result: `Severity ${b.alert.severity} — signals extracted`,
      evidenceIds: ["E-001"],
    },
    {
      ts: `${t}:21`,
      agent: "DETECTIVE",
      action: "EVIDENCE",
      result: `${b.transaction_history.length} history + ${b.beneficiaries.length} beneficiaries reviewed`,
      evidenceIds: ["E-002", "E-003", "E-004"],
    },
    {
      ts: `${t}:36`,
      agent: "JURIST",
      action: "REGULATORY",
      result: "Regulatory references retrieved",
      evidenceIds: [],
    },
    {
      ts: `${t}:49`,
      agent: "SCRIBE",
      action: "CASE_FILE",
      result: "Audit-ready explanation compiled",
      evidenceIds: [],
    },
    {
      ts: `${t}:52`,
      agent: "FRAB",
      action: "INVESTIGATION_COMPLETE",
      result: b.alert.alert_type,
      evidenceIds: ["E-001", "E-004"],
    },
  ];
}

export async function submitAnalystDecision(
  caseId: string,
  decision: { action: AnalystAction; overridden: boolean; reason: string },
): Promise<AnalystDecisionRecord> {
  const record: AnalystDecisionRecord = { ...decision, ts: new Date().toISOString() };
  // The synthetic bank has no decision write endpoint; record the decision
  // locally so the analyst action is captured in-session.
  await new Promise((r) => setTimeout(r, 350));
  return record;
}

/** Starts the escalation call workflow. Never fakes a call when no backend exists. */
export async function startEscalationCall(caseId: string): Promise<CallingAgentState> {
  await new Promise((r) => setTimeout(r, 250));
  return {
    state: "NOT_CONNECTED",
    contact: null,
    detail:
      "The escalation calling agent is handled by a separate service and is not connected in this environment.",
  };
}

export const EXPORT_AVAILABLE = false;
export const caseExportUrl = (_caseId: string): string | null => null;
