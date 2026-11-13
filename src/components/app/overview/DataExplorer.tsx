import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { inr, IS_LIVE_BACKEND } from "../../../lib/frab-api";
import {
  fetchCustomerBasic,
  fetchCustomerFull,
  summarizeLedger,
  type CustomerAgg,
} from "../../../lib/frab-ledger";
import { useLedger } from "../../../hooks/useLedger";
import type { RawTxn } from "../../../lib/frab-backend";
import { EmptyBlock, ErrorBlock, LoadingBlock, Mono, PanelShell, SourceTag } from "../ui";

/**
 * DATA EXPLORER — the whole synthetic bank on one screen.
 * Specs + every transaction + every customer, loaded from the live backend, then kept
 * current: the ledger is re-checked every few seconds and new rows are appended.
 */

const PAGE = 25;
const input =
  "border border-border bg-background px-3 py-2 font-mono text-[10px] tracking-[0.12em] text-foreground placeholder:text-muted-foreground focus:border-lime/60 focus:outline-none";

const when = (iso: string) => iso.replace("T", " ").slice(0, 16);
const clock = (d: Date) => d.toTimeString().slice(0, 8);

function Pager({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const btn =
    "border border-border px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] text-foreground transition-colors hover:border-lime/60 hover:text-lime disabled:opacity-35 disabled:hover:border-border disabled:hover:text-foreground";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <Mono className="text-[9px] text-muted-foreground">
        {total.toLocaleString("en-IN")} ROWS · PAGE {page + 1} / {Math.max(1, pages)}
      </Mono>
      <div className="flex gap-2">
        <button className={btn} disabled={page === 0} onClick={() => onPage(0)} aria-label="First page">
          «
        </button>
        <button className={btn} disabled={page === 0} onClick={() => onPage(page - 1)}>
          PREV
        </button>
        <button className={btn} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
          NEXT
        </button>
        <button className={btn} disabled={page >= pages - 1} onClick={() => onPage(pages - 1)} aria-label="Last page">
          »
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- spec tiles */

function Specs({ rows }: { rows: RawTxn[] }) {
  const { specs } = useMemo(() => summarizeLedger(rows), [rows]);
  const tiles: { label: string; value: string; sub?: string }[] = [
    { label: "TRANSACTIONS", value: specs.transactions.toLocaleString("en-IN"), sub: "BANK_TX_LEDGER" },
    { label: "CUSTOMERS", value: specs.customers.toLocaleString("en-IN"), sub: "DISTINCT IN LEDGER" },
    { label: "TOTAL VOLUME", value: inr(Math.round(specs.volume)), sub: "SUM OF AMOUNTS" },
    { label: "MEDIAN AMOUNT", value: inr(Math.round(specs.median)), sub: `MIN ${inr(Math.round(specs.min))}` },
    { label: "LARGEST TRANSACTION", value: inr(Math.round(specs.max)) },
    { label: "FLAGGED BY RULES", value: specs.flagged.toLocaleString("en-IN"), sub: "isFlaggedFraud" },
    { label: "FIRST EVENT", value: specs.firstEvent ? when(specs.firstEvent).slice(0, 10) : "—" },
    { label: "LATEST EVENT", value: specs.lastEvent ? when(specs.lastEvent).slice(0, 10) : "—" },
  ];
  const max = Math.max(1, ...specs.byType.map((t) => t.count));
  return (
    <>
      <div className="mt-8 grid grid-cols-2 border-l border-t border-border md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="border-b border-r border-border px-5 py-5">
            <Mono className="block text-lg text-foreground md:text-xl">{t.value}</Mono>
            <Mono className="mt-2.5 block text-[9px] text-lime">{t.label}</Mono>
            {t.sub ? <Mono className="mt-1 block text-[8px] text-muted-foreground">{t.sub}</Mono> : null}
          </div>
        ))}
      </div>
      <div className="mt-6 border border-border bg-surface/50 px-5 py-4">
        <Mono className="text-[9px] text-muted-foreground">TRANSACTIONS BY TYPE</Mono>
        <ul className="mt-3 space-y-2">
          {specs.byType.map((t) => (
            <li key={t.type} className="grid grid-cols-[110px_1fr_auto] items-center gap-3">
              <Mono className="text-[10px] text-foreground">{t.type}</Mono>
              <span className="h-1.5 bg-border">
                <span className="block h-1.5 bg-lime" style={{ width: `${(t.count / max) * 100}%` }} />
              </span>
              <Mono className="text-[10px] text-muted-foreground">
                {t.count.toLocaleString("en-IN")} · {((t.count / Math.max(1, specs.transactions)) * 100).toFixed(1)}%
              </Mono>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/* ------------------------------------------------------ transactions tab */

function TransactionsTab({ rows }: { rows: RawTxn[] }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("ALL");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [page, setPage] = useState(0);

  const types = useMemo(() => ["ALL", ...new Set(rows.map((r) => r.type))], [rows]);
  const sorted = useMemo(() => [...rows].sort((a, b) => (a.event_time < b.event_time ? 1 : -1)), [rows]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sorted.filter(
      (r) =>
        (type === "ALL" || r.type === type) &&
        (!flaggedOnly || r.isFlaggedFraud) &&
        (!needle ||
          r.transaction_id.toLowerCase().includes(needle) ||
          r.customer_id.toLowerCase().includes(needle) ||
          r.nameDest.toLowerCase().includes(needle)),
    );
  }, [sorted, q, type, flaggedOnly]);

  useEffect(() => setPage(0), [q, type, flaggedOnly]);
  const pages = Math.ceil(filtered.length / PAGE);
  const slice = filtered.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <PanelShell title="BANK_TX_LEDGER / ALL TRANSACTIONS" meta="NEWEST FIRST" className="mt-4">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <input
          className={`${input} w-full sm:w-72`}
          placeholder="SEARCH TXN / CUSTOMER / DESTINATION"
          aria-label="Search transactions"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className={input} value={type} aria-label="Filter by type" onChange={(e) => setType(e.target.value)}>
          {types.map((t) => (
            <option key={t} value={t}>
              {t === "ALL" ? "ALL TYPES" : t}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
          FLAGGED ONLY
        </label>
      </div>
      {slice.length === 0 ? (
        <EmptyBlock label="NO TRANSACTIONS MATCH THESE FILTERS" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse font-mono text-[10px]">
            <thead>
              <tr className="border-b border-border text-left text-[9px] tracking-[0.2em] text-muted-foreground">
                {["TIME", "TXN ID", "CUSTOMER", "TYPE", "AMOUNT", "DESTINATION", ""].map((h, i) => (
                  <th key={i} className={`px-4 py-2.5 font-normal ${h === "AMOUNT" ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((r) => (
                <tr key={r.transaction_id} className="border-b border-border/60">
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{when(r.event_time)}</td>
                  <td className="px-4 py-2.5 text-foreground">{r.transaction_id}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.customer_id}</td>
                  <td className="px-4 py-2.5 text-foreground/80">{r.type}</td>
                  <td className="px-4 py-2.5 text-right text-foreground">{inr(r.amount)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.nameDest}</td>
                  <td className="px-4 py-2.5 text-right">
                    {r.isFlaggedFraud ? <span className="text-warning">FLAGGED</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pages={pages} total={filtered.length} onPage={setPage} />
    </PanelShell>
  );
}

/* ---------------------------------------------------------- customers tab */

function CustomerDetail({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["customer-full", id], queryFn: () => fetchCustomerFull(id), staleTime: Infinity });
  if (q.isLoading) return <LoadingBlock label="READING CUSTOMER PROFILE" />;
  if (q.isError || !q.data) return <ErrorBlock label="PROFILE UNAVAILABLE" onRetry={() => q.refetch()} />;
  const { customer, kyc, account } = q.data;
  const cell = (k: string, v: string | number | boolean | null | undefined) => (
    <div>
      <Mono className="block text-[8px] text-muted-foreground">{k}</Mono>
      <span className="mt-1 block font-mono text-[11px] text-foreground">{v === null || v === undefined || v === "" ? "—" : String(v)}</span>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 bg-surface/60 px-4 py-5 md:grid-cols-4">
      {cell("NAME", customer.customer_name)}
      {cell("CITY", customer.city)}
      {cell("STATUS", customer.status)}
      {cell("ACCOUNT", account?.account_id)}
      {cell("ACCOUNT TYPE", account?.account_type)}
      {cell("BALANCE", account ? inr(account.current_balance) : null)}
      {cell("OPENED", account?.opening_date)}
      {cell("KYC STATUS", kyc?.kyc_status)}
      {cell("RISK CATEGORY", kyc?.risk_category)}
      {cell("OCCUPATION", kyc?.occupation)}
      {cell("INCOME BAND", kyc?.annual_income_band)}
      {cell("PEP", kyc ? (kyc.pep_status ? "YES" : "NO") : null)}
    </div>
  );
}

function CustomersTab({ customers }: { customers: CustomerAgg[] }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? customers.filter((c) => c.id.toLowerCase().includes(needle)) : customers;
  }, [customers, q]);
  useEffect(() => setPage(0), [q]);

  const pages = Math.ceil(filtered.length / PAGE);
  const slice = filtered.slice(page * PAGE, page * PAGE + PAGE);
  // names/cities for the rows on screen (one small request each, cached for the session)
  const basics = useQueries({
    queries: slice.map((c) => ({
      queryKey: ["customer-basic", c.id],
      queryFn: () => fetchCustomerBasic(c.id),
      staleTime: Infinity,
      retry: 1,
    })),
  });

  return (
    <PanelShell title="CUSTOMER_MASTER / ALL CUSTOMERS" meta="BY TRANSACTION VOLUME" className="mt-4">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <input
          className={`${input} w-full sm:w-72`}
          placeholder="SEARCH CUSTOMER ID"
          aria-label="Search customers"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Mono className="text-[9px] text-muted-foreground">SELECT A ROW FOR THE FULL PROFILE (KYC + ACCOUNT)</Mono>
      </div>
      {slice.length === 0 ? (
        <EmptyBlock label="NO CUSTOMERS MATCH" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse font-mono text-[10px]">
            <thead>
              <tr className="border-b border-border text-left text-[9px] tracking-[0.2em] text-muted-foreground">
                {["CUSTOMER", "NAME", "CITY", "TXNS", "VOLUME", "FLAGGED", "LAST ACTIVITY"].map((h) => (
                  <th key={h} className={`px-4 py-2.5 font-normal ${["TXNS", "VOLUME", "FLAGGED"].includes(h) ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((c, i) => {
                const b = basics[i]?.data;
                const isOpen = open === c.id;
                return (
                  <FragmentRow key={c.id}>
                    <tr
                      className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-hover ${isOpen ? "bg-hover" : ""}`}
                      onClick={() => setOpen(isOpen ? null : c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpen(isOpen ? null : c.id);
                        }
                      }}
                      tabIndex={0}
                      aria-expanded={isOpen}
                    >
                      <td className="px-4 py-2.5 text-lime">{c.id}</td>
                      <td className="px-4 py-2.5 text-foreground">{b?.customer_name ?? (basics[i]?.isError ? "—" : "…")}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{b?.city ?? ""}</td>
                      <td className="px-4 py-2.5 text-right text-foreground">{c.count}</td>
                      <td className="px-4 py-2.5 text-right text-foreground">{inr(Math.round(c.volume))}</td>
                      <td className={`px-4 py-2.5 text-right ${c.flagged ? "text-warning" : "text-muted-foreground"}`}>{c.flagged}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{when(c.lastEvent)}</td>
                    </tr>
                    {isOpen ? (
                      // desktop: inline under the row. (On small screens the table scrolls sideways,
                      // so the profile is shown below the table instead — see after </table>.)
                      <tr className="hidden border-b border-border/60 md:table-row">
                        <td colSpan={7} className="p-0">
                          <CustomerDetail id={c.id} />
                        </td>
                      </tr>
                    ) : null}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && slice.some((c) => c.id === open) ? (
        <div className="border-t border-lime/40 md:hidden">
          <div className="flex items-center justify-between px-4 pt-3">
            <Mono className="text-[9px] text-lime">PROFILE · {open}</Mono>
            <button
              className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground hover:text-lime"
              onClick={() => setOpen(null)}
            >
              CLOSE
            </button>
          </div>
          <CustomerDetail id={open} />
        </div>
      ) : null}
      <Pager page={page} pages={pages} total={filtered.length} onPage={setPage} />
    </PanelShell>
  );
}

// tbody children must be <tr>s; a keyed fragment lets us return two rows per customer
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/* ------------------------------------------------------------- the panel */

export function DataExplorer() {
  const { rows, status, progress, lastChecked, added, error, reload, pollSeconds } = useLedger();
  const [tab, setTab] = useState<"transactions" | "customers">("transactions");
  const customers = useMemo(() => (rows.length ? summarizeLedger(rows).customers : []), [rows]);

  const tabBtn = (active: boolean) =>
    `border px-4 py-2.5 font-mono text-[10px] tracking-[0.22em] transition-colors ${
      active ? "border-lime bg-lime/10 text-lime" : "border-border text-muted-foreground hover:border-lime/40 hover:text-foreground"
    }`;

  return (
    <section id="data-explorer" className="border-b border-border px-6 py-14 md:px-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Mono className="text-[9px] text-muted-foreground">SYNTHETIC BANK</Mono>
          <h3 className="mt-2 text-xl font-semibold uppercase tracking-[-0.02em]">Data explorer</h3>
          <Mono className="mt-2 block text-[9px] text-lime">EVERY CUSTOMER · EVERY TRANSACTION · LIVE FROM THE BANK API</Mono>
        </div>
        <div className="flex flex-col items-end gap-2">
          <SourceTag source={IS_LIVE_BACKEND ? "live" : "demo"} />
          {status === "ready" ? (
            <Mono className="flex items-center gap-2 text-[9px] text-muted-foreground">
              <span className="frab-dot inline-block h-1.5 w-1.5 rounded-full bg-lime" />
              FOLLOWING · CHECKS EVERY {pollSeconds}s{lastChecked ? ` · LAST ${clock(lastChecked)}` : ""}
              {added > 0 ? <span className="text-lime">· +{added} NEW</span> : null}
            </Mono>
          ) : null}
        </div>
      </div>

      {status === "off" ? (
        <EmptyBlock label="NO BACKEND CONFIGURED — SET VITE_FRAB_API_URL TO LOAD THE DATASET" />
      ) : status === "error" ? (
        <ErrorBlock label={`LEDGER UNAVAILABLE — ${error ?? "REQUEST FAILED"}`} onRetry={reload} />
      ) : status === "loading" ? (
        <div className="mt-8 border border-border bg-surface/50 px-5 py-6">
          <LoadingBlock label="LOADING THE FULL LEDGER FROM THE BANK API" />
          <div className="mx-4 h-1 bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total || 1} aria-valuenow={progress.done}>
            <div
              className="h-1 bg-lime transition-[width] duration-300"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 4}%` }}
            />
          </div>
          <Mono className="mx-4 mt-3 block text-[9px] text-muted-foreground">
            {progress.total ? `CHUNK ${progress.done} / ${progress.total} · ~4 MB, LOADED ONCE PER SESSION` : "CONTACTING BANK API"}
          </Mono>
        </div>
      ) : (
        <>
          <Specs rows={rows} />
          <div role="tablist" aria-label="Dataset view" className="mt-10 flex gap-2">
            <button role="tab" aria-selected={tab === "transactions"} className={tabBtn(tab === "transactions")} onClick={() => setTab("transactions")}>
              TRANSACTIONS · {rows.length.toLocaleString("en-IN")}
            </button>
            <button role="tab" aria-selected={tab === "customers"} className={tabBtn(tab === "customers")} onClick={() => setTab("customers")}>
              CUSTOMERS · {customers.length.toLocaleString("en-IN")}
            </button>
          </div>
          {tab === "transactions" ? <TransactionsTab rows={rows} /> : <CustomersTab customers={customers} />}
        </>
      )}
    </section>
  );
}
