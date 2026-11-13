import { motion, useInView } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";
import { useEffect, useRef, useState } from "react";
import { Mono, SectionLabel } from "../primitives";

/** ACT 06 — security and trust. Statuses match the repository (see ActTech). */

type Status = "IMPLEMENTED" | "PROTOTYPED" | "PLANNED";

const STATUS: Record<Status, string> = {
  IMPLEMENTED: "border-lime/60 bg-lime/10 text-lime",
  PROTOTYPED: "border-warning/60 bg-warning/10 text-warning",
  PLANNED: "border-dashed border-muted-foreground/60 text-muted-foreground",
};

const ENVS: { t: string; s: Status; d: string; extra?: string }[] = [
  {
    t: "PRIVATE INFERENCE",
    s: "PROTOTYPED",
    d: "The model call is served by 0G Private Computer in Private trust mode, which the provider runs in TEE enclaves. The worker, tools and storage run on Cloud Run and Firestore, outside that boundary.",
    extra: "FRAB does not verify enclave attestation itself yet. That check is planned.",
  },
  {
    t: "CONTROLLED ACCESS",
    s: "IMPLEMENTED",
    d: "The console's investigation workspace opens only while a case is active. The worker and voice APIs reject requests without a shared token (a deterrent, not a user login), and the voice provider key stays server-side.",
  },
  {
    t: "EVIDENCE & AUDITABILITY",
    s: "IMPLEMENTED",
    d: "Recommendations link to collected evidence, with a full agent trace and audit timeline in the Case Book.",
  },
  {
    t: "HUMAN OVERSIGHT",
    s: "IMPLEMENTED",
    d: "FRAB recommends escalate, monitor or close. The analyst makes the final call.",
  },
];

const FLOW = [
  "AI INVESTIGATION",
  "EVIDENCE",
  "RECOMMENDATION",
  "AUTHORISED BANK DECISION",
  "PROTECTIVE ACTION",
];

export default function ActTrust() {
  const reduced = useReducedMotion();
  const flowRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(flowRef, { margin: "-15% 0px" });
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduced || !inView) return;
    const id = setInterval(() => setActive((a) => (a + 1) % FLOW.length), 1500);
    return () => clearInterval(id);
  }, [reduced, inView]);

  return (
    <section
      id="trust"
      aria-label="Act 06 — security and trust"
      className="relative scroll-mt-24 border-t border-border"
    >
      <div className="mx-auto max-w-[1440px] px-6 py-24 md:px-14 lg:py-32">
        <SectionLabel>SECURITY &amp; TRUST</SectionLabel>
        <h2 className="mt-6 max-w-4xl text-[clamp(1.8rem,3.6vw,3.1rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-foreground">
          Financial intelligence needs a <span className="text-lime">foundation of trust.</span>
        </h2>

        <div className="mt-14 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {ENVS.map((e, i) => (
            <motion.div
              key={e.t}
              initial={reduced ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-8% 0px" }}
              transition={{ duration: 0.7, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col bg-background p-6"
            >
              <div className="flex items-center justify-between gap-2">
                <Mono className="text-[11px] text-lime">0{i + 1}</Mono>
                <span className={`border px-2 py-0.5 font-mono text-[9px] tracking-[0.2em] ${STATUS[e.s]}`}>
                  {e.s}
                </span>
              </div>
              <h3 className="mt-5 font-mono text-[12px] tracking-[0.18em] text-foreground">{e.t}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{e.d}</p>
              {e.extra ? (
                <p className="mt-3 font-mono text-[9px] leading-relaxed tracking-[0.14em] text-warning">
                  {e.extra.toUpperCase()}
                </p>
              ) : null}
            </motion.div>
          ))}
        </div>

        {/* controlled investigation stages */}
        <div ref={flowRef} className="mt-16">
          <Mono className="text-[10px] text-muted-foreground">HOW INFORMATION MOVES</Mono>
          <ol className="mt-5 grid gap-3 md:grid-cols-5">
            {FLOW.map((f, i) => {
              const on = i === active;
              const gate = i >= 3;
              return (
                <li
                  key={f}
                  className={`relative border px-4 py-4 transition-all duration-500 ${
                    on
                      ? "border-lime bg-lime/10 shadow-[0_0_24px_rgba(199,240,0,0.12)]"
                      : gate
                        ? "border-warning/40 bg-surface/40"
                        : "border-border bg-surface/40"
                  }`}
                >
                  <Mono className={`text-[9px] ${on ? "text-lime" : "text-muted-foreground"}`}>
                    0{i + 1}
                  </Mono>
                  <p className="mt-2 font-mono text-[10px] leading-snug tracking-[0.14em] text-foreground">
                    {f}
                  </p>
                  {i === 3 ? (
                    <span className="mt-3 inline-block border border-warning/50 px-1.5 py-0.5 font-mono text-[8px] tracking-[0.2em] text-warning">
                      BANK AUTHORITY
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <p className="mt-8 max-w-3xl text-base leading-relaxed text-foreground md:text-lg">
            FRAB supports bank decisions. It does not independently freeze accounts or reverse
            settled transfers.
          </p>
          <p className="mt-3 font-mono text-[9px] leading-relaxed tracking-[0.18em] text-muted-foreground">
            THE TEMPORARY-PROTECTION FLOW SHOWN IN THE CONSOLE (CASE0007) IS A SCRIPTED DEMONSTRATION.
          </p>
        </div>
      </div>
    </section>
  );
}
