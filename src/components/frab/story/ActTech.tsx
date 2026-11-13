import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";
import { useState } from "react";
import { Mono, SectionLabel } from "../primitives";

/**
 * ACT 05 — technology and infrastructure.
 * Statuses follow the real repository:
 *  IMPLEMENTED = running in the demo system today
 *  PROTOTYPED  = built at prototype scope / partially deployed
 *  PLANNED     = designed, NOT deployed (frontend reports "not deployed")
 */

type Status = "IMPLEMENTED" | "PROTOTYPED" | "PLANNED";

const STATUS_STYLE: Record<Status, string> = {
  IMPLEMENTED: "border-lime/60 bg-lime/10 text-lime",
  PROTOTYPED: "border-warning/60 bg-warning/10 text-warning",
  PLANNED: "border-dashed border-muted-foreground/60 text-muted-foreground",
};

function Pill({ s }: { s: Status }) {
  return (
    <span className={`border px-2 py-0.5 font-mono text-[9px] tracking-[0.2em] ${STATUS_STYLE[s]}`}>
      {s}
    </span>
  );
}

interface Layer {
  n: string;
  name: string;
  status: Status;
  inside: boolean; // inside the confidential-VM boundary (prototype)
  what: string;
  role: string;
  note?: string;
}

const LAYERS: Layer[] = [
  {
    n: "01",
    name: "FINANCIAL SIGNAL INGESTION",
    status: "IMPLEMENTED",
    inside: false,
    what: "Synthetic bank: 300 customers, 9,991 transactions, 1,105 beneficiaries and a rule engine that raises alerts across 10 controlled scenarios (PaySim-based).",
    role: "Produces the suspicious alert that starts an investigation.",
    note: "Synthetic data only. No real customer information.",
  },
  {
    n: "02",
    name: "BACKEND API & VALIDATION",
    status: "IMPLEMENTED",
    inside: false,
    what: "FastAPI service for alerts, cases and real-time investigation events, served to the console over HTTP and SSE.",
    role: "Persists the alert, starts the investigation and streams progress to the analyst.",
    note: "Separate service; not part of this frontend repository.",
  },
  {
    n: "03",
    name: "SUPERVISOR ORCHESTRATION",
    status: "IMPLEMENTED",
    inside: true,
    what: "The Supervisor sequences Watchman → Detective → Jurist → Scribe, tracks investigation state and handles partial failures.",
    role: "Controls investigation progression and final case compilation.",
  },
  {
    n: "04",
    name: "MULTI-AGENT INTELLIGENCE",
    status: "IMPLEMENTED",
    inside: true,
    what: "Watchman, Detective, Jurist and Scribe run inside the worker. Call Escalation is delivered by a separate voice service.",
    role: "Each specialist produces its own output for the case.",
    note: "The voice service (Vapi adapter) runs outside the confidential boundary.",
  },
  {
    n: "05",
    name: "DETERMINISTIC ANALYSIS TOOLS",
    status: "IMPLEMENTED",
    inside: true,
    what: "Tools compute amount deviation, velocity, beneficiary novelty, network relationships and risk components.",
    role: "Every number in a case is measured here, never guessed by the model.",
  },
  {
    n: "06",
    name: "AI REASONING — GEMMA",
    status: "IMPLEMENTED",
    inside: true,
    what: "Gemma-2-2B served through vLLM on an NVIDIA L4 GPU. It reasons over the evidence the tools produce.",
    role: "Gemma reasons over evidence; deterministic tools do the measuring.",
    note: "As reported by the console's compute panel.",
  },
  {
    n: "07",
    name: "INVESTIGATION PERSISTENCE",
    status: "IMPLEMENTED",
    inside: false,
    what: "Firestore stores cases, alerts and voice-call records.",
    role: "Keeps the investigation record available to the analyst console.",
    note: "Backend-side. The frontend has no direct probe of Firestore.",
  },
  {
    n: "08",
    name: "EVIDENCE-BACKED OUTPUTS",
    status: "IMPLEMENTED",
    inside: false,
    what: "Case Book, Crime DNA, Money Trace, reasoning chain, audit timeline and an evidence-linked recommendation.",
    role: "The analyst reviews the case and makes the final decision.",
  },
];

const CONFIDENTIAL: { t: string; s: Status; d: string }[] = [
  {
    t: "GCP CONFIDENTIAL VM",
    s: "PROTOTYPED",
    d: "Worker host: 8 vCPU, 32 GB RAM, NVIDIA L4 (24 GB), us-central1-a.",
  },
  {
    t: "REMOTE ATTESTATION",
    s: "PLANNED",
    d: "TEE attestation is not deployed. The console reports it as not connected.",
  },
  {
    t: "ENCRYPTED PROMPT CHANNEL",
    s: "PLANNED",
    d: "Designed, not deployed. No security guarantee is claimed for it today.",
  },
];

