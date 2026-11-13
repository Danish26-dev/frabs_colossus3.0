import { useState } from "react";
import {
  FlowRow,
  Mono,
  Note,
  Panel,
  Reveal,
  RiskTag,
  Section,
  StatusDot,
} from "../primitives";

/* ------------------------------------------------------ financial crime dna */

const DNA = [
  ["AMOUNT DEVIATION", 0.82],
  ["BENEFICIARY NOVELTY", 0.91],
  ["VELOCITY", 0.64],
  ["BEHAVIOR DEVIATION", 0.74],
  ["NETWORK EXPOSURE", 0.48],
] as [string, number][];

function CrimeDna() {
  const size = 300;
  const c = size / 2;
  const R = 100;
  const pts = DNA.map(([, v], i) => {
    const a = (Math.PI * 2 * i) / DNA.length - Math.PI / 2;
    return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v] as const;
  });
  const poly = pts.map((p) => p.join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-auto w-full max-w-[300px]">
      {[0.25, 0.5, 0.75, 1].map((r) => (
        <polygon
          key={r}
          points={DNA.map((_, i) => {
            const a = (Math.PI * 2 * i) / DNA.length - Math.PI / 2;
            return `${c + Math.cos(a) * R * r},${c + Math.sin(a) * R * r}`;
          }).join(" ")}
          fill="none"
          className="stroke-border"
          strokeWidth={0.7}
        />
      ))}
      {DNA.map(([label], i) => {
        const a = (Math.PI * 2 * i) / DNA.length - Math.PI / 2;
        return (
          <g key={label}>
            <line
              x1={c}
              y1={c}
              x2={c + Math.cos(a) * R}
              y2={c + Math.sin(a) * R}
              className="stroke-border"
              strokeWidth={0.7}
            />
            <text
              x={c + Math.cos(a) * (R + 22)}
              y={c + Math.sin(a) * (R + 22)}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-[var(--muted-foreground)] font-mono"
              style={{ fontSize: 6.5, letterSpacing: "0.14em" }}
            >
              {label}
            </text>
          </g>
        );
      })}
      <polygon points={poly} className="fill-lime/15 stroke-lime" strokeWidth={1.2} />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={2.4} className="fill-lime" />
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------- network map */

type NetNode = { id: string; kind: string; x: number; y: number; risk?: boolean };

const NODES: NetNode[] = [
  { id: "CUSTOMER", kind: "CUSTOMER", x: 50, y: 50 },
  { id: "ACC-01", kind: "ACCOUNT", x: 22, y: 26 },
  { id: "ACC-02", kind: "ACCOUNT", x: 22, y: 74 },
  { id: "BEN-01", kind: "BENEFICIARY", x: 78, y: 24, risk: true },
  { id: "BEN-02", kind: "BENEFICIARY", x: 84, y: 54 },
  { id: "CPT-01", kind: "COUNTERPARTY", x: 66, y: 84, risk: true },
];

const EDGES: [string, string][] = [
  ["CUSTOMER", "ACC-01"],
  ["CUSTOMER", "ACC-02"],
  ["ACC-01", "BEN-01"],
  ["ACC-01", "BEN-02"],
  ["ACC-02", "CPT-01"],
  ["BEN-01", "CPT-01"],
];

function NetworkMap() {
  const byId = (id: string) => NODES.find((n) => n.id === id)!;
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden">
      <div className="frab-grid absolute inset-0 opacity-20" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {EDGES.map(([a, b]) => {
          const na = byId(a);
          const nb = byId(b);
          const risky = na.risk && nb.risk;
          return (
            <line
              key={`${a}-${b}`}
              x1={na.x}
              y1={na.y}
              x2={nb.x}
              y2={nb.y}
              vectorEffect="non-scaling-stroke"
              strokeWidth={1}
              className={risky ? "stroke-critical" : "stroke-lime/60"}
            />
          );
        })}
      </svg>
      {NODES.map((n) => (
        <div
          key={n.id}
          className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
          style={{ left: `${n.x}%`, top: `${n.y}%` }}
        >
          <div
            className={`mx-auto h-3 w-3 rotate-45 border ${
              n.id === "CUSTOMER"
                ? "border-lime bg-lime/40"
                : n.risk
                  ? "border-critical bg-critical/40"
                  : "border-border bg-background"
            }`}
          />
          <Mono className="mt-2 block text-[8px] text-foreground/80">{n.id}</Mono>
          <Mono className="block text-[7px] text-muted-foreground">{n.kind}</Mono>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ section */

const WHY = [
  "Transaction amount exceeded historical behavior — [DEMO VALUE]",
  "Beneficiary is newly observed for this customer",
  "Transaction velocity increased against the baseline window",
  "High-risk counterparty detected within 2 hops",
  "Regulatory context flagged by JURIST for analyst confirmation",
];

export function OutputSection() {
  const [open, setOpen] = useState(true);
  return (
    <Section
      id="output"
      label="THE OUTPUT"
      title={
        <>
          NOT AN ANSWER.
          <br />
          <span className="text-lime">A CASE.</span>
        </>
      }
      lead="FRAB returns a structured investigation record — every conclusion expandable into the evidence behind it."
    >
      <Panel title="FRAB INVESTIGATION RESULT" meta="DEMO ENVIRONMENT / SYNTHETIC DATA">
        <div className="grid gap-px bg-border sm:grid-cols-3">
          {[
            ["CASE ID", "FRAB-CASE-[DEMO]"],
            ["RISK LEVEL", "HIGH"],
            ["RECOMMENDED ACTION", "ESCALATE"],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface px-5 py-5">
              <Mono className="block text-[9px] text-muted-foreground">{k}</Mono>
              {k === "RISK LEVEL" ? (
                <div className="mt-2.5">
                  <RiskTag level={v as string} />
                </div>
              ) : (
                <Mono className="mt-2.5 block text-[11px] text-foreground">{v}</Mono>
              )}
            </div>
          ))}
        </div>

        <div className="grid gap-px bg-border lg:grid-cols-3">
          <div className="bg-surface/60 p-7">
            <Mono className="block text-[10px] text-lime">FINANCIAL CRIME DNA</Mono>
            <Mono className="mt-1.5 block text-[9px] text-muted-foreground">
              EVIDENCE DIMENSIONS
            </Mono>
            <div className="mt-6">
              <CrimeDna />
            </div>
          </div>

          <div className="bg-surface/60 p-7">
            <div className="flex items-center justify-between">
              <Mono className="block text-[10px] text-lime">TRACE THE MONEY</Mono>
              <StatusDot tone="critical" />
            </div>
            <Mono className="mt-1.5 block text-[9px] text-muted-foreground">
              COUNTERPARTY NETWORK
            </Mono>
            <div className="mt-6 border border-border">
              <NetworkMap />
            </div>
          </div>

          <div className="bg-surface/60 p-7">
            <Mono className="block text-[10px] text-lime">WHY?</Mono>
            <Mono className="mt-1.5 block text-[9px] text-muted-foreground">
              EVIDENCE SUPPORTING THE CONCLUSION
            </Mono>
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="mt-6 flex w-full items-center justify-between gap-4 border-y border-border py-4 text-left"
            >
              <Mono className="text-[10px] text-foreground">WHY HIGH RISK?</Mono>
              <Mono className="text-[12px] text-lime">{open ? "−" : "+"}</Mono>
            </button>
            {open ? (
              <ul className="mt-5 space-y-2.5">
                {WHY.map((it) => (
                  <li key={it} className="flex gap-3">
                    <span className="mt-2 h-px w-4 shrink-0 bg-lime/60" />
                    <span className="text-sm leading-relaxed text-muted-foreground">{it}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <Note>PLACEHOLDER VALUES UNTIL BACKEND IS CONNECTED</Note>
          </div>
        </div>
      </Panel>

      <Reveal delay={120}>
        <div className="mt-12">
          <FlowRow
            items={[
              "ALERT",
              "EVIDENCE",
              "AGENT ANALYSIS",
              "REGULATORY RISK",
              "RECOMMENDATION",
              "ANALYST DECISION",
            ]}
          />
        </div>
      </Reveal>
    </Section>
  );
}
