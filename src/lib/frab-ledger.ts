/**
 * Full-ledger access for the Data Explorer.
 *
 * The bank API exposes the ledger through GET /transactions/all?limit&offset and has no
 * "list customers" endpoint, so customers are derived from the ledger itself (every
 * transaction carries a customer_id) and enriched lazily via GET /customers/{id}.
 * Everything here reads the live backend; nothing is generated client-side.
 */

import {
  backendGet,
  toAccountId,
  type RawAccount,
  type RawCustomer,
  type RawKyc,
  type RawTxn,
  type RawTxnPage,
} from "./frab-backend";

const CHUNK = 1000; // the API is uncompressed (~420 KB / 1000 rows), so pull in parallel chunks
const CONCURRENCY = 4;

export async function fetchLedgerTotal(): Promise<number> {
  const p = await backendGet<RawTxnPage>("/transactions/all?limit=1");
  return p.total;
}

export async function fetchLedgerRange(offset: number, limit: number): Promise<RawTxn[]> {
  const p = await backendGet<RawTxnPage>(`/transactions/all?limit=${limit}&offset=${offset}`);
  return p.transactions;
}

/** Load the whole ledger in parallel chunks, reporting progress as chunks arrive. */
export async function fetchFullLedger(
  onProgress: (done: number, total: number) => void,
): Promise<RawTxn[]> {
  const total = await fetchLedgerTotal();
  const chunks = Math.max(1, Math.ceil(total / CHUNK));
  const results: RawTxn[][] = new Array<RawTxn[]>(chunks);
  let next = 0;
  let done = 0;
  onProgress(0, chunks);
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= chunks) return;
      results[i] = await fetchLedgerRange(i * CHUNK, CHUNK);
      done += 1;
      onProgress(done, chunks);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks) }, worker));
  return results.flat();
}

/* ------------------------------------------------------------------ specs */

export interface LedgerSpecs {
  transactions: number;
  customers: number;
  volume: number;
  min: number;
  median: number;
  max: number;
  flagged: number;
  byType: { type: string; count: number }[];
  firstEvent: string | null;
  lastEvent: string | null;
}

export interface CustomerAgg {
  id: string;
  accountId: string;
  count: number;
  volume: number;
  flagged: number;
  lastEvent: string;
}

export function summarizeLedger(rows: RawTxn[]): { specs: LedgerSpecs; customers: CustomerAgg[] } {
  const types = new Map<string, number>();
  const cust = new Map<string, CustomerAgg>();
  const amounts: number[] = [];
  let volume = 0;
  let flagged = 0;
  let first: string | null = null;
  let last: string | null = null;

  for (const t of rows) {
    types.set(t.type, (types.get(t.type) ?? 0) + 1);
    amounts.push(t.amount);
    volume += t.amount;
    const isFlag = t.isFlaggedFraud ? 1 : 0;
    flagged += isFlag;
    if (!first || t.event_time < first) first = t.event_time;
    if (!last || t.event_time > last) last = t.event_time;
    const c = cust.get(t.customer_id);
    if (c) {
      c.count += 1;
      c.volume += t.amount;
      c.flagged += isFlag;
      if (t.event_time > c.lastEvent) c.lastEvent = t.event_time;
    } else {
      cust.set(t.customer_id, {
        id: t.customer_id,
        accountId: t.account_id || toAccountId(t.customer_id),
        count: 1,
        volume: t.amount,
        flagged: isFlag,
        lastEvent: t.event_time,
      });
    }
  }
  amounts.sort((a, b) => a - b);
  const specs: LedgerSpecs = {
    transactions: rows.length,
    customers: cust.size,
    volume,
    min: amounts[0] ?? 0,
    median: amounts[Math.floor(amounts.length / 2)] ?? 0,
    max: amounts[amounts.length - 1] ?? 0,
    flagged,
    byType: [...types.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    firstEvent: first,
    lastEvent: last,
  };
  return { specs, customers: [...cust.values()].sort((a, b) => b.volume - a.volume) };
}

/* -------------------------------------------------------- customer detail */

/** Light call used for table rows: name, city, status. */
export function fetchCustomerBasic(id: string): Promise<RawCustomer> {
  return backendGet<RawCustomer>(`/customers/${encodeURIComponent(id)}`);
}

export interface CustomerFull {
  customer: RawCustomer;
  kyc: RawKyc | null;
  account: RawAccount | null;
}

/** Full profile used when a row is expanded. KYC/account failures degrade to null. */
export async function fetchCustomerFull(id: string): Promise<CustomerFull> {
  const [customer, kyc, account] = await Promise.all([
    fetchCustomerBasic(id),
    backendGet<RawKyc>(`/customers/${encodeURIComponent(id)}/kyc`).catch(() => null),
    backendGet<RawAccount>(`/accounts/${encodeURIComponent(toAccountId(id))}`).catch(() => null),
  ]);
  return { customer, kyc, account };
}
