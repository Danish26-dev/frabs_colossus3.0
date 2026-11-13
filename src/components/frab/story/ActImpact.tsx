import { motion } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";
import { Mono, SectionLabel } from "../primitives";

/** ACT 07 — two sides, one security layer. */

const CUSTOMERS = [
  "Earlier awareness",
  "Trusted verification",
  "Timely communication",
  "Proactive protection",
];
const BANKS = [
  "Context-rich investigations",
  "Connected beneficiary intelligence",
  "Evidence-backed reports",
  "Coordinated workflows",
];

function Side({
  title,
  items,
  dir,
}: {
  title: string;
  items: string[];
  dir: -1 | 1;
}) {
  const reduced = useReducedMotion();
  return (
    <div>
      <Mono className="text-[11px] text-lime">{title}</Mono>
      <ul className="mt-5 space-y-3">
        {items.map((it, i) => (
          <motion.li
            key={it}
            initial={reduced ? false : { opacity: 0, x: dir * 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-8% 0px" }}
            transition={{ duration: 0.7, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3 border border-border bg-surface/50 px-5 py-4 text-base text-foreground"
          >
            <span className="h-1.5 w-1.5 bg-lime" />
            {it}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

export default function ActImpact() {
  const reduced = useReducedMotion();
  return (
    <section
      id="impact"
      aria-label="Act 07 — two sides, one security layer"
      className="relative scroll-mt-24 border-t border-border"
    >
      <div className="mx-auto max-w-[1440px] px-6 py-24 md:px-14 lg:py-32">
        <SectionLabel>TWO SIDES. ONE SECURITY LAYER.</SectionLabel>
        <h2 className="mt-6 max-w-4xl text-[clamp(1.8rem,3.6vw,3.1rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-foreground">
          Protecting both sides of every{" "}
          <span className="text-lime">financial relationship.</span>
        </h2>

        <div className="mt-16 grid items-center gap-10 lg:grid-cols-[1fr_minmax(180px,240px)_1fr]">
          <Side title="CUSTOMERS" items={CUSTOMERS} dir={-1} />

          {/* FRAB connecting both sides */}
          <div className="relative flex items-center justify-center py-6">
            <div aria-hidden className="absolute left-0 right-0 top-1/2 hidden h-px bg-border lg:block">
              <motion.span
                className="absolute inset-y-0 left-0 h-px w-1/2 origin-right bg-lime"
                initial={reduced ? false : { scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
              />
              <motion.span
                className="absolute inset-y-0 right-0 h-px w-1/2 origin-left bg-lime"
                initial={reduced ? false : { scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <motion.div
              initial={reduced ? false : { scale: 0.6, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 120, damping: 14, delay: 0.3 }}
              className="relative z-10 flex h-28 w-28 items-center justify-center border border-lime bg-background shadow-[0_0_40px_rgba(199,240,0,0.18)]"
              style={{ clipPath: "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)" }}
            >
              <Mono className="text-sm text-lime">FRAB</Mono>
            </motion.div>
          </div>

          <Side title="BANKS" items={BANKS} dir={1} />
        </div>
      </div>
    </section>
  );
}
