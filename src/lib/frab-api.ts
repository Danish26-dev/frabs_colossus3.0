/**
 * FRAB data access layer.
 *
 * The application is designed to talk to the synthetic bank backend through
 * REST endpoints (GET /customers, /accounts, /transactions, /kyc,
 * /beneficiaries, /merchants, /behaviour-baselines, /alerts, /cases,
 * /system-status).
 *
 * Until a backend base URL is configured (VITE_FRAB_API_URL), every reader
 * resolves against the bundled demo dataset and reports `source: "demo"` so
 * the UI can label the environment honestly instead of faking live state.
 */

export const API_BASE_URL: string | undefined =
  (import.meta.env["VITE_FRAB_API_URL"] as string | undefined) || undefined;

export const IS_LIVE_BACKEND = Boolean(API_BASE_URL);

export type DataSource = "live" | "demo";

export type Envelope<T> = { data: T; source: DataSource; fetchedAt: string };

export type ServiceState = "online" | "ready" | "connected" | "verified" | "not_connected";

export interface SystemStatus {
  mainBackend: ServiceState;
  bankFeed: ServiceState;
  alertPipeline: ServiceState;
  confidentialWorkspace: ServiceState;
  teeAttestation: ServiceState;
  encryptedInference: ServiceState;
}

export interface DatasetStat {
  key: string;
  value: number;
  label: string;
  identifier: string;
}

export interface Alert {
  id: string;
  type: string;
  risk: "HIGH" | "MEDIUM" | "LOW";
  account: string;
  raisedAt: string;
  status: "NEW" | "IN_INVESTIGATION" | "COMPLETED" | "ANALYST_REQUIRED";
}

export interface Txn {
  id: string;
  ts: string;
  from: string;
  to: string;
  amount: number;
  flagged?: boolean;
}

export interface InvestigationStatus {
  newAlerts: number;
  investigations: number;
  completed: number;
  requiringAnalyst: number;
  lastCase: { id: string; status: string } | null;
}

/* ----------------------------------------------------------- demo dataset */

const DEMO_DATASET: DatasetStat[] = [
  { key: "customers", value: 300, label: "CUSTOMERS", identifier: "CUSTOMER_MASTER" },
  { key: "accounts", value: 300, label: "ACCOUNTS", identifier: "ACCOUNT_REGISTRY" },
  { key: "transactions", value: 9991, label: "TRANSACTIONS", identifier: "BANK_TX_LEDGER" },
  { key: "kyc", value: 300, label: "KYC PROFILES", identifier: "KYC_VAULT" },
  { key: "beneficiaries", value: 1105, label: "BENEFICIARIES", identifier: "BENEFICIARY_INDEX" },
  { key: "merchants", value: 1866, label: "MERCHANTS", identifier: "MERCHANT_DIRECTORY" },
  { key: "baselines", value: 300, label: "BEHAVIOR BASELINES", identifier: "BEHAVIOUR_BASELINE" },
  { key: "scenarios", value: 10, label: "DEMO ALERT SCENARIOS", identifier: "SCENARIO_SET" },
];

