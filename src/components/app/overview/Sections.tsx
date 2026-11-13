import { useQuery } from "@tanstack/react-query";
import { fetchDatasetStats, inr, IS_LIVE_BACKEND } from "../../../lib/frab-api";
import { useLiveTransactionFeed } from "../../../hooks/useLiveTransactionFeed";
import { EmptyBlock, ErrorBlock, LoadingBlock, Mono, PanelShell, SourceTag } from "../ui";

/* ------------------------------------------------ 01 — SYSTEM OVERVIEW */

const FLOW = [
  { title: "SYNTHETIC BANK", sub: "ENVIRONMENT" },
  { title: "TRANSACTION ACTIVITY", sub: "BANK_TX_LEDGER" },
  { title: "RULE ENGINE", sub: "DETECTION" },
  { title: "ALERT", sub: "SUSPICIOUS ACTIVITY" },
  { title: "FRAB INVESTIGATION", sub: "AGENT PIPELINE" },
];

export function SystemOverview() {
  return (
    <section className="border-b border-border px-6 py-10 md:px-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Mono className="text-[9px] text-muted-foreground">SECTION 01</Mono>
          <h2 className="mt-2 text-xl font-semibold uppercase tracking-[-0.02em]">
            Detection pipeline
          </h2>
        </div>
        <Mono className="text-[9px] text-muted-foreground">
          SYNTHETIC BANK → RULE ENGINE → FRAB
        </Mono>
      </div>

      <div className="mt-14 grid gap-0 lg:grid-cols-5">
        {FLOW.map((n, i) => (
          <div key={n.title} className="relative">
            <div
              className={`h-full border p-5 ${
                i === FLOW.length - 1
                  ? "border-lime/60 bg-lime-soft"
                  : i === 0
                    ? "border-border bg-surface"
                    : "border-border bg-surface"
              }`}
            >
              <Mono className="text-[9px] text-muted-foreground">{`0${i + 1}`}</Mono>
              <Mono
                className={`mt-3 block text-[11px] leading-relaxed ${
                  i === FLOW.length - 1 ? "text-lime" : "text-foreground"
                }`}
              >
                {n.title}
              </Mono>
              <Mono className="mt-2 block text-[9px] text-muted-foreground">{n.sub}</Mono>
            </div>
            {i < FLOW.length - 1 ? (
              <span className="pointer-events-none absolute left-1/2 top-full z-10 flex h-8 w-px -translate-x-1/2 overflow-hidden bg-border lg:left-full lg:top-1/2 lg:h-px lg:w-8 lg:-translate-y-1/2 lg:translate-x-0">
                <span className="frab-flow block h-2 w-px bg-lime lg:h-px lg:w-2" />
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------- 02 — BANK DATASET */

export function DatasetSection() {
  const q = useQuery({ queryKey: ["dataset"], queryFn: fetchDatasetStats });

  return (
    <section className="border-b border-border px-6 py-14 md:px-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Mono className="text-[9px] text-muted-foreground">SYNTHETIC BANK</Mono>
          <h3 className="mt-2 text-xl font-semibold uppercase tracking-[-0.02em]">
            Data environment
          </h3>
          <Mono className="mt-2 block text-[9px] text-lime">CURRENT DATASET</Mono>
        </div>
        {q.data ? <SourceTag source={q.data.source} /> : null}
      </div>

      {q.isLoading ? <LoadingBlock label="READING DATASET" /> : null}
      {q.isError ? (
        <ErrorBlock label="DATASET UNAVAILABLE — NO VALUES DISPLAYED" onRetry={() => q.refetch()} />
      ) : null}

      {q.data ? (
        <div className="mt-10 grid grid-cols-2 border-l border-t border-border md:grid-cols-4">
          {q.data.data.map((s) => (
            <div key={s.key} className="border-b border-r border-border px-5 py-6">
              <Mono className="block text-2xl text-foreground md:text-3xl">
                {s.value.toLocaleString("en-IN")}
              </Mono>
              <Mono className="mt-3 block text-[9px] text-lime">{s.label}</Mono>
              <Mono className="mt-1.5 block text-[8px] text-muted-foreground">{s.identifier}</Mono>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------- 03 — BANK ACTIVITY */

export function BankActivity() {
  // Streams the real ledger one transaction at a time (live) or the synthetic
  // generator (demo) — see useLiveTransactionFeed.
  const { rows, status } = useLiveTransactionFeed({ window: 12, intervalMs: 2400 });

  return (
    <section className="border-b border-border px-6 py-14 md:px-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h3 className="text-xl font-semibold uppercase tracking-[-0.02em]">Live bank activity</h3>
        <span className="flex items-center gap-3">
          <SourceTag source={IS_LIVE_BACKEND ? "live" : "demo"} />
          <Mono className="border border-warning/50 px-2 py-0.5 text-[9px] text-warning">
            {IS_LIVE_BACKEND ? "BANK FEED" : "SIMULATED BANK FEED"}
          </Mono>
        </span>
      </div>

      <PanelShell title="BANK_TX_LEDGER / STREAM" meta="LATEST LEDGER EVENTS" className="mt-8">
        {status === "error" ? (
          <EmptyBlock label="TRANSACTION FEED UNAVAILABLE" />
        ) : status === "loading" && rows.length === 0 ? (
          <LoadingBlock label="CONNECTING TO BANK LEDGER" />
        ) : rows.length === 0 ? (
          <EmptyBlock label="NO TRANSACTION EVENTS RECEIVED" />
        ) : (
          <ul className="divide-y divide-border/70">
            {rows.map((t, i) => (
              <li
                key={`${t.id}-${i}`}
                className="frab-rise grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-1 px-4 py-3 font-mono text-[10px] md:grid-cols-[90px_130px_100px_24px_110px_1fr]"
              >
                <span className="text-muted-foreground">{t.time}</span>
                <span className="text-foreground">{t.id}</span>
                <span className="text-muted-foreground">{t.account}</span>
                <span className="hidden text-lime md:inline">→</span>
                <span className="text-muted-foreground">{t.destination}</span>
                <span
                  className={`md:text-right ${t.result !== "NORMAL" ? "text-warning" : "text-foreground"}`}
                >
                  {inr(t.amount)}
                  {t.result !== "NORMAL" ? (
                    <span className="ml-3 text-[9px] text-warning">
                      {t.result === "ALERT" ? "THRESHOLD" : "REVIEW"}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PanelShell>
    </section>
  );
}

/* ---------------------------------------------- 04 — BANK ENVIRONMENT */

const NODES = [
  "CUSTOMERS",
  "ACCOUNTS",
  "KYC",
  "TRANSACTIONS",
  "BENEFICIARIES",
  "MERCHANTS",
  "BEHAVIOR",
];

export function BankEnvironment() {
  return (
    <section className="border-b border-border px-6 py-14 md:px-12">
      <h3 className="text-xl font-semibold uppercase tracking-[-0.02em]">Bank environment</h3>
      <Mono className="mt-2 block text-[9px] text-muted-foreground">
        DATA TOPOLOGY / SYNTHETIC INSTITUTION
      </Mono>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="frab-grid relative border border-border bg-surface p-6">
          <div className="mx-auto mb-8 w-fit border border-lime/60 bg-lime-soft px-6 py-3">
            <Mono className="text-[11px] text-lime">SYNTHETIC BANK</Mono>
          </div>
          <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
            {NODES.map((n) => (
              <div key={n} className="relative bg-background/80 px-3 py-5 text-center">
                <span className="absolute -top-8 left-1/2 hidden h-8 w-px -translate-x-1/2 bg-border md:block" />
                <Mono className="text-[9px] text-foreground">{n}</Mono>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-center gap-0 border border-border bg-surface p-6">
          {["TRANSACTION DATA", "RULE ENGINE", "ALERTS"].map((s, i) => (
            <div key={s}>
              <div
                className={`border px-4 py-4 text-center ${
                  i === 2 ? "border-critical/50 text-critical" : "border-border text-foreground"
                }`}
              >
                <Mono className="text-[10px]">{s}</Mono>
              </div>
              {i < 2 ? (
                <div className="mx-auto my-2 h-6 w-px overflow-hidden bg-border">
                  <span className="frab-flow block h-2 w-px bg-lime" />
                </div>
              ) : null}
            </div>
          ))}
          <Mono className="mt-6 block text-[9px] leading-relaxed text-muted-foreground">
            ALERTS ARE HANDED TO FRAB — THE INVESTIGATION LAYER ABOVE THE BANK.
          </Mono>
        </div>
      </div>
    </section>
  );
}
