import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";
import { useRef, useState } from "react";
import { SectionLabel } from "../primitives";
import Aarav, { type AaravMood } from "./Aarav";

/** ACT 01 — the human problem. Scroll drives Aarav's mood, the notification and the money trail. */

const STAGES: { mood: AaravMood; caption: string }[] = [
  { mood: "calm", caption: "Aarav is going about his day." },
  { mood: "shocked", caption: "A banking notification arrives: ₹48,500 transferred successfully." },
  { mood: "shocked", caption: "Aarav did not initiate it. The money is already moving." },
  { mood: "worried", caption: "It passes through accounts he has never seen." },
  {
    mood: "worried",
    caption: "Aarav tries to understand what happened. The bank has signals, not yet a story.",
  },
];

// network geometry (viewBox 0 0 480 360)
const N = {
  A: { x: 64, y: 190, label: "AARAV'S ACCOUNT" },
  B: { x: 176, y: 96, label: "NEW BENEFICIARY" },
  D: { x: 306, y: 148, label: "UNFAMILIAR ACCOUNT" },
  E: { x: 408, y: 236, label: "ONWARD ACCOUNT" },
  C: { x: 214, y: 270, label: "" },
  F: { x: 392, y: 70, label: "" },
  G: { x: 120, y: 318, label: "" },
};
const ROUTE = [N.A, N.B, N.D, N.E];
const DECOY: [keyof typeof N, keyof typeof N][] = [["A", "C"], ["C", "D"], ["B", "F"], ["D", "F"], ["A", "G"], ["G", "C"], ["C", "E"]];

function Hotspot({
  at,
  p,
  from,
  tone,
  label,
  dx = 0,
  dy = 24,
  anchor = "middle",
}: {
  at: { x: number; y: number };
  p: MotionValue<number>;
  from: number;
  tone: string;
  label?: string;
  dx?: number;
  dy?: number;
  anchor?: "start" | "middle" | "end";
}) {
  const lit = useTransform(p, [from, from + 0.05], [0, 1]);
  const r = useTransform(lit, [0, 1], [5, 11]);
  return (
    <g>
      <motion.circle cx={at.x} cy={at.y} r={r} fill={tone} style={{ opacity: lit }} />
      <circle cx={at.x} cy={at.y} r={6} fill="#1D211C" stroke="#59624F" strokeWidth={1.5} />
      <motion.circle cx={at.x} cy={at.y} r={3.4} fill={tone} style={{ opacity: lit }} />
      {label ? (
        <motion.text
          x={at.x + dx}
          y={at.y + dy}
          textAnchor={anchor}
          fontSize={9.5}
          letterSpacing="0.14em"
          fill="#B0B6AA"
          style={{ opacity: lit, fontFamily: "var(--font-mono)" }}
        >
          {label}
        </motion.text>
      ) : null}
    </g>
  );
}

