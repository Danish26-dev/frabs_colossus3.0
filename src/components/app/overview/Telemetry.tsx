import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAlerts,
  fetchInvestigationStatus,
  fetchSystemStatus,
  type Alert,
} from "../../../lib/frab-api";
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  Mono,
  PanelShell,
  SourceTag,
  StatusLine,
  stateLabel,
  stateTone,
} from "../ui";

function Counter({ value, label, tone = "" }: { value: string; label: string; tone?: string }) {
  return (
    <div className="border-b border-r border-border px-5 py-6">
      <Mono className={`block text-3xl ${tone || "text-foreground"}`}>{value}</Mono>
      <Mono className="mt-3 block text-[9px] text-muted-foreground">{label}</Mono>
    </div>
  );
}

/* ----------------------------------------------- 05 — ALERT TELEMETRY */

export function AlertTelemetry() {
  const q = useQuery({ queryKey: ["alerts"], queryFn: fetchAlerts });
  const navigate = useNavigate();
  const alerts: Alert[] = q.data?.data ?? [];

  const high = alerts.filter((a) => a.risk === "HIGH").length;
  const medium = alerts.filter((a) => a.risk === "MEDIUM").length;
  const active = alerts.filter((a) => a.status === "IN_INVESTIGATION").length;

  return (
    <section className="border-b border-border px-6 py-14 md:px-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h3 className="text-xl font-semibold uppercase tracking-[-0.02em]">Alert telemetry</h3>
        {q.data ? <SourceTag source={q.data.source} /> : null}
      </div>

      {q.isLoading ? <LoadingBlock label="READING ALERT PIPELINE" /> : null}
      {q.isError ? (
        <ErrorBlock label="ALERT ENDPOINT UNAVAILABLE" onRetry={() => q.refetch()} />
      ) : null}

      {q.data ? (
        <>
          <div className="mt-8 grid grid-cols-2 border-l border-t border-border md:grid-cols-4">
            <Counter value={String(alerts.length)} label="TOTAL ALERTS" />
            <Counter value={String(high)} label="HIGH RISK" tone="text-critical" />
            <Counter value={String(medium)} label="MEDIUM RISK" tone="text-warning" />
            <Counter value={String(active)} label="ACTIVE INVESTIGATIONS" tone="text-lime" />
          </div>

          <PanelShell title="LATEST ALERTS" meta="CLICK TO OPEN 02 / ALERT INTELLIGENCE" className="mt-10">
            {alerts.length === 0 ? (
              <EmptyBlock label="NO ALERTS IN PIPELINE" />
            ) : (
              <ul className="divide-y divide-border/70">
                {alerts.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    <button
                      onClick={() => navigate({ to: "/alerts", search: { alert: a.id } })}
                      className="group grid w-full grid-cols-[90px_1fr_auto] items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-hover"
                    >
                      <Mono className="text-[10px] text-lime">{a.id}</Mono>
                      <span>
                        <Mono className="block text-[10px] text-foreground">{a.type}</Mono>
                        <Mono className="mt-1 block text-[9px] text-muted-foreground">
                          {a.account} · {a.raisedAt}
                        </Mono>
                      </span>
                      <span
                        className={`border px-2 py-0.5 font-mono text-[9px] tracking-[0.2em] ${
                          a.risk === "HIGH"
                            ? "border-critical/50 text-critical"
                            : a.risk === "MEDIUM"
                              ? "border-warning/50 text-warning"
                              : "border-border text-muted-foreground"
                        }`}
                      >
                        {a.risk}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </PanelShell>
        </>
      ) : null}
    </section>
  );
}

/* ------------------------------ 06/07/08 — STATUS, INTEGRITY, ACTIONS */

export function StatusStrip() {
  const inv = useQuery({ queryKey: ["cases-summary"], queryFn: fetchInvestigationStatus });
  const sys = useQuery({ queryKey: ["system-status"], queryFn: fetchSystemStatus });
  const s = sys.data?.data;
  const i = inv.data?.data;

  return (
    <section className="grid gap-8 border-b border-border px-6 py-14 md:px-12 lg:grid-cols-[1.5fr_1fr]">
      <div>
        <h3 className="text-xl font-semibold uppercase tracking-[-0.02em]">
          FRAB investigation status
        </h3>
        {inv.isLoading ? <LoadingBlock label="READING CASE REGISTRY" /> : null}
        {inv.isError ? (
          <ErrorBlock label="CASE REGISTRY UNAVAILABLE" onRetry={() => inv.refetch()} />
        ) : null}
        {i ? (
          <>
            <div className="mt-8 grid grid-cols-2 border-l border-t border-border md:grid-cols-4">
              <Counter value={String(i.newAlerts).padStart(2, "0")} label="NEW ALERTS" tone="text-lime" />
              <Counter value={String(i.investigations).padStart(2, "0")} label="INVESTIGATIONS" />
              <Counter value={String(i.completed).padStart(2, "0")} label="COMPLETED" />
              <Counter value={String(i.requiringAnalyst).padStart(2, "0")} label="REQUIRING ANALYST" />
            </div>

            <PanelShell title="LAST INVESTIGATION" className="mt-8">
              {i.lastCase ? (
                <div className="space-y-2 px-4 py-4">
                  <StatusLine label="CASE" value={i.lastCase.id} />
                  <StatusLine label="STATUS" value={i.lastCase.status} />
                </div>
              ) : (
                <div className="px-4 py-6">
                  <Mono className="block text-[11px] text-muted-foreground">
                    NO ACTIVE INVESTIGATION
                  </Mono>
                  <Mono className="mt-2 block text-[9px] text-muted-foreground">
                    CASE: -- · STATUS: WAITING
                  </Mono>
                </div>
              )}
            </PanelShell>
          </>
        ) : null}

        {/* 08 — quick action */}
        <div className="mt-10 border border-lime/50 bg-lime-soft p-6">
          <Mono className="text-[9px] text-lime">INVESTIGATE NEW ALERT</Mono>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            Take the next unassigned alert from the bank feed into the FRAB agent pipeline.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/alerts"
              className="bg-lime px-5 py-3 font-mono text-[10px] tracking-[0.22em] text-background transition-opacity hover:opacity-85"
            >
              [ OPEN ALERT INTELLIGENCE ]
            </Link>
            {i && i.lastCase ? (
              <Link
                to="/workspace"
                className="border border-border px-5 py-3 font-mono text-[10px] tracking-[0.22em] text-foreground transition-colors hover:border-lime/60 hover:text-lime"
              >
                VIEW INVESTIGATION WORKSPACE
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {/* 07 — system integrity */}
      <PanelShell title="FRAB SYSTEM" meta="INTEGRITY" className="h-fit">
        {sys.isLoading ? <LoadingBlock label="PROBING SERVICES" /> : null}
        {sys.isError ? (
          <ErrorBlock label="SYSTEM STATUS UNAVAILABLE" onRetry={() => sys.refetch()} />
        ) : null}
        {s ? (
          <div className="px-4 py-3">
            <StatusLine label="MAIN BACKEND" value={stateLabel(s.mainBackend)} tone={stateTone(s.mainBackend)} />
            <StatusLine label="BANK FEED" value={stateLabel(s.bankFeed)} tone={stateTone(s.bankFeed)} />
            <StatusLine label="ALERT PIPELINE" value={stateLabel(s.alertPipeline)} tone={stateTone(s.alertPipeline)} />
            <StatusLine
              label="CONFIDENTIAL WORKSPACE"
              value={stateLabel(s.confidentialWorkspace)}
              tone={stateTone(s.confidentialWorkspace)}
            />
            <StatusLine label="TEE ATTESTATION" value={stateLabel(s.teeAttestation)} tone={stateTone(s.teeAttestation)} />
            <StatusLine
              label="ENCRYPTED INFERENCE"
              value={stateLabel(s.encryptedInference)}
              tone={stateTone(s.encryptedInference)}
            />
          </div>
        ) : null}
      </PanelShell>
    </section>
  );
}
