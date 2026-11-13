/**
 * Alert Intelligence data layer.
 *
 * Backend contract (adapt names when the service lands):
 *   GET  /alerts                    -> AlertRecord[]
 *   GET  /alerts/:alertId           -> AlertDetail
 *   GET  /transactions              -> TxnRecord[]
 *   GET  /customers/:customerId     -> CustomerContext
 *   POST /investigations            -> { case_id }
 *
 * Without VITE_FRAB_API_URL the module resolves an explicitly labelled
 * SIMULATED BANK FEED so the console never pretends to be live.
 */

import { API_BASE_URL, IS_LIVE_BACKEND } from "./frab-api";

// Matches the alert_type values the synthetic bank actually emits.
export const ALERT_TRIGGERS = [
  "HIGH_VALUE_NEW_BENEFICIARY",
  "HIGH_VALUE_TRANSFER",
  "VELOCITY_SPIKE",
  "STRUCTURING_PATTERN",
  "BEHAVIOUR_DEVIATION",
  "NEW_BENEFICIARY",
  "KYC_MISMATCH",
  "MULE_PATTERN",
  "REPEATED_CASHOUT",
  "CROSS_ACCOUNT_BURST",
] as const;

export type AlertTrigger = (typeof ALERT_TRIGGERS)[number];
export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";
export const ALERT_STATUSES = ["NEW", "INVESTIGATING", "INVESTIGATED", "REVIEW_REQUIRED"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export interface AlertRecord {
  id: string;
  time: string;
  customerId: string;
  accountId: string;
  transactionId: string;
  trigger: AlertTrigger;
  amount: number;
  risk: RiskLevel;
  status: AlertStatus;
  /** Trigger conditions reported by the rule engine. Never invented client-side. */
  conditions: string[];
}

export interface CustomerContext {
  customerId: string;
  accountId: string;
  kycStatus: string | null;
  typicalRange: string | null;
  recentTransactionCount: number | null;
  previousAlertCount: number | null;
}

export interface TxnRecord {
  time: string;
  id: string;
  account: string;
  type: "TRANSFER" | "CASHOUT" | "DEPOSIT" | "PAYMENT";
  amount: number;
  destination: string;
  result: "ALERT" | "NORMAL" | "REVIEW";
}

export type FeedMode = "live" | "simulated";
export const FEED_MODE: FeedMode = IS_LIVE_BACKEND ? "live" : "simulated";

export interface AlertTelemetry {
  total: number;
  high: number;
  medium: number;
  low: number;
  investigationsActive: number;
}

/* ------------------------------------------------- simulated bank dataset */

const SIM_ALERTS: AlertRecord[] = [
  {
    id: "ALT-00091",
    time: "10:42:31",
    customerId: "CUST-00891",
    accountId: "ACC-00281",
    transactionId: "TXN-847201",
    trigger: "HIGH_VALUE_NEW_BENEFICIARY",
    amount: 185000,
    risk: "HIGH",
    status: "NEW",
    conditions: [
      "Transaction exceeds configured monitoring threshold",
      "Beneficiary relationship is new",
      "Transaction pattern triggered bank rule",
    ],
  },
  {
    id: "ALT-00090",
    time: "10:39:07",
    customerId: "CUST-00412",
    accountId: "ACC-00119",
    transactionId: "TXN-847188",
    trigger: "VELOCITY_SPIKE",
    amount: 96500,
    risk: "HIGH",
    status: "NEW",
    conditions: [
      "Transaction count exceeded velocity window threshold",
      "Multiple transfers within 18 minutes",
    ],
  },
  {
    id: "ALT-00089",
    time: "10:31:52",
    customerId: "CUST-00077",
    accountId: "ACC-00077",
    transactionId: "TXN-847140",
    trigger: "STRUCTURING_PATTERN",
    amount: 49000,
    risk: "HIGH",
    status: "INVESTIGATING",
    conditions: [
      "Repeated amounts below reporting threshold",
      "Sequence detected within 24-hour window",
    ],
  },
  {
    id: "ALT-00088",
    time: "10:24:16",
    customerId: "CUST-00248",
    accountId: "ACC-00248",
    transactionId: "TXN-847101",
    trigger: "BEHAVIOUR_DEVIATION",
    amount: 132000,
    risk: "HIGH",
    status: "REVIEW_REQUIRED",
    conditions: [
      "Amount materially outside customer behaviour baseline",
      "Channel differs from historical pattern",
    ],
  },
  {
    id: "ALT-00087",
    time: "10:18:44",
    customerId: "CUST-00355",
    accountId: "ACC-00355",
    transactionId: "TXN-847066",
    trigger: "MULE_PATTERN",
    amount: 74000,
    risk: "HIGH",
    status: "NEW",
    conditions: [
      "Inbound funds dispersed within short window",
      "Multiple unrelated senders to same beneficiary",
    ],
  },
  {
    id: "ALT-00086",
    time: "10:11:09",
    customerId: "CUST-00119",
    accountId: "ACC-00119",
    transactionId: "TXN-847021",
    trigger: "NEW_BENEFICIARY",
    amount: 41500,
    risk: "MEDIUM",
    status: "NEW",
    conditions: ["Beneficiary added within the last 24 hours"],
  },
  {
    id: "ALT-00085",
    time: "10:04:38",
    customerId: "CUST-00203",
    accountId: "ACC-00203",
    transactionId: "TXN-846988",
    trigger: "CROSS_ACCOUNT_BURST",
    amount: 58000,
    risk: "MEDIUM",
    status: "NEW",
    conditions: ["Outbound transfers to 5 accounts within one hour"],
  },
  {
    id: "ALT-00084",
    time: "09:57:21",
    customerId: "CUST-00061",
    accountId: "ACC-00061",
    transactionId: "TXN-846940",
    trigger: "REPEATED_CASHOUT",
    amount: 30000,
    risk: "MEDIUM",
    status: "INVESTIGATED",
    conditions: ["Third cash withdrawal in 48 hours"],
  },
  {
    id: "ALT-00083",
    time: "09:48:55",
    customerId: "CUST-00155",
    accountId: "ACC-00155",
    transactionId: "TXN-846902",
    trigger: "KYC_MISMATCH",
    amount: 22000,
    risk: "MEDIUM",
    status: "NEW",
    conditions: ["Declared occupation inconsistent with transaction profile"],
  },
  {
    id: "ALT-00082",
    time: "09:41:02",
    customerId: "CUST-00233",
    accountId: "ACC-00233",
    transactionId: "TXN-846871",
    trigger: "REPEATED_CASHOUT",
    amount: 18500,
    risk: "LOW",
    status: "INVESTIGATED",
    conditions: ["Pattern previously reviewed and closed by analyst"],
  },
  {
    id: "ALT-00081",
    time: "09:33:47",
    customerId: "CUST-00088",
    accountId: "ACC-00088",
    transactionId: "TXN-846830",
    trigger: "NEW_BENEFICIARY",
    amount: 12000,
    risk: "LOW",
    status: "NEW",
    conditions: ["Beneficiary added within the last 7 days"],
  },
];

const SIM_CONTEXT: Record<string, CustomerContext> = {
  "CUST-00891": {
    customerId: "CUST-00891",
    accountId: "ACC-00281",
    kycStatus: "VERIFIED / 2024-03-11",
    typicalRange: "₹20,000 – ₹40,000",
    recentTransactionCount: 34,
    previousAlertCount: 1,
  },
};

const SIM_ACCOUNTS = ["ACC-00281", "ACC-00119", "ACC-00077", "ACC-00248", "ACC-00355", "ACC-00203"];
const SIM_DEST = ["BEN-0192", "BEN-0112", "BEN-0074", "MER-4420", "MER-1187", "BEN-0226"];
const SIM_TYPES: TxnRecord["type"][] = ["TRANSFER", "PAYMENT", "CASHOUT", "DEPOSIT"];

let simSeq = 847201;

export function nextSimulatedTxn(): TxnRecord {
  simSeq -= 1;
  const amount = Math.round((Math.random() * 190000 + 2000) / 500) * 500;
  const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]!;
  return {
    time: new Date().toTimeString().slice(0, 8),
    id: `TX-${simSeq}`,
    account: pick(SIM_ACCOUNTS),
    type: pick(SIM_TYPES),
    amount,
    destination: pick(SIM_DEST),
    result: amount > 150000 ? "ALERT" : amount > 110000 ? "REVIEW" : "NORMAL",
  };
}

