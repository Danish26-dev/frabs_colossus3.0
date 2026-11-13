import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchAnalyticsSnapshot,
  fetchSystemHealth,
  fetchTransactionTrends,
  type AgentOp,
  type Availability,
  type Distribution,
  type Granularity,
  type HealthEntry,
  type InvestigationAnalytics,
  type OutcomeAnalytics,
  type ScenarioRow,
  type ScenarioValidation,
} from "../../../lib/frab-analytics";
import { EmptyBlock, ErrorBlock, LoadingBlock, Mono, PanelShell, SourceTag } from "../ui";

const C = {
  lime: "#C7F000",
  green: "#7DFF4D",
  critical: "#FF4A42",
  amber: "#FFB020",
  border: "#3A4036",
  muted: "#9FA69A",
  surface: "#242821",
  bone: "#F1F0E8",
};

/** Colour for an outcome label, reused across charts. */
function outcomeColor(o: string): string {
  if (o === "ESCALATE" || o === "BLOCK") return C.critical;
  if (o === "MONITOR") return C.amber;
  if (o === "CLOSE") return C.lime;
  return C.muted;
}

/* ----------------------------------------------------------- primitives */

/** Honest state chip used wherever a metric can't be a plain number. */
function StateChip({ state }: { state: Availability }) {
  const label =
    state === "INSUFFICIENT_SAMPLE"
      ? "INSUFFICIENT SAMPLE"
      : state === "NOT_CONNECTED"
        ? "NOT CONNECTED"
        : state === "UNAVAILABLE"
          ? "DATA UNAVAILABLE"
          : "OK";
  return (
    <Mono className="border border-warning/50 px-2 py-0.5 text-[8px] text-warning">{label}</Mono>
  );
}

function riskTone(risk: string) {
  return risk === "HIGH" ? "text-critical" : risk === "MEDIUM" ? "text-warning" : "text-lime";
}

function outcomeTone(o: string) {
  if (o === "ESCALATE" || o === "BLOCK") return "text-critical";
  if (o === "MONITOR") return "text-warning";
  if (o === "CLOSE") return "text-lime";
  return "text-muted-foreground";
}

/** A clickable top-level metric tile. */
function Metric({
  value,
  label,
  tone = "",
  onClick,
}: {
  value: string | number;
  label: string;
  tone?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <Mono className={`block text-2xl md:text-3xl ${tone || "text-foreground"}`}>{value}</Mono>
      <Mono className="mt-2.5 block text-[8px] text-muted-foreground">{label}</Mono>
    </>
  );
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="border-b border-r border-border px-5 py-6 text-left transition-colors hover:bg-hover"
      >
        {inner}
      </button>
    );
  }
  return <div className="border-b border-r border-border px-5 py-6">{inner}</div>;
}