export default function ActTech() {
  const reduced = useReducedMotion();
  const [i, setI] = useState(5);
  const cur = LAYERS[i]!;

  return (
    <section
      id="architecture"
      aria-label="Act 05 — technology and infrastructure"
      className="relative scroll-mt-24 border-t border-border"
    >
      <div className="mx-auto max-w-[1440px] px-6 py-24 md:px-14 lg:py-32">
        <SectionLabel>TECHNOLOGY &amp; INFRASTRUCTURE</SectionLabel>
        <h2 className="mt-6 max-w-4xl text-[clamp(1.8rem,3.6vw,3.1rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-foreground">
          Intelligence built on a <span className="text-lime">structured foundation.</span>
        </h2>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
          Gemma reasons over evidence; deterministic tools do the measuring. Select a layer to see
          its role and exactly how far it has been built.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
          {(["IMPLEMENTED", "PROTOTYPED", "PLANNED"] as Status[]).map((s) => (
            <span key={s} className="flex items-center gap-2">
              <Pill s={s} />
            </span>
          ))}
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* layer stack */}
          <div className="relative">
            <ol className="space-y-0">
              {LAYERS.map((l, idx) => {
                const on = idx === i;
                const adjacent = idx === i - 1 || idx === i + 1;
                return (
                  <li key={l.n} className="relative">
                    <button
                      onClick={() => setI(idx)}
                      aria-pressed={on}
                      className={`relative z-10 flex w-full items-center gap-4 border px-4 py-3 text-left transition-colors ${
                        on
                          ? "border-lime bg-lime/10"
                          : "border-border bg-surface/50 hover:border-lime/40"
                      } ${l.inside ? "ml-5 w-[calc(100%-1.25rem)] border-l-[3px] border-l-warning/70" : ""}`}
                    >
                      <Mono className={`text-[10px] ${on ? "text-lime" : "text-muted-foreground"}`}>
                        {l.n}
                      </Mono>
                      <span className="flex-1 font-mono text-[10px] tracking-[0.16em] text-foreground sm:text-[11px]">
                        {l.name}
                      </span>
                      <Pill s={l.status} />
                    </button>
                    {idx < LAYERS.length - 1 ? (
                      <div className="relative flex h-3 justify-center" aria-hidden>
                        <span className={`w-px ${on || adjacent ? "bg-lime" : "bg-border"}`} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <p className="mt-4 border-l-2 border-warning/70 pl-3 font-mono text-[9px] leading-relaxed tracking-[0.16em] text-muted-foreground">
              INDENTED LAYERS 03–06 RUN IN THE WORKER ON THE CONFIDENTIAL VM (PROTOTYPE). BANK FEED, API,
              FIRESTORE, VOICE SERVICE AND THE FRONTEND RUN OUTSIDE IT.
            </p>
          </div>

          {/* detail panel */}
          <div className="space-y-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={cur.n}
                initial={reduced ? false : { opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.3 }}
                className="border border-border bg-surface/60 p-6"
                aria-live="polite"
              >
                <div className="flex items-center justify-between gap-3">
                  <Mono className="text-[10px] text-lime">LAYER {cur.n}</Mono>
                  <Pill s={cur.status} />
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight text-foreground">{cur.name}</h3>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{cur.what}</p>
                <div className="mt-5 border-t border-border pt-4">
                  <Mono className="text-[9px] text-muted-foreground">ROLE IN THE INVESTIGATION</Mono>
                  <p className="mt-1.5 text-[13px] leading-snug text-foreground/90">{cur.role}</p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4">
                  <div>
                    <Mono className="text-[9px] text-muted-foreground">RECEIVES FROM</Mono>
                    <p className="mt-1 font-mono text-[10px] tracking-[0.12em] text-foreground/80">
                      {LAYERS[i - 1]?.name ?? "BANK TRANSACTIONS"}
                    </p>
                  </div>
                  <div>
                    <Mono className="text-[9px] text-muted-foreground">HANDS OFF TO</Mono>
                    <p className="mt-1 font-mono text-[10px] tracking-[0.12em] text-foreground/80">
                      {LAYERS[i + 1]?.name ?? "HUMAN ANALYST DECISION"}
                    </p>
                  </div>
                </div>
                {cur.note ? (
                  <p className="mt-4 font-mono text-[9px] leading-relaxed tracking-[0.16em] text-warning">
                    NOTE: {cur.note.toUpperCase()}
                  </p>
                ) : null}
              </motion.div>
            </AnimatePresence>

            <div className="border border-border bg-surface/40 p-5">
              <Mono className="text-[10px] text-foreground">CONFIDENTIAL COMPUTING — WHERE IT STANDS</Mono>
              <ul className="mt-4 space-y-3">
                {CONFIDENTIAL.map((c) => (
                  <li key={c.t} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div>
                      <p className="font-mono text-[10px] tracking-[0.16em] text-foreground">{c.t}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.d}</p>
                    </div>
                    <Pill s={c.s} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
