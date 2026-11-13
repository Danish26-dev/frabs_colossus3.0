import { motion, useScroll, useTransform } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";
import { useRef } from "react";
import { Mono, SectionLabel } from "../primitives";

/** ACT 02 — the systemic gap. Two separate worlds that scroll progressively connects. */

const CUSTOMER = [
  "Receives an alert",
  "Recognises suspicious activity",
  "Reports the fraud",
  "Waits for assistance",
];
const BANK = [
  "Receives transaction signals",
  "Reviews alerts",
  "Gathers evidence",
  "Traces beneficiaries",
  "Investigates the case",
];

function Column({
  side,
  title,
  items,
  align,
}: {
  side: string;
  title: string;
  items: string[];
  align: "left" | "right";
}) {
  const reduced = useReducedMotion();
  return (
    <div className={align === "right" ? "lg:text-right" : ""}>
      <Mono className="text-[10px] text-lime">{side}</Mono>
      <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{title}</h3>
      <ul className="mt-6 space-y-2.5">
        {items.map((it, i) => (
          <motion.li
            key={it}
            initial={reduced ? false : { opacity: 0, x: align === "left" ? -24 : 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.6, delay: i * 0.09, ease: [0.16, 1, 0.3, 1] }}
            className={`flex items-center gap-3 border border-border bg-surface/50 px-4 py-3 text-sm text-foreground/90 ${
              align === "right" ? "lg:flex-row-reverse" : ""
            }`}
          >
            <span className="font-mono text-[10px] text-muted-foreground">0{i + 1}</span>
            {it}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

export default function ActGap() {
  const ref = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start 75%", "end 45%"] });
  const fill = useTransform(p, [0.1, 0.85], ["0%", "100%"]);
  const fillScale = useTransform(p, [0.1, 0.85], [0, 1]);
  const gapOpacity = useTransform(p, [0.1, 0.8], [1, 0]);
  const joined = useTransform(p, [0.8, 0.95], [0, 1]);

  return (
    <section
      id="gap"
      ref={ref}
      aria-label="Act 02 — the systemic gap"
      className="relative scroll-mt-24 border-t border-border"
    >
      <div className="mx-auto max-w-[1440px] px-6 py-24 md:px-14 lg:py-32">
        <SectionLabel>THE SYSTEMIC GAP</SectionLabel>
        <h2 className="mt-6 max-w-4xl text-[clamp(1.8rem,3.6vw,3.1rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-foreground">
          The problem is bigger than a <span className="text-lime">suspicious transaction.</span>
        </h2>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
          Financial security often depends on customers reporting problems and banks connecting
          fragmented information. The challenge is not a lack of capability. It is a workflow that
          is fragmented and reactive.
        </p>

        <div className="relative mt-16 grid gap-10 lg:grid-cols-[1fr_minmax(150px,200px)_1fr] lg:gap-6">
          <Column side="CUSTOMER" title="Experiences it first" items={CUSTOMER} align="right" />

          {/* the gap */}
          <div className="relative flex min-h-[220px] flex-col items-center justify-between py-2 lg:min-h-0">
            <Mono className="text-center text-[9px] leading-relaxed text-critical">
              SUSPICIOUS ACTIVITY
              <br />
              DETECTED
            </Mono>

            <div className="relative my-4 flex w-full flex-1 items-center justify-center">
              {/* horizontal bridge (desktop) */}
              <div className="relative hidden h-px w-full bg-border lg:block">
                <motion.div
                  className="absolute inset-y-0 left-0 h-px bg-lime"
                  style={{ width: reduced ? "100%" : fill }}
                />
                <motion.span
                  className="absolute -top-[5px] h-[11px] w-[11px] rotate-45 border border-lime bg-background"
                  style={{ left: reduced ? "100%" : fill }}
                />
              </div>
              {/* vertical bridge (mobile) */}
              <div className="relative h-24 w-px bg-border lg:hidden">
                <motion.div
                  className="absolute inset-x-0 top-0 w-px origin-top bg-lime"
                  style={{ height: "100%", scaleY: reduced ? 1 : fillScale }}
                />
              </div>
              <motion.div
                className="absolute inset-0 hidden items-center justify-center lg:flex"
                style={{ opacity: gapOpacity }}
                aria-hidden
              >
                <span className="bg-background px-2 font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
                  GAP
                </span>
              </motion.div>
              <motion.div
                className="absolute inset-0 hidden items-center justify-center lg:flex"
                style={{ opacity: reduced ? 1 : joined }}
                aria-hidden
              >
                <span className="bg-background px-2 font-mono text-[10px] tracking-[0.3em] text-lime">
                  CONNECTED
                </span>
              </motion.div>
            </div>

            <Mono className="text-center text-[9px] leading-relaxed text-lime">
              THREAT UNDERSTOOD
              <br />
              AND RESPONSE COORDINATED
            </Mono>
          </div>

          <Column side="BANK" title="Pieces the story together" items={BANK} align="left" />
        </div>
      </div>
    </section>
  );
}