/* -------------------------------------------------------------- transport */

import {
  backendGet,
  toAccountId,
  toRisk,
  clockOf,
  type RawAlert,
  type RawCase,
  type RawInvestigationBundle,
  type RawTxn,
  type RawTxnPage,
} from "./frab-backend";
import { IS_WORKER_LIVE, startWorkerInvestigation } from "./frab-worker";

async function delayed<T>(value: T, ms = 220): Promise<T> {
  await new Promise((r) => setTimeout(r, ms));
  return value;
}

function mapAlertStatus(status: string): AlertStatus {
  const s = (status ?? "").toUpperCase();
  if (s === "INVESTIGATING" || s === "IN_INVESTIGATION") return "INVESTIGATING";
  if (s === "INVESTIGATED" || s === "CLOSED" || s === "COMPLETED") return "INVESTIGATED";
  if (s === "REVIEW_REQUIRED" || s === "ANALYST_REQUIRED") return "REVIEW_REQUIRED";
  return "NEW";
}

function coerceTrigger(alertType: string): AlertTrigger {
  return (ALERT_TRIGGERS as readonly string[]).includes(alertType)
    ? (alertType as AlertTrigger)
    : "BEHAVIOUR_DEVIATION";
}

/** Build human-readable trigger conditions from the alert's expected_reason. */
function conditionsFor(a: RawAlert): string[] {
  const out: string[] = [];
  if (a.expected_reason) out.push(a.expected_reason);
  else out.push(`Rule engine flagged ${a.alert_type.replace(/_/g, " ").toLowerCase()}.`);
  if (a.scenario) out.push(`Scenario: ${a.scenario}`);
  return out;
}

