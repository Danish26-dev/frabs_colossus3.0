import {
  FlowRow,
  Mono,
  Node,
  Note,
  Reveal,
  Section,
  StatusDot,
  VArrow,
} from "../primitives";

const CHAIN = [
  "ALERT",
  "CUSTOMER",
  "TRANSACTIONS",
  "KYC",
  "BENEFICIARY",
  "BEHAVIOR",
  "NETWORK",
  "REGULATORY RISK",
  "DECISION",
];

export function HeroTransition() {
  return (
    <div className="relative border-t border-border">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-3 px-6 py-12 md:px-14">
        <Reveal>
          <span className="inline-flex items-center gap-2">
            <StatusDot tone="critical" />
            <Mono className="text-[10px] text-critical">ALERT SIGNAL DETECTED</Mono>
          </span>
        </Reveal>
        <Reveal delay={80}>
          <span className="block h-10 w-px bg-gradient-to-b from-critical/60 to-lime/60" />
        </Reveal>
        <Reveal delay={140}>
          <Mono className="text-[10px] text-lime">INVESTIGATION REQUIRED</Mono>
        </Reveal>
      </div>
    </div>
  );
}

export function ProblemSection() {
  return (
    <Section
      id="problem"
      label="01 / THE PROBLEM"
      title={
        <>
          THE ALERT
          <br />
          <span className="text-muted-foreground">IS NOT THE INVESTIGATION.</span>
        </>
      }
      lead="Banks already detect suspicious transactions. The analyst still has to reconstruct the story."
    >
      <div className="relative">
        <div className="pointer-events-none absolute left-0 right-0 top-[19px] hidden h-px bg-border lg:block" />
        <ol className="grid grid-cols-3 gap-y-8 sm:grid-cols-5 lg:grid-cols-9 lg:gap-y-0">
          {CHAIN.map((step, i) => (
            <Reveal as="li" key={step} delay={i * 45} className="relative pr-4">
              <div className="mb-4 flex items-center">
                <span
                  className={`h-2.5 w-2.5 rotate-45 border ${
                    i === 0
                      ? "border-critical bg-critical/30"
                      : i === CHAIN.length - 1
                        ? "border-lime bg-lime/30"
                        : "border-border bg-background"
                  }`}
                />
                <span className="h-px flex-1 bg-border lg:hidden" />
              </div>
              <Mono className="block text-[9px] text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </Mono>
              <Mono
                className={`mt-1.5 block text-[10px] leading-relaxed ${
                  i === 0
                    ? "text-critical"
                    : i === CHAIN.length - 1
                      ? "text-lime"
                      : "text-foreground/85"
                }`}
              >
                {step}
              </Mono>
            </Reveal>
          ))}
        </ol>
      </div>

      <Reveal delay={120}>
        <div className="mt-20 border-l border-lime/50 pl-6 md:pl-10">
          <p className="text-[clamp(1.4rem,3vw,2.6rem)] font-semibold uppercase leading-[1.03] tracking-[-0.03em] text-foreground">
            THE DETECTION ENGINE FOUND THE SIGNAL.
          </p>
          <p className="mt-3 text-[clamp(1.4rem,3vw,2.6rem)] font-semibold uppercase leading-[1.03] tracking-[-0.03em] text-lime">
            THE ANALYST STILL HAS TO FIND THE STORY.
          </p>
          <Note>ILLUSTRATIVE WORKFLOW MODEL</Note>
        </div>
      </Reveal>
    </Section>
  );
}

export function SolutionSection() {
  return (
    <Section
      id="solution"
      label="02 / THE SOLUTION"
      title={
        <>
          AN INVESTIGATION LAYER
          <br />
          <span className="text-lime">FOR THE BANK.</span>
        </>
      }
      lead="FRAB sits downstream of existing financial-crime detection systems. It autonomously gathers context, investigates evidence, assesses regulatory risk and prepares decision-ready intelligence for the human analyst."
    >
      <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-center">
        <Reveal>
          <div className="flex flex-col items-center">
            <Node title="BANK" className="w-full max-w-md" />
            <VArrow />
            <Node title="SUSPICIOUS ALERT" tone="critical" className="w-full max-w-md" />
            <VArrow />
            <div className="w-full max-w-md border border-lime/60 bg-lime/[0.06] px-4 py-5 text-center">
              <Mono className="text-sm text-lime">FRAB</Mono>
              <Mono className="mt-1.5 block text-[9px] text-muted-foreground">
                INVESTIGATION LAYER
              </Mono>
            </div>
            <VArrow />
            <div className="grid w-full max-w-md grid-cols-2 gap-px bg-border md:grid-cols-4">
              {["CONTEXT", "EVIDENCE", "NETWORK", "RISK"].map((s) => (
                <div key={s} className="bg-surface px-3 py-4 text-center">
                  <Mono className="text-[9px] text-foreground/80">{s}</Mono>
                </div>
              ))}
            </div>
            <VArrow />
            <Node title="AUDIT-READY CASE" className="w-full max-w-md" />
            <VArrow />
            <Node title="AML ANALYST" tone="lime" className="w-full max-w-md" />
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="flex h-full flex-col justify-center gap-8">
            <blockquote className="border-l border-lime/60 pl-6">
              <p className="text-xl font-medium leading-snug text-foreground md:text-2xl">
                “Detecting an anomaly is not the same as understanding it.”
              </p>
            </blockquote>
            <FlowRow items={["DETECT", "INVESTIGATE", "EXPLAIN", "DECIDE"]} />
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
