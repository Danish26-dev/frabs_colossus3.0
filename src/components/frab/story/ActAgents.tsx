import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";
import { useState } from "react";
import { Mono, SectionLabel } from "../primitives";

/**
 * ACT 04 — interactive multi-agent environment.
 * Supervisor sits at the centre; five specialised modules surround it.
 * Selecting a module focuses the camera on it, lights its link to the Supervisor,
 * and shows its responsibility plus an illustrative input/output.
 */

type AgentKey = "supervisor" | "watchman" | "detective" | "jurist" | "scribe" | "call";

interface AgentDef {
  key: AgentKey;
  name: string;
  tag: string;
  x: number;
  y: number;
  role: string;
  input: string;
  output: string;
}

const AGENTS: AgentDef[] = [
  {
    key: "supervisor",
    name: "SUPERVISOR",
    tag: "ORCHESTRATION",
    x: 400,
    y: 250,
    role: "Coordinates the investigation workflow: sequences the agents, manages case state and handles partial failures. It does not calculate financial metrics.",
    input: "Suspicious alert + case id",
    output: "Sequenced run: Watchman → Detective → Jurist → Scribe, with state tracked end to end",
  },
  {
    key: "watchman",
    name: "WATCHMAN",
    tag: "MONITORING",
    x: 400,
    y: 66,
    role: "Evaluates suspicious transaction signals and behavioural deviations against the customer's own baseline, then classifies severity.",
    input: "Alert, customer baseline, velocity, beneficiary novelty",
    output: '{ triage: "REQUIRES_CONTEXTUAL_INVESTIGATION", severity: "HIGH", reasons: ["amount_deviation", "new_beneficiary", "velocity_change"], next_agent: "DETECTIVE" }',
  },
  {
    key: "detective",
    name: "DETECTIVE",
    tag: "INVESTIGATION",
    x: 676,
    y: 193,
    role: "Investigates transaction history, beneficiary relationships and contextual evidence using dedicated deterministic tools.",
    input: "Triage result + case",
    output: "Evidence package: history, baseline, beneficiaries, counterparties and account-network trace",
  },
  {
    key: "jurist",
    name: "JURIST",
    tag: "AML / COMPLIANCE",
    x: 570,
    y: 404,
    role: "Evaluates relevant AML and compliance context and maps findings to regulatory considerations, preserving evidence references. It does not invent citations.",
    input: "Evidence package",
    output: "Regulatory assessment with supporting evidence references",
  },
  {
    key: "scribe",
    name: "SCRIBE",
    tag: "REPORTING",
    x: 230,
    y: 404,
    role: "Creates the structured, evidence-backed investigation report: findings, regulatory assessment, agent trace and a recommendation.",
    input: "Evidence, regulatory assessment, agent trace",
    output: "Audit-ready case + ESCALATE | MONITOR | CLOSE_FALSE_POSITIVE | INSUFFICIENT_EVIDENCE",
  },
  {
    key: "call",
    name: "CALL ESCALATION",
    tag: "VERIFICATION",
    x: 124,
    y: 193,
    role: "Supports trusted customer verification when additional context is needed. Analyst-triggered, delivered through the separate voice service.",
    input: "Analyst-triggered escalation for a case",
    output: "Structured assessment: verification status, claimed purpose, consistency, transcript and recording",
  },
];

const at = (i: number): AgentDef => AGENTS[i]!;
const SUP = at(0);
const SCALE = 1.55;

function Glyph({ k }: { k: AgentKey }) {
  const c = { stroke: "#C7F000", strokeWidth: 1.6, fill: "none", strokeLinejoin: "round" as const };
  switch (k) {
    case "supervisor":
      return <polygon {...c} points="0,-9 8,-4 8,5 0,10 -8,5 -8,-4" />;
    case "watchman":
      return (<g><circle {...c} r={7} /><circle cx={0} cy={0} r={2.2} fill="#C7F000" /></g>);
    case "detective":
      return (<g><circle {...c} cx={-1} cy={-1} r={6} /><path {...c} d="M3.5 3.5 L9 9" /></g>);
    case "jurist":
      return (<g><path {...c} d="M0 -9 V9 M-8 -4 H8 M-8 -4 L-10 3 H-6 Z M8 -4 L6 3 H10 Z" /></g>);
    case "scribe":
      return (<g><rect {...c} x={-7} y={-9} width={14} height={18} /><path {...c} d="M-3 -3 H3 M-3 1 H3 M-3 5 H1" /></g>);
    default:
      return (<g><path {...c} d="M-7 -6 Q-7 -9 -4 -9 H4 Q7 -9 7 -6 V2 Q7 5 4 5 H0 L-5 9 V5 H-4 Q-7 5 -7 2 Z" /></g>);
  }
}

function Module({
  a,
  active,
  onSelect,
  reduced,
}: {
  a: AgentDef;
  active: boolean;
  onSelect: (k: AgentKey) => void;
  reduced: boolean;
}) {
  const big = a.key === "supervisor";
  const w = big ? 196 : 180;
  const h = big ? 86 : 66;
  return (
    <g
      transform={`translate(${a.x} ${a.y})`}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={`${a.name} — ${a.tag}`}
      onClick={() => onSelect(a.key)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(a.key);
        }
      }}
      className="cursor-pointer outline-none [&:focus-visible_.frame]:stroke-[#C7F000]"
    >
      {/* depth slab */}
      <rect x={-w / 2 + 7} y={-h / 2 + 8} width={w} height={h} rx={3} fill="#0A0C07" opacity={0.9} />
      {/* front plate + contents lift together when the module is selected */}
      <motion.g
        initial={false}
        animate={{ y: !reduced && active ? -5 : 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
      >
        <rect
          className="frame"
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          rx={3}
          fill={active ? "#232A12" : "#242821"}
          stroke={active ? "#C7F000" : "#3A4036"}
          strokeWidth={active ? 2 : 1.2}
        />
        <path d={`M${-w / 2} ${-h / 2 + 1} H${w / 2}`} stroke="#C7F000" strokeOpacity={active ? 0.9 : 0.35} strokeWidth={1.4} />
        <g transform={`translate(${-w / 2 + 22} 0)`}>
          <Glyph k={a.key} />
        </g>
        <text
          x={-w / 2 + 42}
          y={-3}
          fontSize={big ? 12.5 : 10.5}
          letterSpacing="0.16em"
          fill="#F4F3EA"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {a.name}
        </text>
        <text
          x={-w / 2 + 42}
          y={13}
          fontSize={8}
          letterSpacing="0.2em"
          fill={active ? "#C7F000" : "#9FA69A"}
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {a.tag}
        </text>
      </motion.g>
    </g>
  );
}

