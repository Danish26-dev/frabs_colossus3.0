import LaunchSequence from "./LaunchSequence";
import AccountDrainProtection from "./AccountDrainProtection";
import { ACCOUNT_DRAIN_ALERT_ID } from "../../../lib/demo-account-drain";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ALERT_STATUSES,
  ALERT_TRIGGERS,
  createInvestigation,
  fetchAlertById,
  fetchAlertQueue,
  fetchCustomerContext,
  FEED_MODE,
  inr,
  subscribeToAlerts,
  telemetryOf,
  type AlertRecord,
  type CustomerContext,
} from "../../../lib/frab-alerts";
import { setActiveCase } from "../../../lib/frab-case-state";
import { Dot, EmptyBlock, ErrorBlock, LoadingBlock, Mono, PanelShell } from "../ui";

type Load = "loading" | "ready" | "error";

const RISK_TONE: Record<string, string> = {
  HIGH: "text-critical",
  MEDIUM: "text-warning",
  LOW: "text-lime",
};

const STATUS_TONE: Record<string, string> = {
  NEW: "text-foreground",
  INVESTIGATING: "text-warning",
  INVESTIGATED: "text-muted-foreground",
  REVIEW_REQUIRED: "text-critical",
};

function Select({
  value,
  onChange,
  options,
  allLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  allLabel: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-border bg-surface px-3 py-2 font-mono text-[9px] tracking-[0.18em] text-foreground outline-none transition-colors hover:border-lime/50 focus:border-lime/60"
    >
      <option value="ALL">{allLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function SystemStatus() {
  const live = FEED_MODE === "live";
  const rows: [string, string][] = live
    ? [
        ["BANK FEED", "LIVE"],
        ["RULE ENGINE", "ACTIVE"],
        ["FRAB", "READY"],
        ["TEE", "VERIFIED"],
      ]
    : [
        ["BANK FEED", "SIMULATED"],
        ["RULE ENGINE", "SIMULATED"],
        ["FRAB", "READY"],
        ["TEE", "NOT CONNECTED"],
      ];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 md:grid-cols-1">
      {rows.map(([k, v]) => (
        <span key={k} className="flex items-center justify-between gap-3">
          <Mono className="text-[9px] text-muted-foreground">{k}</Mono>
          <span className="flex items-center gap-2">
            <Dot state={live ? "ok" : v === "READY" ? "ok" : "idle"} />
            <Mono
              className={`text-[9px] ${live || v === "READY" ? "text-foreground" : "text-muted-foreground"}`}
            >
              {v}
            </Mono>
          </span>
        </span>
      ))}
    </div>
  );
}

export default function AlertIntelligence({ preselect }: { preselect?: string | undefined }) {
  const navigate = useNavigate();

  const [load, setLoad] = useState<Load>("loading");
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [newAlertIds, setNewAlertIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<AlertRecord | null>(null);
  const [context, setContext] = useState<CustomerContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  // TEMPORARY PROTECTION (SCN07/CASE0007 only): the account-drain alert opens a
  // dedicated protection popup instead of the normal drawer / investigation.
  const [drainOpen, setDrainOpen] = useState(false);

  const [trigger, setTrigger] = useState("ALL");
  const [risk, setRisk] = useState("ALL");
  const [status, setStatus] = useState("ALL");

  const loadQueue = useCallback(() => {
    setLoad("loading");
    fetchAlertQueue()
      .then((a) => {
        setAlerts(a);
        setLoad("ready");
      })
      .catch(() => setLoad("error"));
  }, []);

  useEffect(loadQueue, [loadQueue]);

  // Highlight a freshly-arrived alert briefly, then clear the marker.
  const flagNew = useCallback((id: string) => {
    setNewAlertIds((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      setNewAlertIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 6000);
  }, []);

  // Live bank: subscribe to the real-time alert stream and push new alerts in.
  useEffect(() => {
    if (FEED_MODE !== "live") return;
    const unsubscribe = subscribeToAlerts((evt) => {
      void fetchAlertById(evt.alert_id).then((row) => {
        if (!row) return;
        setAlerts((prev) => {
          if (prev.some((a) => a.id === row.id)) return prev;
          flagNew(row.id);
          return [row, ...prev];
        });
      });
    });
    return unsubscribe;
  }, [flagNew]);

  // Keep the queue fresh: periodically re-pull so status changes and any alerts
  // added out-of-band surface without a manual refresh.
  useEffect(() => {
    if (FEED_MODE !== "live" || load !== "ready") return;
    const id = window.setInterval(() => {
      void fetchAlertQueue()
        .then((latest) => {
          setAlerts((prev) => {
            const known = new Set(prev.map((a) => a.id));
            const fresh = latest.filter((a) => !known.has(a.id));
            fresh.forEach((a) => flagNew(a.id));
            // Merge: new alerts on top, keep existing order/selection stable.
            return fresh.length ? [...fresh, ...prev] : prev;
          });
        })
        .catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(id);
  }, [load, flagNew]);

  useEffect(() => {
    if (!preselect || !alerts.length) return;
    if (preselect === ACCOUNT_DRAIN_ALERT_ID) {
      setDrainOpen(true);
      return;
    }
    const hit = alerts.find((a) => a.id === preselect);
    if (hit) setSelected(hit);
  }, [preselect, alerts]);

  useEffect(() => {
    if (!selected) {
      setContext(null);
      return;
    }
    let cancelled = false;
    setContextLoading(true);
    fetchCustomerContext(selected.customerId, selected.accountId)
      .then((c) => !cancelled && setContext(c))
      .catch(() => !cancelled && setContext(null))
      .finally(() => !cancelled && setContextLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const filtered = useMemo(
    () =>
      alerts.filter(
        (a) =>
          (trigger === "ALL" || a.trigger === trigger) &&
          (risk === "ALL" || a.risk === risk) &&
          (status === "ALL" || a.status === status),
      ),
    [alerts, trigger, risk, status],
  );

  const telemetry = telemetryOf(alerts);

  // Row click. The account-drain alert (SCN07/CASE0007) is intercepted: it opens
  // the dedicated TEMPORARY PROTECTION popup instead of the normal case drawer.
  const openAlert = (a: AlertRecord) => {
    if (a.id === ACCOUNT_DRAIN_ALERT_ID) {
      setSelected(null);
      setDrainOpen(true);
      return;
    }
    setSelected(a);
  };

  const initialize = async () => {
    if (!selected) return;
    setInitializing(true);
    setInitError(null);
    try {
      const caseId = await createInvestigation(selected);
      setActiveCase({
        caseId,
        alertId: selected.id,
        startedAt: new Date().toISOString(),
        complete: false,
      });
      setLaunching(caseId);
    } catch (e) {
      setInitError(e instanceof Error ? e.message : "INVESTIGATION COULD NOT BE CREATED");
      setInitializing(false);
    }
  };

  return (
    <>
      {drainOpen ? <AccountDrainProtection onClose={() => setDrainOpen(false)} /> : null}
      {launching ? (
        <LaunchSequence
          caseId={launching}
          onDone={() => {
            void navigate({ to: "/investigation/$caseId", params: { caseId: launching } });
          }}
        />
      ) : null}
      {/* header */}
      <header className="border-b border-border px-6 py-6 md:px-10">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <Mono className="text-[9px] text-lime">02 / ALERT INTELLIGENCE</Mono>
            <h1 className="mt-2 text-2xl font-semibold uppercase tracking-[-0.03em] md:text-3xl">
              Alert Intelligence
            </h1>
            <Mono className="mt-3 block text-[9px] text-muted-foreground">
              LIVE ALERT STREAM / SYNTHETIC BANK INVESTIGATION ENVIRONMENT
            </Mono>
          </div>
          <div className="min-w-[220px]">
            <SystemStatus />
            {FEED_MODE === "simulated" ? (
              <Mono className="mt-3 block border border-warning/50 px-2 py-1 text-[9px] text-warning">
                SIMULATED BANK FEED · BACKEND NOT CONNECTED
              </Mono>
            ) : null}
          </div>
        </div>

        {/* telemetry */}
        <div className="mt-7 grid grid-cols-2 divide-border border border-border md:grid-cols-5 md:divide-x">
          {[
            ["TOTAL ALERTS", telemetry.total, ""],
            ["HIGH RISK", telemetry.high, "text-critical"],
            ["MEDIUM RISK", telemetry.medium, "text-warning"],
            ["LOW RISK", telemetry.low, "text-lime"],
            ["INVESTIGATIONS ACTIVE", telemetry.investigationsActive, ""],
          ].map(([label, value, tone]) => (
            <div key={label as string} className="border-b border-border px-4 py-3 md:border-b-0">
              <Mono className="text-[8px] text-muted-foreground">{label as string}</Mono>
              <p className={`mt-1.5 font-mono text-xl ${(tone as string) || "text-foreground"}`}>
                {load === "ready" ? (value as number) : "—"}
              </p>
            </div>
          ))}
        </div>
      </header>

      <div>
        {/* queue */}
        <div>
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3 md:px-10">
            <Mono className="mr-auto text-[10px] text-foreground">ALERT QUEUE</Mono>
            <Select
              value={trigger}
              onChange={setTrigger}
              options={ALERT_TRIGGERS}
              allLabel="ALL TRIGGERS"
            />
            <Select
              value={risk}
              onChange={setRisk}
              options={["HIGH", "MEDIUM", "LOW"]}
              allLabel="ALL RISK"
            />
            <Select
              value={status}
              onChange={setStatus}
              options={ALERT_STATUSES}
              allLabel="ALL STATUS"
            />
          </div>

          {load === "loading" ? <LoadingBlock label="LOADING ALERT STREAM" /> : null}
          {load === "error" ? (
            <ErrorBlock label="ALERT FEED UNAVAILABLE" onRetry={loadQueue} />
          ) : null}
          {load === "ready" && filtered.length === 0 ? (
            <EmptyBlock label="NO ACTIVE ALERTS" />
          ) : null}

          {load === "ready" && filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border">
                    {[
                      "ALERT ID",
                      "TIME",
                      "CUSTOMER",
                      "TRANSACTION",
                      "TRIGGER",
                      "AMOUNT",
                      "RISK",
                      "STATUS",
                      "ACTION",
                    ].map((h) => (
                      <th key={h} className="px-3 py-2.5 first:pl-6 last:pr-6 md:first:pl-10">
                        <Mono className="text-[8px] text-muted-foreground">{h}</Mono>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => {
                    const isDrain = a.id === ACCOUNT_DRAIN_ALERT_ID;
                    return (
                      <tr
                        key={a.id}
                        onClick={() => openAlert(a)}
                        className={`cursor-pointer border-b border-border transition-colors hover:bg-hover ${
                          selected?.id === a.id
                            ? "bg-lime-soft"
                            : isDrain
                              ? "border-l-2 border-l-warning bg-warning/[0.06] hover:bg-warning/10"
                              : newAlertIds.has(a.id)
                                ? "frab-rise bg-lime/10"
                                : ""
                        }`}
                      >
                        <td className="px-3 py-2.5 pl-6 md:pl-10">
                          <span className="flex flex-col gap-1">
                            <Mono className="text-[10px] text-lime">{a.id}</Mono>
                            {isDrain ? (
                              <Mono className="w-fit border border-warning/50 px-1.5 py-0.5 text-[7px] text-warning">
                                ACCOUNT DRAIN · PROTECTION
                              </Mono>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Mono className="text-[10px] text-muted-foreground">{a.time}</Mono>
                        </td>
                        <td className="px-3 py-2.5">
                          <Mono className="text-[10px] text-foreground">{a.customerId}</Mono>
                        </td>
                        <td className="px-3 py-2.5">
                          <Mono className="text-[10px] text-foreground">{a.transactionId}</Mono>
                        </td>
                        <td className="px-3 py-2.5">
                          <Mono className="text-[9px] text-foreground">{a.trigger}</Mono>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Mono className="text-[10px] text-foreground">{inr(a.amount)}</Mono>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`inline-block h-1.5 w-1.5 ${
                                a.risk === "HIGH"
                                  ? "bg-critical"
                                  : a.risk === "MEDIUM"
                                    ? "bg-warning"
                                    : "bg-lime"
                              }`}
                            />
                            <Mono className={`text-[9px] ${RISK_TONE[a.risk]}`}>{a.risk}</Mono>
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Mono className={`text-[9px] ${STATUS_TONE[a.status]}`}>{a.status}</Mono>
                        </td>
                        <td className="px-3 py-2.5 pr-6 md:pr-10">
                          <Mono
                            className={`text-[9px] ${isDrain ? "text-warning" : "text-muted-foreground"}`}
                          >
                            {isDrain ? "[ PROTECT ]" : "[ OPEN ]"}
                          </Mono>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        {/* transaction feed */}
      </div>

      {/* drawer */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-[2px]">
          <button
            aria-label="Close alert detail"
            className="hidden flex-1 cursor-default md:block"
            onClick={() => setSelected(null)}
          />
          <div className="flex h-full w-full flex-col overflow-y-auto border-l border-border bg-surface md:max-w-[460px]">
            <header className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-5 py-3">
              <Mono className="text-[10px] text-lime">CASE PREVIEW</Mono>
              <button
                onClick={() => setSelected(null)}
                className="border border-border px-2 py-1 font-mono text-[9px] tracking-[0.22em] text-muted-foreground hover:text-foreground"
              >
                [ CLOSE ]
              </button>
            </header>

            <dl className="border-b border-border px-5 py-4">
              {(
                [
                  ["ALERT ID", selected.id],
                  ["CUSTOMER ID", selected.customerId],
                  ["ACCOUNT ID", selected.accountId],
                  ["TRANSACTION ID", selected.transactionId],
                  ["TIMESTAMP", selected.time],
                  ["ALERT TYPE", selected.trigger],
                  ["AMOUNT", inr(selected.amount)],
                  ["RISK LEVEL", selected.risk],
                  ["CURRENT STATUS", selected.status],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between gap-4 border-b border-border py-1.5 last:border-b-0"
                >
                  <Mono className="text-[9px] text-muted-foreground">{k}</Mono>
                  <Mono
                    className={`text-[9px] ${
                      k === "RISK LEVEL"
                        ? (RISK_TONE[v] ?? "text-foreground")
                        : k === "CURRENT STATUS"
                          ? (STATUS_TONE[v] ?? "text-foreground")
                          : "text-foreground"
                    }`}
                  >
                    {v}
                  </Mono>
                </div>
              ))}
            </dl>

            <section className="border-b border-border px-5 py-4">
              <Mono className="text-[10px] text-foreground">WHY WAS THIS ALERT GENERATED?</Mono>
              <Mono className="mt-3 block text-[9px] text-lime">{selected.trigger}</Mono>
              <ul className="mt-3 space-y-2">
                {selected.conditions.map((c) => (
                  <li key={c} className="flex gap-2">
                    <Mono className="text-[9px] text-lime">✓</Mono>
                    <span className="text-xs leading-relaxed text-muted-foreground">{c}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="border-b border-border px-5 py-4">
              <Mono className="text-[10px] text-foreground">CUSTOMER CONTEXT</Mono>
              {contextLoading ? (
                <LoadingBlock label="LOADING CUSTOMER CONTEXT" />
              ) : (
                <dl className="mt-3">
                  {[
                    ["CUSTOMER ID", context?.customerId ?? null],
                    ["ACCOUNT", context?.accountId ?? null],
                    ["KYC STATUS", context?.kycStatus ?? null],
                    ["TYPICAL RANGE", context?.typicalRange ?? null],
                    ["RECENT TRANSACTIONS", context?.recentTransactionCount ?? null],
                    ["PREVIOUS ALERTS", context?.previousAlertCount ?? null],
                  ].map(([k, v]) => (
                    <div
                      key={k as string}
                      className="flex items-center justify-between gap-4 border-b border-border py-1.5 last:border-b-0"
                    >
                      <Mono className="text-[9px] text-muted-foreground">{k as string}</Mono>
                      <Mono
                        className={`text-[9px] ${v === null ? "text-muted-foreground" : "text-foreground"}`}
                      >
                        {v === null ? "NOT AVAILABLE" : String(v)}
                      </Mono>
                    </div>
                  ))}
                </dl>
              )}
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                The bank alert is only the beginning. FRAB expands this into a full investigation.
              </p>
            </section>

            <section className="mt-auto border-t border-border px-5 py-5">
              {initError ? (
                <Mono className="mb-3 block border border-critical/60 px-2 py-1 text-[9px] text-critical">
                  {initError.toUpperCase()}
                </Mono>
              ) : null}
              <button
                onClick={() => void initialize()}
                disabled={initializing}
                className="w-full border border-lime/60 bg-lime-soft px-4 py-3 font-mono text-[10px] tracking-[0.22em] text-lime transition-colors hover:bg-lime/20 disabled:opacity-60"
              >
                {initializing ? "[ INITIALIZING INVESTIGATION… ]" : "[ INITIALIZE INVESTIGATION ]"}
              </button>
              <Mono className="mt-4 block text-[9px] text-muted-foreground">
                FRAB WILL INVESTIGATE THIS ALERT USING:
              </Mono>
              <ul className="mt-2 grid grid-cols-2 gap-1">
                {[
                  "Customer history",
                  "Behaviour baseline",
                  "Beneficiary context",
                  "Previous alerts",
                  "Network relationships",
                  "Regulatory context",
                ].map((i) => (
                  <li key={i} className="text-[11px] text-muted-foreground">
                    · {i}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}
