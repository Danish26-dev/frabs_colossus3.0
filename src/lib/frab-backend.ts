/**
 * Synthetic Bank backend client.
 *
 * Centralises the live backend transport: base URL, request helper, the raw
 * (snake_case) response shapes the service returns, and small utilities the
 * adapter layers in the other frab-*.ts modules use to map those shapes into
 * the frontend's own types.
 *
 * All UI components stay untouched — every mapping lives behind the existing
 * fetch* functions in frab-api / frab-alerts / frab-result / frab-investigation.
 */

import { API_BASE_URL } from "./frab-api";

/* ----------------------------------------------------------- raw backend shapes */

export interface RawAlert {
  alert_id: string;
  transaction_id: string;
  customer_id: string;
  alert_type: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  status: string; // OPEN | ...
  scenario: string | null;
  scenario_id?: string | null;
  expected_reason?: string | null;
  created_at: string | null;
}

export interface RawCase {
  case_id: string;
  customer_id: string;
  alert_id: string;
  case_type: string;
  status: string;
  disposition: string; // PENDING | ...
  investigation_note: string;
}

export interface RawCustomer {
  customer_id: string;
  account_id: string;
  customer_name: string;
  status: string;
  city: string;
}

export interface RawKyc {
  customer_id: string;
  kyc_status: string;
  risk_category: string;
  occupation: string;
  annual_income_band: string;
  document_type: string;
  document_verified: boolean;
  phone_verified: boolean;
  address_verified: boolean;
  pep_status: boolean;
}

export interface RawAccount {
  account_id: string;
  customer_id: string;
  account_type: string;
  status: string;
  opening_date: string;
  current_balance: number;
}

export interface RawTxn {
  transaction_id: string;
  step: number;
  type: string; // TRANSFER | PAYMENT | CASH_IN | CASH_OUT | DEBIT
  amount: number;
  nameOrig: string;
  oldbalanceOrg: number;
  newbalanceOrig: number;
  nameDest: string;
  oldbalanceDest: number;
  newbalanceDest: number;
  isFraud: number;
  isFlaggedFraud: number;
  customer_id: string;
  account_id: string;
  event_time: string; // ISO
  destination_type: "ACCOUNT" | "MERCHANT" | string;
  is_scenario_trigger: boolean;
  device_id: string | null;
}

export interface RawHistoricalStats {
  historical_average: number;
  historical_median: number;
  historical_max: number;
  historical_transaction_count: number;
  historical_beneficiary_count: number;
  note?: string;
}

export interface RawBeneficiary {
  customer_id: string;
  beneficiary_id: string;
  relationship_status: "ESTABLISHED" | "NEW" | string;
}

export interface RawInvestigationBundle {
  alert: RawAlert;
  customer: RawCustomer;
  account: RawAccount;
  kyc: RawKyc;
  trigger_transaction: RawTxn;
  transaction_history: RawTxn[];
  historical_statistics: RawHistoricalStats;
  beneficiaries: RawBeneficiary[];
  related_transactions: RawTxn[];
  previous_cases: RawCase[];
}

export interface RawTxnPage {
  total: number;
  limit: number;
  offset: number;
  returned: number;
  transactions: RawTxn[];
}

/* --------------------------------------------------------------- transport */

/** GET a JSON endpoint on the live backend. Throws when no backend is set. */
export async function backendGet<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE_URL) throw new Error("No backend configured (VITE_FRAB_API_URL unset)");
  const res = await fetch(`${API_BASE_URL}${path}`, init);
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return (await res.json()) as T;
}

/* ---------------------------------------------------------------- utilities */

/** Accounts require the ACC- prefix; account_id === `ACC-${customer_id}`. */
export function toAccountId(idOrCustomer: string): string {
  return idOrCustomer.startsWith("ACC-") ? idOrCustomer : `ACC-${idOrCustomer}`;
}

/** Normalise backend severity into the frontend HIGH | MEDIUM | LOW risk. */
export function toRisk(severity: string | null | undefined): "HIGH" | "MEDIUM" | "LOW" {
  const s = (severity ?? "").toUpperCase();
  if (s === "HIGH") return "HIGH";
  if (s === "MEDIUM" || s === "MED") return "MEDIUM";
  return "LOW";
}

/** ISO datetime -> HH:MM:SS clock label used across the console. */
export function clockOf(iso: string | null | undefined): string {
  if (!iso) return new Date().toTimeString().slice(0, 8);
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? new Date().toTimeString().slice(0, 8)
    : d.toTimeString().slice(0, 8);
}

/** A synthetic bank alert is "beneficiary novel" when a NEW relationship exists. */
export function hasNewBeneficiary(beneficiaries: RawBeneficiary[]): boolean {
  return beneficiaries.some((b) => (b.relationship_status ?? "").toUpperCase() === "NEW");
}
