import { FlowRow, Mono, Reveal, Section, StatusDot } from "../primitives";

const STAGES = [
  ["TRIAGE", "Why did the transaction trigger?"],
  ["CONTEXT", "Customer, KYC and account history."],
  ["BEHAVIOR", "Deviation against the customer baseline."],
  ["NETWORK", "Beneficiaries, counterparties, 2-hop flows."],
  ["REGULATORY RISK", "Why the pattern matters, with context."],
  ["AUDIT", "Evidence, reasoning and decision rationale."],
];

export function PipelineSection() {
  return (
    <Section
      id="how-it-works"
      label="HOW IT WORKS / INVESTIGATION PIPELINE"
      title={
        <>
          FROM SIGNAL
          <br />
          <span className="text-lime">TO CASE.</span>
        </>
      }
    >
      <div className="relative">
        <div className="pointer-events-none absolute left-0 right-0 top-0 hidden h-px bg-border lg:block" />
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-6">
          {STAGES.map(([name, body], i) => (
            <Reveal key={name} delay={i * 70} className="group bg-surface/50">
              <div className="h-full p-6 transition-colors group-hover:bg-surface">
                <div className="flex items-center justify-between">
                  <Mono className="text-[10px] text-lime">
                    {String(i + 1).padStart(2, "0")}
                  </Mono>
                  <StatusDot tone={i === 5 ? "lime" : i === 0 ? "critical" : "muted"} />
                </div>
                <div className="mt-5 h-px w-full bg-border">
                  <div
                    className="h-px bg-lime/70"
                    style={{ width: `${((i + 1) / STAGES.length) * 100}%` }}
                  />
                </div>
                <Mono className="mt-5 block text-[11px] text-foreground">{name}</Mono>
                <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <Reveal delay={120}>
        <p className="mt-12 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
          FRAB progressively expands an alert from a transaction signal into a
          defensible investigation.
        </p>
      </Reveal>

      <Reveal delay={180}>
        <div className="mt-10 border-t border-border pt-10">
          <FlowRow
            items={["ALERT", "EVIDENCE", "REASONING", "RISK", "DECISION"]}
          />
        </div>
      </Reveal>
    </Section>
  );
}

const AGENTS: [string, string, string][] = [
  ["WATCHMAN", "TRIAGE", "Detects and triages the alert."],
  ["DETECTIVE", "EVIDENCE", "Gathers evidence and traces financial relationships."],
  ["JURIST", "REGULATORY RISK", "Assesses regulatory risk and context."],
  ["SCRIBE", "AUDIT", "Builds the audit-ready investigation record."],
  ["CALLING AGENT", "ORCHESTRATION", "Coordinates investigation actions."],
];

function AgentGlyph({ index }: { index: number }) {
  const glyphs = [
    <g key="g0">
      <rect x="10" y="10" width="28" height="28" className="stroke-lime/70" fill="none" />
      <circle cx="24" cy="24" r="6" className="fill-lime/30 stroke-lime" />
    </g>,
    <g key="g1">
      <polygon points="24,8 40,24 24,40 8,24" className="stroke-lime/70" fill="none" />
      <polygon points="24,16 32,24 24,32 16,24" className="fill-lime/25 stroke-lime" />
    </g>,
    <g key="g2">
      <rect x="9" y="14" width="30" height="20" className="stroke-lime/70" fill="none" />
      <line x1="9" y1="24" x2="39" y2="24" className="stroke-lime" />
      <line x1="24" y1="14" x2="24" y2="34" className="stroke-lime/50" />
    </g>,
    <g key="g3">
      <rect x="12" y="9" width="24" height="30" className="stroke-lime/70" fill="none" />
      <line x1="17" y1="17" x2="31" y2="17" className="stroke-lime/60" />
      <line x1="17" y1="23" x2="31" y2="23" className="stroke-lime/60" />
      <line x1="17" y1="29" x2="26" y2="29" className="stroke-lime" />
    </g>,
    <g key="g4">
      <circle cx="24" cy="24" r="14" className="stroke-lime/70" fill="none" />
      <circle cx="24" cy="24" r="3" className="fill-lime" />
      <line x1="24" y1="10" x2="24" y2="18" className="stroke-lime/60" />
      <line x1="38" y1="24" x2="30" y2="24" className="stroke-lime/60" />
      <line x1="24" y1="38" x2="24" y2="30" className="stroke-lime/60" />
      <line x1="10" y1="24" x2="18" y2="24" className="stroke-lime/60" />
    </g>,
  ];
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12" strokeWidth={1}>
      {glyphs[index]}
    </svg>
  );
}

export function AgentsSection() {
  return (
    <Section
      id="agents"
      label="04 / AGENT SYSTEM"
      title={
        <>
          FIVE SPECIALISTS.
          <br />
          <span className="text-lime">ONE INVESTIGATION.</span>
        </>
      }
    >
      <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-5">
        {AGENTS.map(([name, role, duty], i) => (
          <Reveal key={name} delay={i * 80} className="group bg-surface/60">
            <div className="h-full p-7 transition-colors group-hover:bg-surface">
              <div className="flex items-start justify-between">
                <AgentGlyph index={i} />
                <span className="inline-flex items-center gap-2">
                  <StatusDot />
                  <Mono className="text-[9px] text-lime">STANDBY</Mono>
                </span>
              </div>
              <p className="mt-7 text-lg font-semibold uppercase leading-tight tracking-[-0.02em] text-foreground">
                {name}
              </p>
              <Mono className="mt-1.5 block text-[9px] text-lime">{role}</Mono>
              <p className="mt-5 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
                {duty}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