const DEMO_ALERTS: Alert[] = [
  {
    id: "ALT-001",
    type: "HIGH_VALUE_NEW_BENEFICIARY",
    risk: "HIGH",
    account: "ACC_0214",
    raisedAt: "12:41:02",
    status: "NEW",
  },
  {
    id: "ALT-002",
    type: "VELOCITY_SPIKE",
    risk: "HIGH",
    account: "ACC_0192",
    raisedAt: "12:38:47",
    status: "NEW",
  },
  {
    id: "ALT-003",
    type: "STRUCTURING_PATTERN",
    risk: "HIGH",
    account: "ACC_0077",
    raisedAt: "12:31:19",
    status: "NEW",
  },
  {
    id: "ALT-004",
    type: "BEHAVIOUR_DEVIATION",
    risk: "HIGH",
    account: "ACC_0248",
    raisedAt: "12:22:55",
    status: "ANALYST_REQUIRED",
  },
  {
    id: "ALT-005",
    type: "NEW_BENEFICIARY",
    risk: "MEDIUM",
    account: "ACC_0119",
    raisedAt: "12:16:08",
    status: "NEW",
  },
  {
    id: "ALT-006",
    type: "CROSS_BORDER_BURST",
    risk: "HIGH",
    account: "ACC_0203",
    raisedAt: "12:09:44",
    status: "NEW",
  },
  {
    id: "ALT-007",
    type: "DORMANT_REACTIVATION",
    risk: "HIGH",
    account: "ACC_0061",
    raisedAt: "11:58:30",
    status: "NEW",
  },
  {
    id: "ALT-008",
    type: "ROUND_AMOUNT_SERIES",
    risk: "MEDIUM",
    account: "ACC_0155",
    raisedAt: "11:47:12",
    status: "NEW",
  },
  {
    id: "ALT-009",
    type: "MERCHANT_ANOMALY",
    risk: "MEDIUM",
    account: "ACC_0233",
    raisedAt: "11:39:05",
    status: "NEW",
  },
  {
    id: "ALT-010",
    type: "MULE_NETWORK_SIGNAL",
    risk: "HIGH",
    account: "ACC_0088",
    raisedAt: "11:24:51",
    status: "NEW",
  },
];

const DEMO_SYSTEM_STATUS: SystemStatus = {
  mainBackend: "not_connected",
  bankFeed: "not_connected",
  alertPipeline: "not_connected",
  confidentialWorkspace: "not_connected",
  teeAttestation: "not_connected",
  encryptedInference: "not_connected",
};

const DEMO_INVESTIGATION: InvestigationStatus = {
  newAlerts: 3,
  investigations: 0,
  completed: 0,
  requiringAnalyst: 0,
  lastCase: null,
};

/* ------------------------------------------------------------- transport */

import {
  backendGet,
  toAccountId,
  toRisk,
  clockOf,
  type RawAlert,
  type RawCase,
  type RawTxnPage,
} from "./frab-backend";

function demoEnvelope<T>(demo: T): Promise<Envelope<T>> {
  const fetchedAt = new Date().toISOString();
  // No backend configured — resolve demo data, explicitly labelled.
  return new Promise((resolve) =>
    setTimeout(() => resolve({ data: demo, source: "demo", fetchedAt }), 180),
  );
}

/** Map a backend alert status onto the frontend Alert.status union. */
function toAlertStatus(status: string): Alert["status"] {
  const s = (status ?? "").toUpperCase();
  if (s === "IN_INVESTIGATION" || s === "INVESTIGATING") return "IN_INVESTIGATION";
  if (s === "COMPLETED" || s === "CLOSED" || s === "RESOLVED") return "COMPLETED";
  if (s === "ANALYST_REQUIRED" || s === "REVIEW_REQUIRED") return "ANALYST_REQUIRED";
  return "NEW";
}

export async function fetchDatasetStats(): Promise<Envelope<DatasetStat[]>> {
  if (!API_BASE_URL) return demoEnvelope(DEMO_DATASET);
  const fetchedAt = new Date().toISOString();
  // Derive live dataset counts from the endpoints the backend actually exposes.
  const [txnPage, alerts, cases] = await Promise.all([
    backendGet<RawTxnPage>("/transactions/all?limit=1"),
    backendGet<RawAlert[]>("/alerts"),
    backendGet<RawCase[]>("/cases"),
  ]);
  const customers = new Set(alerts.map((a) => a.customer_id)).size;
  const data: DatasetStat[] = [
    {
      key: "transactions",
      value: txnPage.total,
      label: "TRANSACTIONS",
      identifier: "BANK_TX_LEDGER",
    },
    { key: "alerts", value: alerts.length, label: "ACTIVE ALERTS", identifier: "ALERT_QUEUE" },
    { key: "cases", value: cases.length, label: "CASES", identifier: "CASE_REGISTRY" },
    {
      key: "customers",
      value: customers,
      label: "FLAGGED CUSTOMERS",
      identifier: "CUSTOMER_MASTER",
    },
  ];
  return { data, source: "live", fetchedAt };
}