/** Fetch the investigation bundle for an alert to enrich queue rows (amount, etc.). */
async function bundleFor(alertId: string): Promise<RawInvestigationBundle | null> {
  try {
    return await backendGet<RawInvestigationBundle>(`/investigation/${alertId}`);
  } catch {
    return null;
  }
}

export async function fetchAlertQueue(): Promise<AlertRecord[]> {
  if (!API_BASE_URL) return delayed(SIM_ALERTS);
  const raw = await backendGet<RawAlert[]>("/alerts");
  // Enrich each alert with its trigger transaction (for amount) in parallel.
  const bundles = await Promise.all(raw.map((a) => bundleFor(a.alert_id)));
  return raw.map((a, i) => {
    const bundle = bundles[i];
    const trigger = bundle?.trigger_transaction;
    return {
      id: a.alert_id,
      time: clockOf(trigger?.event_time ?? a.created_at),
      customerId: a.customer_id,
      accountId: toAccountId(a.customer_id),
      transactionId: a.transaction_id,
      trigger: coerceTrigger(a.alert_type),
      amount: trigger?.amount ?? 0,
      risk: toRisk(a.severity),
      status: mapAlertStatus(a.status),
      conditions: conditionsFor(a),
    } satisfies AlertRecord;
  });
}

function mapTxn(t: RawTxn): TxnRecord {
  const type: TxnRecord["type"] =
    t.type === "TRANSFER"
      ? "TRANSFER"
      : t.type === "CASH_OUT" || t.type === "CASH_IN"
        ? "CASHOUT"
        : t.type === "PAYMENT" || t.type === "DEBIT"
          ? "PAYMENT"
          : "DEPOSIT";
  return {
    time: clockOf(t.event_time),
    id: t.transaction_id,
    account: toAccountId(t.customer_id),
    type,
    amount: t.amount,
    destination: t.nameDest,
    result: t.isFlaggedFraud ? "ALERT" : t.isFraud ? "REVIEW" : "NORMAL",
  };
}

export async function fetchTransactionFeed(): Promise<TxnRecord[]> {
  if (!API_BASE_URL) return delayed(Array.from({ length: 8 }, () => nextSimulatedTxn()));
  // Pull the most recent slice of the ledger for the live feed.
  const page = await backendGet<RawTxnPage>("/transactions/all?limit=12");
  return page.transactions.map(mapTxn);
}