export default function ActHumanProblem() {
  const ref = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [stage, setStage] = useState(0);

  useMotionValueEvent(p, "change", (v) => {
    const s = v < 0.1 ? 0 : v < 0.28 ? 1 : v < 0.5 ? 2 : v < 0.75 ? 3 : 4;
    setStage((prev) => (prev === s ? prev : s));
  });

  // path progress along A -> B -> D -> E
  const trail = useTransform(p, [0.3, 0.72], [0, 1], { clamp: true });
  const dotX = useTransform(trail, [0, 1 / 3, 2 / 3, 1], ROUTE.map((r) => r.x));
  const dotY = useTransform(trail, [0, 1 / 3, 2 / 3, 1], ROUTE.map((r) => r.y));
  const labelY = useTransform(dotY, (y) => y - 26);
  const dotOpacity = useTransform(p, [0.28, 0.32, 0.9, 0.98], [0, 1, 1, 0.6]);
  const bar = useTransform(p, [0, 1], ["0%", "100%"]);
  const routeD = `M${ROUTE.map((r) => `${r.x} ${r.y}`).join(" L")}`;
  const cur = STAGES[stage]!;

  return (
    <section
      id="problem"
      ref={ref}
      aria-label="Act 01 — the human problem"
      className="relative h-[340vh] scroll-mt-0 border-t border-border"
    >
      <div className="sticky top-0 flex h-svh flex-col overflow-hidden px-6 pb-6 pt-20 md:px-14 md:pt-24">
        <div aria-hidden className="frab-grid pointer-events-none absolute inset-0 opacity-[0.10]" />
        <div className="relative mx-auto w-full max-w-[1440px]">
          <SectionLabel>THE HUMAN PROBLEM</SectionLabel>
          <h2 className="mt-4 max-w-3xl text-[clamp(1.5rem,3.6vw,3.1rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-foreground">
            Fraud moves fast. <span className="text-lime">Understanding it takes time.</span>
          </h2>
        </div>

        <div className="relative mx-auto mt-3 grid min-h-0 w-full max-w-[1440px] flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-2 lg:mt-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:grid-rows-1 lg:gap-10">
          {/* Aarav + phone notification */}
          <div className="relative flex min-h-0 items-end justify-center">
            <Aarav
              mood={cur.mood}
              lookAtPhone={stage >= 1}
              phoneLit={stage >= 1}
              className="h-full max-h-[56svh] w-auto drop-shadow-[0_0_40px_rgba(199,240,0,0.08)]"
            />
            <AnimatePresence>
              {stage >= 1 ? (
                <motion.div
                  key="notif"
                  initial={reduced ? false : { opacity: 0, y: -14, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 160, damping: 18 }}
                  className="absolute bottom-[14%] left-0 w-[138px] border border-critical/60 bg-surface/95 px-2.5 py-2 shadow-[0_0_30px_rgba(255,74,66,0.18)] backdrop-blur-sm sm:bottom-auto sm:left-auto sm:right-[6%] sm:top-2 sm:w-[205px] sm:px-3.5 sm:py-3 md:w-[230px] lg:right-0"
                  role="status"
                >
                  <p className="flex items-center gap-2 font-mono text-[9px] tracking-[0.24em] text-muted-foreground">
                    <span className="frab-dot h-1.5 w-1.5 rounded-full bg-critical" />
                    BANK NOTIFICATION
                  </p>
                  <p className="mt-1.5 text-[11px] font-medium leading-snug text-foreground sm:text-[13px]">
                    ₹48,500 transferred successfully.
                  </p>
                  <p className="mt-1 font-mono text-[9px] tracking-[0.18em] text-critical">
                    {stage >= 2 ? "NOT INITIATED BY CUSTOMER" : "TO A NEW BENEFICIARY"}
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* transaction pathway */}
          <div className="relative min-h-0">
            <svg
              viewBox="0 0 480 360"
              role="img"
              aria-label="A transaction moving from Aarav's account through connected accounts"
              className="h-full w-full"
            >
              {DECOY.map(([a, b]) => (
                <line key={a + b} x1={N[a].x} y1={N[a].y} x2={N[b].x} y2={N[b].y} stroke="#3A4036" strokeWidth={1} />
              ))}
              <path d={routeD} fill="none" stroke="#3A4036" strokeWidth={1.5} strokeDasharray="3 5" />
              <motion.path
                d={routeD}
                fill="none"
                stroke="#FF4A42"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pathLength: reduced ? 1 : trail }}
              />
              <Hotspot at={N.A} p={p} from={0.04} tone="#C7F000" label={N.A.label} />
              <Hotspot at={N.B} p={p} from={0.36} tone="#FF4A42" label={N.B.label} dx={-14} dy={-12} anchor="end" />
              <Hotspot at={N.D} p={p} from={0.52} tone="#FF4A42" label={N.D.label} dx={-14} dy={26} anchor="end" />
              <Hotspot at={N.E} p={p} from={0.68} tone="#FF4A42" label={N.E.label} dy={26} />
              {(["C", "F", "G"] as const).map((k, i) => (
                <Hotspot key={k} at={N[k]} p={p} from={0.6 + i * 0.07} tone="#FFB020" />
              ))}
              <motion.g style={{ opacity: dotOpacity }}>
                <motion.circle r={14} fill="#FF4A42" opacity={0.2} cx={dotX} cy={dotY} />
                <motion.circle r={5} fill="#FF4A42" cx={dotX} cy={dotY} />
                <motion.text
                  x={dotX}
                  y={labelY}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#FF8A84"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  ₹48,500
                </motion.text>
              </motion.g>
            </svg>
          </div>
        </div>

        {/* caption + progress */}
        <div className="relative mx-auto mt-2 w-full max-w-[1440px]">
          <div className="h-px w-full bg-border">
            <motion.div className="h-px bg-lime" style={{ width: reduced ? "100%" : bar }} />
          </div>
          <div className="mt-3 flex items-start gap-4">
            <span className="mt-0.5 font-mono text-[10px] tracking-[0.3em] text-lime">
              0{stage + 1}/05
            </span>
            <AnimatePresence mode="wait">
              <motion.p
                key={stage}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
                aria-live="polite"
                className="max-w-3xl text-[0.95rem] leading-snug text-foreground md:text-lg"
              >
                {cur.caption}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
