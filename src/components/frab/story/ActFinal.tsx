import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";
import { Mono } from "../primitives";

/** ACT 08 — final scene. The network converges, the line lands, the CTA enters the console. */

const RINGS = [90, 170, 250];

export default function ActFinal() {
  const reduced = useReducedMotion();
  const rise = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 28 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-12% 0px" },
          transition: { duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <section
      id="demo"
      aria-label="Act 08 — final call to action"
      className="relative scroll-mt-24 overflow-hidden border-t border-border"
    >
      {/* converging rings */}
      <svg
        aria-hidden
        viewBox="-300 -300 600 600"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[140%] w-auto max-w-none -translate-x-1/2 -translate-y-1/2 opacity-60"
      >
        {RINGS.map((r, i) => (
          <motion.circle
            key={r}
            r={r}
            fill="none"
            stroke="#C7F000"
            strokeOpacity={0.25 - i * 0.05}
            strokeDasharray="2 8"
            initial={reduced ? false : { scale: 1.8, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.6, delay: i * 0.18, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
        {Array.from({ length: 14 }).map((_, i) => {
          const a = (i / 14) * Math.PI * 2;
          const r = RINGS[i % 3]!;
          // rounded so server (Node) and browser render identical attributes
          const rd = (n: number) => Math.round(n * 100) / 100;
          const cx = rd(Math.cos(a) * r);
          const cy = rd(Math.sin(a) * r);
          return (
            <motion.circle
              key={i}
              cx={cx}
              cy={cy}
              r={3}
              fill="#C7F000"
              initial={reduced ? false : { cx: rd(Math.cos(a) * 340), cy: rd(Math.sin(a) * 340), opacity: 0 }}
              whileInView={{ cx, cy, opacity: 0.9 }}
              viewport={{ once: true }}
              transition={{ duration: 1.5, delay: 0.1 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            />
          );
        })}
      </svg>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/55 to-background/20" />

      <div className="relative mx-auto max-w-[1440px] px-6 py-32 md:px-14 lg:py-44">
        <motion.p
          {...rise(0)}
          className="font-mono text-[11px] tracking-[0.34em] text-lime md:text-xs"
        >
          MOVE BEYOND REACTIVE PROTECTION
        </motion.p>
        <motion.h2
          {...rise(0.15)}
          className="mt-6 max-w-4xl text-[clamp(1.9rem,4.6vw,3.8rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-foreground"
        >
          Don't make customers the first line of fraud detection.
        </motion.h2>
        <motion.p
          {...rise(0.6)}
          className="mt-6 max-w-4xl text-[clamp(1.9rem,4.6vw,3.8rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-lime"
        >
          Make the financial system their first line of protection.
        </motion.p>
        <motion.p
          {...rise(0.9)}
          className="mt-8 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg"
        >
          Build a financial ecosystem where intelligence moves faster, investigations become
          smarter, and protection becomes proactive.
        </motion.p>

        <motion.div {...rise(1.05)} className="mt-12 flex flex-wrap gap-4">
          <Link
            to="/overview"
            className="group inline-flex items-center gap-3 bg-lime px-7 py-4 font-mono text-[11px] tracking-[0.24em] text-background transition-opacity hover:opacity-85"
          >
            EXPLORE FRAB
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
          <Link
            to="/workspace"
            className="inline-flex items-center gap-3 border border-border px-7 py-4 font-mono text-[11px] tracking-[0.24em] text-foreground/80 transition-colors hover:border-lime/60 hover:text-lime"
          >
            OPEN INVESTIGATION WORKSPACE
          </Link>
        </motion.div>

        <motion.div {...rise(1.1)} className="mt-20 border-t border-border pt-8">
          <Mono className="block text-sm text-lime">FRAB</Mono>
          <Mono className="mt-2 block text-[10px] text-foreground">
            FRAUD RESPONSE &amp; AUTONOMOUS BACKBONE
          </Mono>
          <p className="mt-3 max-w-md text-xs leading-relaxed text-muted-foreground">
            Moving Financial Security from Reactive Protection to Proactive Prevention.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