export async function fetchAlerts(): Promise<Envelope<Alert[]>> {
  if (!API_BASE_URL) return demoEnvelope(DEMO_ALERTS);
  const fetchedAt = new Date().toISOString();
  const raw = await backendGet<RawAlert[]>("/alerts");
  const data: Alert[] = raw.map((a) => ({
    id: a.alert_id,
    type: a.alert_type,
    risk: toRisk(a.severity),
    account: toAccountId(a.customer_id),
    raisedAt: clockOf(a.created_at),
    status: toAlertStatus(a.status),
  }));
  return { data, source: "live", fetchedAt };
}

export async function fetchSystemStatus(): Promise<Envelope<SystemStatus>> {
  if (!API_BASE_URL) return demoEnvelope(DEMO_SYSTEM_STATUS);
  const fetchedAt = new Date().toISOString();
  // The synthetic bank exposes /health but no confidential-compute services;
  // report the bank-facing services as live and TEE/inference as not connected.
  let online = false;
  try {
    const health = await backendGet<{ status?: string }>("/health");
    online = (health.status ?? "").toLowerCase() === "ok";
  } catch {
    online = false;
  }
  const data: SystemStatus = {
    mainBackend: online ? "online" : "not_connected",
    bankFeed: online ? "connected" : "not_connected",
    alertPipeline: online ? "ready" : "not_connected",
    confidentialWorkspace: "not_connected",
    teeAttestation: "not_connected",
    encryptedInference: "not_connected",
  };
  return { data, source: "live", fetchedAt };
}

export async function fetchInvestigationStatus(): Promise<Envelope<InvestigationStatus>> {
  if (!API_BASE_URL) return demoEnvelope(DEMO_INVESTIGATION);
  const fetchedAt = new Date().toISOString();
  const [alerts, cases] = await Promise.all([
    backendGet<RawAlert[]>("/alerts"),
    backendGet<RawCase[]>("/cases"),
  ]);
  const isOpen = (s: string) => (s ?? "").toUpperCase() === "OPEN";
  const isClosed = (s: string) =>
    ["CLOSED", "COMPLETED", "RESOLVED"].includes((s ?? "").toUpperCase());
  const requiringAnalyst = cases.filter(
    (c) => (c.disposition ?? "").toUpperCase() === "PENDING",
  ).length;
  const last = cases[0];
  const data: InvestigationStatus = {
    newAlerts: alerts.filter((a) => isOpen(a.status)).length,
    investigations: cases.filter((c) => isOpen(c.status)).length,
    completed: cases.filter((c) => isClosed(c.status)).length,
    requiringAnalyst,
    lastCase: last ? { id: last.case_id, status: last.status } : null,
  };
  return { data, source: "live", fetchedAt };
}

/* --------------------------------------------------- simulated bank feed */

const ACCOUNTS = [
  "ACC_0214",
  "ACC_0192",
  "ACC_0077",
  "ACC_0248",
  "ACC_0119",
  "ACC_0088",
  "ACC_0155",
];
const TARGETS = ["BEN_083", "BEN_091", "MER_442", "MER_118", "BEN_017", "MER_903", "BEN_226"];

let seq = 0x8f92a1;

export function nextSyntheticTxn(): Txn {
  seq += 1;
  const amount = Math.round((Math.random() * 240000 + 4000) / 500) * 500;
  const d = new Date();
  return {
    id: `TXN_${seq.toString(16).toUpperCase()}`,
    ts: d.toTimeString().slice(0, 8),
    from: ACCOUNTS[Math.floor(Math.random() * ACCOUNTS.length)]!,
    to: TARGETS[Math.floor(Math.random() * TARGETS.length)]!,
    amount,
    flagged: amount > 180000,
  };
}

export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