export interface TxnFeedPage {
  rows: TxnRecord[];
  offset: number;
  total: number;
  hasMore: boolean;
}

/**
 * Fetch one page of the real ledger, mapped. Used to progressively stream real
 * transactions into the UI so the live feed advances through actual backend
 * data instead of static rows.
 */
export async function fetchTransactionPage(offset = 0, limit = 20): Promise<TxnFeedPage> {
  if (!API_BASE_URL) {
    const rows = Array.from({ length: limit }, () => nextSimulatedTxn());
    return { rows, offset: offset + limit, total: offset + limit + limit, hasMore: true };
  }
  const page = await backendGet<RawTxnPage>(`/transactions/all?limit=${limit}&offset=${offset}`);
  const nextOffset = offset + page.returned;
  return {
    rows: page.transactions.map(mapTxn),
    offset: nextOffset,
    total: page.total,
    hasMore: nextOffset < page.total,
  };
}

export async function fetchCustomerContext(
  customerId: string,
  accountId: string,
): Promise<CustomerContext> {
  const fallback: CustomerContext = {
    customerId,
    accountId,
    kycStatus: null,
    typicalRange: null,
    recentTransactionCount: null,
    previousAlertCount: null,
  };
  if (!API_BASE_URL) return delayed(SIM_CONTEXT[customerId] ?? fallback);

  const [kyc, txns, alerts] = await Promise.all([
    backendGet<{ kyc_status?: string; risk_category?: string }>(
      `/customers/${customerId}/kyc`,
    ).catch(() => null),
    backendGet<RawTxn[]>(`/accounts/${toAccountId(accountId)}/transactions`).catch(
      () => [] as RawTxn[],
    ),
    backendGet<RawAlert[]>("/alerts").catch(() => [] as RawAlert[]),
  ]);

  const amounts = txns.map((t) => t.amount).filter((n) => n > 0);
  let typicalRange: string | null = null;
  if (amounts.length) {
    const sorted = [...amounts].sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.25)] ?? sorted[0]!;
    const hi = sorted[Math.floor(sorted.length * 0.75)] ?? sorted[sorted.length - 1]!;
    typicalRange = `${inr(Math.round(lo))} – ${inr(Math.round(hi))}`;
  }

  return {
    customerId,
    accountId,
    kycStatus: kyc?.kyc_status
      ? `${kyc.kyc_status}${kyc.risk_category ? ` / ${kyc.risk_category}` : ""}`
      : null,
    typicalRange,
    recentTransactionCount: txns.length || null,
    previousAlertCount: alerts.filter((a) => a.customer_id === customerId).length || null,
  };
}

/**
 * Opens an investigation for an alert and returns the case id all screens key
 * off (stored in frab-case-state).
 *
 * When the worker is configured, this starts the real agentic investigation via
 * POST /investigate. We supply the case id (the worker uses the id we send, per
 * CONTRACT_DIFF.md) so alerts -> workspace -> result all share one handle.
 *
 * Without a worker it falls back to resolving the bank's existing case id, and
 * without any backend to a synthetic handle.
 */
export async function createInvestigation(alert: AlertRecord | string): Promise<string> {
  const record = typeof alert === "string" ? null : alert;
  const alertId = typeof alert === "string" ? alert : alert.id;

  // Determine the case id to use — prefer the bank's existing case for the alert.
  let caseId = alertId;
  if (API_BASE_URL) {
    try {
      const cases = await backendGet<RawCase[]>("/cases");
      const match = cases.find((c) => c.alert_id === alertId);
      if (match) caseId = match.case_id;
    } catch {
      /* keep alert-id based handle */
    }
  }

  if (IS_WORKER_LIVE) {
    const meta = record ?? (await lookupAlertMeta(alertId));
    await startWorkerInvestigation({
      case_id: caseId,
      alert_id: alertId,
      alert: {
        type: meta?.trigger ?? "UNKNOWN",
        severity: meta?.risk ?? "MEDIUM",
        transaction_id: meta?.transactionId ?? "",
      },
      customer_id: meta?.customerId ?? "",
    });
    return caseId;
  }

  if (!API_BASE_URL) {
    await new Promise((r) => setTimeout(r, 900));
    return `FRAB-${alertId.replace(/[^0-9]/g, "").padStart(8, "0")}`;
  }
  return caseId;
}