/** Horizontal bar row for a distribution, optionally clickable. */
function BarRow({
  label,
  count,
  total,
  tone = "bg-lime",
  onClick,
}: {
  label: string;
  count: number;
  total: number;
  tone?: string;
  onClick?: () => void;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <Mono className="text-[9px] text-foreground">{label}</Mono>
        <Mono className="text-[9px] text-muted-foreground">
          {count} · {pct}%
        </Mono>
      </div>
      <div className="mt-1.5 h-1 w-full bg-border">
        <div className={`h-1 ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </>
  );
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-hover"
      >
        {body}
      </button>
    );
  }
  return <div className="px-4 py-2.5">{body}</div>;
}

/* --------------------------------------------------------- main section */

export function AnalyticsOverview() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["analytics-snapshot"], queryFn: fetchAnalyticsSnapshot });
  const health = useQuery({ queryKey: ["system-health"], queryFn: fetchSystemHealth });

  const goAlerts = () => void navigate({ to: "/alerts" });
  const goCase = (caseId: string) => void navigate({ to: "/case/$caseId", params: { caseId } });

  return (
    <>
      {/* ── header ────────────────────────────────────────────────── */}
      <section className="border-b border-border px-6 py-10 md:px-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Mono className="text-[9px] text-lime">01 / FRAB INTELLIGENCE</Mono>
            <h2 className="mt-2 text-xl font-semibold uppercase tracking-[-0.02em]">
              Financial-crime intelligence overview
            </h2>
            <Mono className="mt-2 block text-[8px] text-muted-foreground">
              EVERY METRIC BELOW IS DERIVED FROM LIVE BACKEND DATA · NO FABRICATED STATISTICS
            </Mono>
          </div>
          {q.data ? <SourceTag source={q.data.source} /> : null}
        </div>

        {q.isLoading ? <LoadingBlock label="AGGREGATING BACKEND INTELLIGENCE" /> : null}
        {q.isError ? (
          <ErrorBlock label="ANALYTICS DATA UNAVAILABLE" onRetry={() => q.refetch()} />
        ) : null}

        {/* ── top-level operational metrics ───────────────────────── */}
        {q.data ? (
          <div className="mt-8 grid grid-cols-2 border-l border-t border-border md:grid-cols-4">
            <Metric value={q.data.alerts.total} label="ALERTS RECEIVED" onClick={goAlerts} />
            <Metric value={q.data.investigations.started} label="INVESTIGATIONS STARTED" />
            <Metric value={q.data.investigations.completed} label="COMPLETED" tone="text-lime" />
            <Metric
              value={q.data.investigations.running}
              label="CURRENTLY RUNNING"
              tone="text-warning"
            />
            <Metric
              value={q.data.alerts.byRisk.high}
              label="HIGH RISK"
              tone="text-critical"
              onClick={goAlerts}
            />
            <Metric value={q.data.alerts.byRisk.medium} label="MEDIUM RISK" tone="text-warning" />
            <Metric value={q.data.alerts.byRisk.low} label="LOW RISK" tone="text-lime" />
            <Metric
              value={q.data.investigations.humanReviewRequired}
              label="HUMAN REVIEW REQUIRED"
            />
          </div>
        ) : null}
      </section>

      {/* ── investigation outcomes ──────────────────────────────────── */}
      {q.data ? (
        <section className="border-b border-border px-6 py-12 md:px-12">
          <div className="grid gap-8 lg:grid-cols-2">
            <PanelShell title="INVESTIGATION OUTCOMES" meta="FRAB RECOMMENDATION · SOURCE: /cases">
              {q.data.outcomes.recommendations.length === 0 ? (
                <EmptyBlock label="NO INVESTIGATION OUTCOMES RECORDED" />
              ) : (
                <div className="divide-y divide-border/60">
                  {q.data.outcomes.recommendations.map((d) => (
                    <BarRow
                      key={d.key}
                      label={d.key}
                      count={d.count}
                      total={q.data.outcomes.total}
                      tone={
                        d.key === "ESCALATE" || d.key === "BLOCK"
                          ? "bg-critical"
                          : d.key === "MONITOR"
                            ? "bg-warning"
                            : d.key === "CLOSE"
                              ? "bg-lime"
                              : "bg-muted-foreground"
                      }
                    />
                  ))}
                </div>
              )}
              <div className="border-t border-border px-4 py-2">
                <Mono className="text-[8px] text-muted-foreground">
                  FRAB RECOMMENDATION — DISTINCT FROM HUMAN ANALYST DECISION
                </Mono>
              </div>
            </PanelShell>

            <PanelShell title="ALERT TYPES" meta="SOURCE: /alerts">
              {q.data.alerts.byType.length === 0 ? (
                <EmptyBlock label="NO ALERTS" />
              ) : (
                <div className="divide-y divide-border/60">
                  {q.data.alerts.byType.map((d: Distribution) => (
                    <BarRow
                      key={d.key}
                      label={d.key}
                      count={d.count}
                      total={q.data.alerts.total}
                      onClick={goAlerts}
                    />
                  ))}
                </div>
              )}
            </PanelShell>
          </div>
        </section>
      ) : null}

      {/* ── case + agent charts (from real snapshot data) ───────────── */}
      {q.data ? (
        <section className="border-b border-border px-6 py-12 md:px-12">
          <h3 className="text-lg font-semibold uppercase tracking-[-0.02em]">
            Case &amp; agent analytics
          </h3>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <OutcomeDonut outcomes={q.data.outcomes} />
            <ResolutionChart investigations={q.data.investigations} />
            <ScenarioMatchChart scenarios={q.data.scenarios} />
          </div>
          <div className="mt-6">
            <AgentOpsChart agents={q.data.agents} />
          </div>
        </section>
      ) : null}

      {/* ── transaction & alert trends over time ────────────────────── */}
      <TransactionTrends />

      {/* ── investigation pipeline ──────────────────────────────────── */}
      <PipelineSection />

      {/* ── agent operations ────────────────────────────────────────── */}
      {q.data ? (
        <section className="border-b border-border px-6 py-12 md:px-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h3 className="text-lg font-semibold uppercase tracking-[-0.02em]">Agent operations</h3>
            {q.data.agents.state !== "OK" ? (
              <StateChip state={q.data.agents.state} />
            ) : (
              <Mono className="text-[8px] text-muted-foreground">
                SOURCE: WORKER /investigate RESULTS
              </Mono>
            )}
          </div>

          {q.data.agents.state === "NOT_CONNECTED" ? (
            <div className="mt-6 border border-border bg-surface px-4 py-6">
              <Mono className="text-[9px] text-muted-foreground">
                INVESTIGATION WORKER NOT CONNECTED — PER-AGENT OPERATIONS UNAVAILABLE
              </Mono>
            </div>
          ) : q.data.agents.state === "INSUFFICIENT_SAMPLE" ? (
            <div className="mt-6 border border-border bg-surface px-4 py-6">
              <Mono className="block text-[9px] text-warning">INSUFFICIENT SAMPLE</Mono>
              <Mono className="mt-2 block text-[8px] text-muted-foreground">
                NO INVESTIGATIONS ARE CURRENTLY RESIDENT ON THE WORKER. RUN A CASE FROM ALERT
                INTELLIGENCE TO POPULATE AGENT OPERATIONS.
              </Mono>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-px border border-border bg-border md:grid-cols-5">
              {q.data.agents.rows.map((a) => (
                <div key={a.agent} className="bg-surface px-4 py-4">
                  <Mono className="block text-[10px] text-lime">{a.agent}</Mono>
                  <Mono className="mt-3 block text-xl text-foreground">{a.executions}</Mono>
                  <Mono className="block text-[8px] text-muted-foreground">EXECUTIONS</Mono>
                  <Mono className="mt-2 block text-[9px] text-foreground">
                    {a.completed} COMPLETED
                  </Mono>
                  {a.failed > 0 ? (
                    <Mono className="mt-1 block text-[9px] text-critical">{a.failed} FAILED</Mono>
                  ) : null}
                  {a.detail ? (
                    <Mono className="mt-2 block text-[8px] text-technical">{a.detail}</Mono>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* ── investigation performance / latency ─────────────────────── */}
      <section className="border-b border-border px-6 py-12 md:px-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h3 className="text-lg font-semibold uppercase tracking-[-0.02em]">
            Investigation performance
          </h3>
          <StateChip state="INSUFFICIENT_SAMPLE" />
        </div>
        <div className="mt-6 border border-border bg-surface px-4 py-6">
          <Mono className="block text-[9px] text-warning">
            PER-STAGE LATENCY: INSUFFICIENT SAMPLE
          </Mono>
          <Mono className="mt-2 block text-[8px] leading-relaxed text-muted-foreground">
            THE WORKER RECORDS INVESTIGATION EVENTS AS A SINGLE TIMESTAMP BURST, SO PER-STAGE
            DURATION CANNOT BE MEASURED FROM THE CURRENT DATA. END-TO-END WALL-CLOCK (≈15–25s ON THE
            L4 / GEMMA-2-2B) IS OBSERVED CLIENT-SIDE DURING A LIVE RUN BUT IS NOT AGGREGATED HERE TO
            AVOID REPORTING AN UNMEASURED NUMBER.
          </Mono>
        </div>
      </section>

      {/* ── controlled scenario validation ──────────────────────────── */}
      {q.data ? (
        <ScenarioValidationSection scenarios={q.data.scenarios} onOpenCase={goCase} />
      ) : null}

      {/* ── system health ───────────────────────────────────────────── */}
      <section className="border-b border-border px-6 py-12 md:px-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h3 className="text-lg font-semibold uppercase tracking-[-0.02em]">System health</h3>
          <Mono className="text-[8px] text-muted-foreground">SOURCE: LIVE /health PROBES</Mono>
        </div>
        {health.isLoading ? <LoadingBlock label="PROBING SERVICES" /> : null}
        {health.data ? (
          <div className="mt-6 grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {health.data.map((h: HealthEntry) => (
              <div
                key={h.label}
                className="flex items-center justify-between gap-3 bg-surface px-4 py-3"
              >
                <span className="min-w-0">
                  <Mono className="block truncate text-[9px] text-foreground">{h.label}</Mono>
                  {h.detail ? (
                    <Mono className="mt-1 block truncate text-[8px] text-muted-foreground">
                      {h.detail}
                    </Mono>
                  ) : null}
                </span>
                <Mono
                  className={`shrink-0 border px-2 py-0.5 text-[8px] ${
                    h.state === "CONNECTED"
                      ? "border-lime/50 text-lime"
                      : h.state === "DEGRADED"
                        ? "border-warning/50 text-warning"
                        : h.state === "UNKNOWN"
                          ? "border-border text-muted-foreground"
                          : "border-critical/40 text-critical"
                  }`}
                >
                  {h.state.replace("_", " ")}
                </Mono>
              </div>
            ))}
          </div>
        ) : null}

        {/* confidential compute block */}
        <div className="mt-8 border border-border bg-surface px-5 py-5">
          <Mono className="text-[9px] text-lime">CONFIDENTIAL COMPUTE</Mono>
          <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-technical">
            Sensitive investigation processing runs inside the confidential worker. Deterministic
            tools calculate measurable features and scores; Gemma reasons over the evidence and
            produces the explanation.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3">
            {[
              ["ENVIRONMENT", "Google Cloud Confidential VM"],
              ["COMPUTE", "8 vCPU · 32 GB RAM"],
              ["ACCELERATOR", "NVIDIA L4 · 24 GB VRAM"],
              ["REGION", "us-central1-a"],
              ["MODEL", "Gemma-2-2B (vLLM)"],
              ["ROLE", "Reasoning / explanation"],
            ].map(([k, v]) => (
              <div key={k}>
                <Mono className="block text-[8px] text-muted-foreground">{k}</Mono>
                <Mono className="mt-1 block text-[9px] text-foreground">{v}</Mono>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------- scenario validation */

function ScenarioValidationSection({
  scenarios,
  onOpenCase,
}: {
  scenarios: {
    rows: ScenarioRow[];
    evaluated: number;
    matched: number;
    mismatched: number;
    unresolved: number;
    state: Availability;
  };
  onOpenCase: (caseId: string) => void;
}) {
  const matchPct =
    scenarios.evaluated > 0 ? Math.round((scenarios.matched / scenarios.evaluated) * 100) : 0;

  return (
    <section className="border-b border-border px-6 py-12 md:px-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold uppercase tracking-[-0.02em]">
            Controlled scenario validation
          </h3>
          <Mono className="mt-2 block text-[8px] text-muted-foreground">
            EXPECTED VS ACTUAL OUTCOME ON KNOWN SCENARIOS · NOT PRODUCTION ACCURACY
          </Mono>
        </div>
        {scenarios.state !== "OK" ? <StateChip state={scenarios.state} /> : null}
      </div>

      {scenarios.state !== "OK" || scenarios.evaluated === 0 ? (
        <div className="mt-6 border border-border bg-surface px-4 py-6">
          <Mono className="text-[9px] text-muted-foreground">
            SCENARIO VALIDATION DATA UNAVAILABLE
          </Mono>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 border-l border-t border-border md:grid-cols-4">
            <div className="border-b border-r border-border px-5 py-5">
              <Mono className="block text-2xl text-foreground">{scenarios.evaluated}</Mono>
              <Mono className="mt-2 block text-[8px] text-muted-foreground">
                SCENARIOS EVALUATED
              </Mono>
            </div>
            <div className="border-b border-r border-border px-5 py-5">
              <Mono className="block text-2xl text-lime">{scenarios.matched}</Mono>
              <Mono className="mt-2 block text-[8px] text-muted-foreground">MATCHED OUTCOMES</Mono>
            </div>
            <div className="border-b border-r border-border px-5 py-5">
              <Mono
                className={`block text-2xl ${scenarios.mismatched ? "text-critical" : "text-foreground"}`}
              >
                {scenarios.mismatched}
              </Mono>
              <Mono className="mt-2 block text-[8px] text-muted-foreground">MISMATCHED</Mono>
            </div>
            <div className="border-b border-r border-border px-5 py-5">
              <Mono className="block text-2xl text-foreground">{matchPct}%</Mono>
              <Mono className="mt-2 block text-[8px] text-muted-foreground">OUTCOME MATCH</Mono>
            </div>
          </div>

          <PanelShell title="SCENARIO MATRIX" meta="CLICK A ROW TO OPEN THE CASE" className="mt-8">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border">
                    {["SCENARIO", "CASE", "TRIGGER", "EXPECTED", "ACTUAL", "MATCH", "RISK"].map(
                      (h) => (
                        <th key={h} className="px-3 py-2.5 first:pl-4 last:pr-4">
                          <Mono className="text-[8px] text-muted-foreground">{h}</Mono>
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {scenarios.rows.map((r) => (
                    <tr
                      key={r.caseId}
                      onClick={() => onOpenCase(r.caseId)}
                      className="cursor-pointer border-b border-border transition-colors hover:bg-hover"
                    >
                      <td className="px-3 py-2.5 pl-4">
                        <Mono className="text-[9px] text-technical">{r.scenarioId ?? "—"}</Mono>
                      </td>
                      <td className="px-3 py-2.5">
                        <Mono className="text-[9px] text-lime">{r.caseId}</Mono>
                      </td>
                      <td className="px-3 py-2.5">
                        <Mono className="text-[9px] text-foreground">{r.trigger}</Mono>
                      </td>
                      <td className="px-3 py-2.5">
                        <Mono className={`text-[9px] ${outcomeTone(r.expected)}`}>
                          {r.expected}
                        </Mono>
                      </td>
                      <td className="px-3 py-2.5">
                        <Mono className={`text-[9px] ${outcomeTone(r.actual)}`}>{r.actual}</Mono>
                      </td>
                      <td className="px-3 py-2.5">
                        {r.match === null ? (
                          <Mono className="text-[9px] text-muted-foreground">—</Mono>
                        ) : r.match ? (
                          <Mono className="text-[9px] text-lime">✓</Mono>
                        ) : (
                          <Mono className="text-[9px] text-critical">✗</Mono>
                        )}
                      </td>
                      <td className="px-3 py-2.5 pr-4">
                        <Mono className={`text-[9px] ${riskTone(r.risk)}`}>{r.risk}</Mono>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelShell>
        </>
      )}
    </section>
  );
}

/* ----------------------------------------------------- pipeline strip */

const PIPELINE = ["ALERT", "SUPERVISOR", "WATCHMAN", "DETECTIVE", "JURIST", "SCRIBE", "RESULT"];

function PipelineSection() {
  return (
    <section className="border-b border-border px-6 py-12 md:px-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h3 className="text-lg font-semibold uppercase tracking-[-0.02em]">
          Investigation pipeline
        </h3>
        <Mono className="text-[8px] text-muted-foreground">
          LIVE STAGE STATE STREAMS INTO 03 / INVESTIGATION WORKSPACE
        </Mono>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {PIPELINE.map((stage, i) => (
          <div key={stage} className="flex items-center gap-2">
            <div
              className={`border px-3 py-2 ${
                i === 0 || i === PIPELINE.length - 1
                  ? "border-lime/50 bg-lime-soft"
                  : "border-border bg-surface"
              }`}
            >
              <Mono
                className={`text-[9px] ${i === 0 || i === PIPELINE.length - 1 ? "text-lime" : "text-foreground"}`}
              >
                {stage}
              </Mono>
            </div>
            {i < PIPELINE.length - 1 ? <Mono className="text-[10px] text-technical">→</Mono> : null}
          </div>
        ))}
      </div>
      <Mono className="mt-4 block text-[8px] leading-relaxed text-muted-foreground">
        THE PER-STAGE ACTIVE / COMPLETE / FAILED STATE ANIMATES ON THE 3D FLOOR IN THE INVESTIGATION
        WORKSPACE, DRIVEN BY THE WORKER SSE EVENT STREAM DURING A LIVE INVESTIGATION.
      </Mono>
    </section>
  );
}

/* ------------------------------------------- transaction trend charts */

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-border bg-elevated px-3 py-2">
      <Mono className="block text-[9px] text-foreground">{label}</Mono>
      {payload.map((p) => (
        <Mono key={p.name} className="mt-1 block text-[8px]">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="ml-2 text-foreground">{p.value}</span>
        </Mono>
      ))}
    </div>
  );
}

const GRANULARITIES: { key: Granularity | "year"; label: string }[] = [
  { key: "day", label: "DAILY" },
  { key: "week", label: "WEEKLY" },
  { key: "month", label: "MONTHLY" },
  { key: "year", label: "YEARLY" },
];

export function TransactionTrends() {
  const [gran, setGran] = useState<Granularity | "year">("month");
  const isYear = gran === "year";
  const q = useQuery({
    queryKey: ["txn-trends", gran],
    queryFn: () => fetchTransactionTrends(gran as Granularity),
    enabled: !isYear, // yearly is not supported by the data span
  });

  const data = q.data;

  return (
    <section className="border-b border-border px-6 py-12 md:px-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold uppercase tracking-[-0.02em]">
            Transaction &amp; alert trends
          </h3>
          <Mono className="mt-2 block text-[8px] text-muted-foreground">
            SOURCE: BANK LEDGER event_time · isFlaggedFraud · NO SYNTHETIC DATES
          </Mono>
        </div>
        <div className="flex gap-1">
          {GRANULARITIES.map((g) => (
            <button
              key={g.key}
              onClick={() => setGran(g.key)}
              className={`border px-2.5 py-1 font-mono text-[9px] tracking-[0.18em] transition-colors ${
                gran === g.key
                  ? "border-lime/60 bg-lime-soft text-lime"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {isYear ? (
        <div className="mt-6 border border-border bg-surface px-4 py-6">
          <Mono className="block text-[9px] text-warning">YEARLY VIEW: INSUFFICIENT DATA</Mono>
          <Mono className="mt-2 block text-[8px] leading-relaxed text-muted-foreground">
            THE SYNTHETIC BANK LEDGER SPANS APPROXIMATELY THREE MONTHS. A YEARLY TREND WOULD REQUIRE
            AT LEAST 12 MONTHS OF REAL DATA — SO IT IS REPORTED AS INSUFFICIENT RATHER THAN
            FABRICATED. USE DAILY / WEEKLY / MONTHLY FOR THE AVAILABLE RANGE.
          </Mono>
        </div>
      ) : (
        <>
          {q.isLoading ? <LoadingBlock label="AGGREGATING LEDGER TIMELINE" /> : null}
          {q.isError ? (
            <ErrorBlock label="TREND DATA UNAVAILABLE" onRetry={() => q.refetch()} />
          ) : null}

          {data && data.state === "OK" && data.buckets.length > 0 ? (
            <>
              <div className="mt-6 grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-4">
                <TrendStat value={data.buckets.length} label={`${gran.toUpperCase()} BUCKETS`} />
                <TrendStat
                  value={data.sampled.toLocaleString("en-IN")}
                  label="TRANSACTIONS AGGREGATED"
                />
                <TrendStat
                  value={data.buckets.reduce((s, b) => s + b.flagged, 0)}
                  label="FLAGGED IN SAMPLE"
                  tone="text-critical"
                />
                <TrendStat value={data.totalLedger.toLocaleString("en-IN")} label="LEDGER TOTAL" />
              </div>

              <PanelShell
                title="TRANSACTION VOLUME"
                meta={
                  data.spanStart && data.spanEnd
                    ? `${data.spanStart.slice(0, 10)} → ${data.spanEnd.slice(0, 10)}`
                    : undefined
                }
                className="mt-6"
              >
                <div className="h-64 w-full px-2 py-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.buckets}
                      margin={{ top: 8, right: 12, bottom: 4, left: -8 }}
                    >
                      <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke={C.muted}
                        tick={{ fontSize: 9, fontFamily: "monospace", fill: C.muted }}
                        tickLine={false}
                        axisLine={{ stroke: C.border }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        stroke={C.muted}
                        tick={{ fontSize: 9, fontFamily: "monospace", fill: C.muted }}
                        tickLine={false}
                        axisLine={{ stroke: C.border }}
                        width={40}
                      />
                      <Tooltip
                        content={<TrendTooltip />}
                        cursor={{ fill: "rgba(199,240,0,0.06)" }}
                      />
                      <Bar
                        dataKey="total"
                        name="TRANSACTIONS"
                        fill={C.lime}
                        radius={[1, 1, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </PanelShell>

              <PanelShell
                title="FLAGGED TRANSACTIONS (RULE ENGINE)"
                meta="isFlaggedFraud OVER TIME"
                className="mt-6"
              >
                <div className="h-56 w-full px-2 py-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={data.buckets}
                      margin={{ top: 8, right: 12, bottom: 4, left: -8 }}
                    >
                      <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke={C.muted}
                        tick={{ fontSize: 9, fontFamily: "monospace", fill: C.muted }}
                        tickLine={false}
                        axisLine={{ stroke: C.border }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        stroke={C.muted}
                        tick={{ fontSize: 9, fontFamily: "monospace", fill: C.muted }}
                        tickLine={false}
                        axisLine={{ stroke: C.border }}
                        width={40}
                        allowDecimals={false}
                      />
                      <Tooltip
                        content={<TrendTooltip />}
                        cursor={{ fill: "rgba(255,74,66,0.06)" }}
                      />
                      <Bar
                        dataKey="flagged"
                        name="FLAGGED"
                        fill={C.critical}
                        radius={[1, 1, 0, 0]}
                      />
                      <Line
                        type="monotone"
                        dataKey="flagged"
                        name="FLAGGED TREND"
                        stroke={C.critical}
                        strokeWidth={1}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </PanelShell>
            </>
          ) : data && data.state !== "OK" ? (
            <div className="mt-6 border border-border bg-surface px-4 py-6">
              <Mono className="text-[9px] text-muted-foreground">
                {data.state === "NOT_CONNECTED"
                  ? "BANK LEDGER NOT CONNECTED"
                  : "TREND DATA UNAVAILABLE"}
              </Mono>
            </div>
          ) : data ? (
            <EmptyBlock label="NO TRANSACTIONS IN LEDGER" />
          ) : null}
        </>
      )}
    </section>
  );
}

function TrendStat({
  value,
  label,
  tone = "",
}: {
  value: string | number;
  label: string;
  tone?: string;
}) {
  return (
    <div className="bg-surface px-4 py-4">
      <Mono className={`block text-xl ${tone || "text-foreground"}`}>{value}</Mono>
      <Mono className="mt-2 block text-[8px] text-muted-foreground">{label}</Mono>
    </div>
  );
}

/* --------------------------------------------- case & agent charts */

/** Donut of FRAB recommendation outcomes — real /cases dispositions. */
function OutcomeDonut({ outcomes }: { outcomes: OutcomeAnalytics }) {
  const data = outcomes.recommendations.map((d) => ({ name: d.key, value: d.count }));
  return (
    <PanelShell title="INVESTIGATION OUTCOMES" meta="SOURCE: /cases">
      {data.length === 0 ? (
        <EmptyBlock label="NO OUTCOMES RECORDED" />
      ) : (
        <div className="h-56 w-full px-2 py-3">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={44}
                outerRadius={70}
                paddingAngle={2}
                stroke={C.surface}
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={outcomeColor(d.name)} />
                ))}
              </Pie>
              <Tooltip content={<TrendTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="border-t border-border px-4 py-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {data.map((d) => (
            <span key={d.name} className="flex items-center gap-1.5">
              <span
                className="inline-block h-1.5 w-1.5"
                style={{ background: outcomeColor(d.name) }}
              />
              <Mono className="text-[8px] text-muted-foreground">
                {d.name} {d.value}
              </Mono>
            </span>
          ))}
        </div>
      </div>
    </PanelShell>
  );
}

/** Resolved vs running vs review — real /cases status. */
function ResolutionChart({ investigations }: { investigations: InvestigationAnalytics }) {
  const data = [
    { name: "COMPLETED", value: investigations.completed, fill: C.lime },
    { name: "RUNNING", value: investigations.running, fill: C.amber },
    { name: "REVIEW", value: investigations.humanReviewRequired, fill: C.muted },
  ];
  const total = investigations.started || 1;
  return (
    <PanelShell title="INVESTIGATION STATE" meta={`${investigations.started} CASES`}>
      <div className="h-56 w-full px-2 py-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
          >
            <CartesianGrid stroke={C.border} strokeDasharray="2 4" horizontal={false} />
            <XAxis
              type="number"
              stroke={C.muted}
              tick={{ fontSize: 9, fontFamily: "monospace", fill: C.muted }}
              tickLine={false}
              axisLine={{ stroke: C.border }}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke={C.muted}
              tick={{ fontSize: 9, fontFamily: "monospace", fill: C.muted }}
              tickLine={false}
              axisLine={{ stroke: C.border }}
              width={72}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ fill: "rgba(199,240,0,0.06)" }} />
            <Bar dataKey="value" name="CASES" radius={[0, 1, 1, 0]}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="border-t border-border px-4 py-2">
        <Mono className="text-[8px] text-muted-foreground">
          {Math.round((investigations.completed / total) * 100)}% RESOLVED ·{" "}
          {investigations.running} IN PROGRESS
        </Mono>
      </div>
    </PanelShell>
  );
}

/** Controlled scenario validation match as a small chart. */
function ScenarioMatchChart({ scenarios }: { scenarios: ScenarioValidation }) {
  const data = [
    { name: "MATCHED", value: scenarios.matched, fill: C.lime },
    { name: "MISMATCH", value: scenarios.mismatched, fill: C.critical },
    { name: "UNRESOLVED", value: scenarios.unresolved, fill: C.muted },
  ];
  const pct =
    scenarios.evaluated > 0 ? Math.round((scenarios.matched / scenarios.evaluated) * 100) : 0;
  return (
    <PanelShell title="SCENARIO VALIDATION" meta="NOT PRODUCTION ACCURACY">
      {scenarios.state !== "OK" || scenarios.evaluated === 0 ? (
        <EmptyBlock label="VALIDATION DATA UNAVAILABLE" />
      ) : (
        <>
          <div className="h-56 w-full px-2 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={44}
                  outerRadius={70}
                  paddingAngle={2}
                  stroke={C.surface}
                >
                  {data.map((d) => (
                    <Cell key={d.name} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip content={<TrendTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="border-t border-border px-4 py-2">
            <Mono className="text-[8px] text-muted-foreground">
              {scenarios.matched}/{scenarios.evaluated} EXPECTED OUTCOMES MATCHED · {pct}%
            </Mono>
          </div>
        </>
      )}
    </PanelShell>
  );
}

/** Agent operational metrics (executions + completed) — NOT accuracy. */
function AgentOpsChart({ agents }: { agents: { rows: AgentOp[]; state: Availability } }) {
  if (agents.state !== "OK" || agents.rows.length === 0) {
    return (
      <PanelShell
        title="AGENT OPERATIONS"
        meta={agents.state === "NOT_CONNECTED" ? "WORKER NOT CONNECTED" : "INSUFFICIENT SAMPLE"}
      >
        <div className="px-4 py-6">
          <Mono className="text-[9px] text-muted-foreground">
            {agents.state === "NOT_CONNECTED"
              ? "PER-AGENT OPERATIONS REQUIRE THE INVESTIGATION WORKER."
              : "RUN A CASE FROM ALERT INTELLIGENCE TO POPULATE PER-AGENT OPERATIONS."}
          </Mono>
        </div>
      </PanelShell>
    );
  }
  const data = agents.rows.map((a) => ({
    name: a.agent,
    executions: a.executions,
    completed: a.completed,
  }));
  return (
    <PanelShell title="AGENT OPERATIONS" meta="EXECUTIONS · OPERATIONAL, NOT ACCURACY">
      <div className="h-60 w-full px-2 py-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
            <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="name"
              stroke={C.muted}
              tick={{ fontSize: 8, fontFamily: "monospace", fill: C.muted }}
              tickLine={false}
              axisLine={{ stroke: C.border }}
            />
            <YAxis
              stroke={C.muted}
              tick={{ fontSize: 9, fontFamily: "monospace", fill: C.muted }}
              tickLine={false}
              axisLine={{ stroke: C.border }}
              width={32}
              allowDecimals={false}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ fill: "rgba(199,240,0,0.06)" }} />
            <Bar dataKey="executions" name="EXECUTIONS" fill={C.muted} radius={[1, 1, 0, 0]} />
            <Bar dataKey="completed" name="COMPLETED" fill={C.lime} radius={[1, 1, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </PanelShell>
  );
}