export default function ActAgents() {
  const reduced = !!useReducedMotion();
  const [sel, setSel] = useState<AgentKey>("supervisor");
  const cur = AGENTS.find((a) => a.key === sel)!;
  const focused = sel !== "supervisor";
  // camera: zoom on the selected module, otherwise show the whole environment
  const cam = focused
    ? { scale: SCALE, x: 400 - cur.x * SCALE, y: 250 - cur.y * SCALE }
    : { scale: 1, x: 0, y: 0 };

  return (
    <section
      id="agents"
      aria-label="Act 04 — the multi-agent intelligence system"
      className="relative scroll-mt-24 border-t border-border"
    >
      <div className="mx-auto max-w-[1440px] px-6 py-24 md:px-14 lg:py-32">
        <SectionLabel>THE AGENT SYSTEM</SectionLabel>
        <h2 className="mt-6 max-w-4xl text-[clamp(1.8rem,3.6vw,3.1rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-foreground">
          Specialised intelligence. <span className="text-lime">One coordinated investigation.</span>
        </h2>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
          Not robots: specialised intelligence modules, orchestrated by a Supervisor. Select a
          module to focus on it.
        </p>

        {/* touch / keyboard friendly selector */}
        <div role="tablist" aria-label="Agents" className="mt-10 flex flex-wrap gap-2">
          {AGENTS.map((a) => (
            <button
              key={a.key}
              role="tab"
              aria-selected={sel === a.key}
              onClick={() => setSel(a.key)}
              className={`border px-3.5 py-2.5 font-mono text-[10px] tracking-[0.2em] transition-colors ${
                sel === a.key
                  ? "border-lime bg-lime/10 text-lime"
                  : "border-border text-muted-foreground hover:border-lime/50 hover:text-foreground"
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="relative overflow-hidden border border-border bg-surface/30">
            <div aria-hidden className="frab-grid pointer-events-none absolute inset-0 opacity-[0.1]" />
            <svg viewBox="0 0 800 500" className="relative h-auto w-full" role="group" aria-label="Agent environment">
              <motion.g
                initial={false}
                animate={cam}
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 70, damping: 16 }}
                style={{ originX: 0, originY: 0 }}
              >
                {/* links to Supervisor */}
                {AGENTS.slice(1).map((a) => {
                  const on = sel === a.key || sel === "supervisor";
                  const lit = sel === a.key;
                  const d = `M${SUP.x} ${SUP.y} L${a.x} ${a.y}`;
                  return (
                    <g key={a.key}>
                      <path d={d} stroke={lit ? "#C7F000" : "#3A4036"} strokeWidth={lit ? 2.4 : 1.2} fill="none" />
                      {on && !reduced ? (
                        <circle r={lit ? 3.6 : 2.4} fill="#C7F000" opacity={lit ? 1 : 0.65}>
                          <animateMotion dur={lit ? "1.4s" : "3.2s"} repeatCount="indefinite" path={d} />
                        </circle>
                      ) : null}
                    </g>
                  );
                })}
                {/* pipeline order ring: W → D → J → S */}
                <path
                  d={`M${at(1).x} ${at(1).y} L${at(2).x} ${at(2).y} L${at(3).x} ${at(3).y} L${at(4).x} ${at(4).y}`}
                  stroke="#59624F"
                  strokeWidth={1}
                  strokeDasharray="2 6"
                  fill="none"
                />
                {AGENTS.map((a) => (
                  <Module key={a.key} a={a} active={sel === a.key} onSelect={setSel} reduced={reduced} />
                ))}
              </motion.g>
            </svg>
            <div className="pointer-events-none absolute bottom-3 left-3 font-mono text-[9px] tracking-[0.24em] text-muted-foreground">
              {focused ? `FOCUS: ${cur.name}` : "OVERVIEW"}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={cur.key}
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="border border-border bg-surface/60 p-6"
              aria-live="polite"
            >
              <Mono className="text-[10px] text-lime">{cur.tag}</Mono>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{cur.name}</h3>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{cur.role}</p>
              <div className="mt-6 space-y-4 border-t border-border pt-5">
                <div>
                  <Mono className="text-[9px] text-muted-foreground">EXAMPLE INPUT</Mono>
                  <p className="mt-1.5 text-[13px] leading-snug text-foreground/90">{cur.input}</p>
                </div>
                <div>
                  <Mono className="text-[9px] text-muted-foreground">EXAMPLE OUTPUT</Mono>
                  <p className="mt-1.5 break-words border-l border-lime/50 pl-3 font-mono text-[11px] leading-relaxed text-lime/90">
                    {cur.output}
                  </p>
                </div>
              </div>
              <p className="mt-5 font-mono text-[9px] tracking-[0.22em] text-muted-foreground">
                ILLUSTRATIVE EXAMPLE
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