/** Minimal alert metadata for starting a worker investigation. */
async function lookupAlertMeta(
  alertId: string,
): Promise<Pick<AlertRecord, "trigger" | "risk" | "transactionId" | "customerId"> | null> {
  if (!API_BASE_URL) return null;
  try {
    const a = await backendGet<RawAlert>(`/alerts/${alertId}`);
    return {
      trigger: coerceTrigger(a.alert_type),
      risk: toRisk(a.severity),
      transactionId: a.transaction_id,
      customerId: a.customer_id,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------- realtime alert push */

export interface NewAlertEvent {
  event: "NEW_ALERT";
  alert_id: string;
  customer_id: string;
  severity: string;
}

/**
 * Subscribes to the backend's real-time alert stream (WS /ws/alerts).
 * Calls onAlert with each NEW_ALERT event. Returns an unsubscribe function.
 * No-op (returns a noop cleanup) when no backend is configured.
 */
// The realtime alert push is optional: many deployments of the bank API do not
// expose /ws/alerts. Cap reconnects so a missing endpoint doesn't flood the
// console with an endless retry loop — the queue still refreshes via polling.
const WS_MAX_ATTEMPTS = 3;

export function subscribeToAlerts(onAlert: (evt: NewAlertEvent) => void): () => void {
  if (!API_BASE_URL || typeof WebSocket === "undefined") return () => {};
  const wsUrl = API_BASE_URL.replace(/^http/, "ws") + "/ws/alerts";
  let socket: WebSocket | null = null;
  let closed = false;
  let attempts = 0;
  let opened = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    if (closed || attempts >= WS_MAX_ATTEMPTS) return;
    attempts += 1;
    try {
      socket = new WebSocket(wsUrl);
    } catch {
      return;
    }
    socket.onopen = () => {
      opened = true;
      attempts = 0; // reset the budget once a real connection is established
    };
    socket.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as NewAlertEvent;
        if (data && data.event === "NEW_ALERT") onAlert(data);
      } catch {
        /* ignore malformed frames */
      }
    };
    socket.onclose = () => {
      if (closed) return;
      // Only reconnect if we ever connected, or still have attempts left.
      if (opened || attempts < WS_MAX_ATTEMPTS) {
        retry = setTimeout(connect, 5000);
      }
      // else: give up silently — the 15s queue poll keeps alerts fresh.
    };
    socket.onerror = () => socket?.close();
  };

  connect();

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    socket?.close();
  };
}

/** Fetch a single alert (mapped) — used to hydrate a realtime push into a row. */
export async function fetchAlertById(alertId: string): Promise<AlertRecord | null> {
  if (!API_BASE_URL) return SIM_ALERTS.find((a) => a.id === alertId) ?? null;
  try {
    const [a, bundle] = await Promise.all([
      backendGet<RawAlert>(`/alerts/${alertId}`),
      bundleFor(alertId),
    ]);
    const trigger = bundle?.trigger_transaction;
    return {
      id: a.alert_id,
      time: clockOf(trigger?.event_time ?? a.created_at),
      customerId: a.customer_id,
      accountId: toAccountId(a.customer_id),
      transactionId: a.transaction_id,
      trigger: coerceTrigger(a.alert_type),
      amount: trigger?.amount ?? 0,
      risk: toRisk(a.severity),
      status: mapAlertStatus(a.status),
      conditions: conditionsFor(a),
    } satisfies AlertRecord;
  } catch {
    return null;
  }
}

export function telemetryOf(alerts: AlertRecord[]): AlertTelemetry {
  return {
    total: alerts.length,
    high: alerts.filter((a) => a.risk === "HIGH").length,
    medium: alerts.filter((a) => a.risk === "MEDIUM").length,
    low: alerts.filter((a) => a.risk === "LOW").length,
    investigationsActive: alerts.filter((a) => a.status === "INVESTIGATING").length,
  };
}

export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
