import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useReducedMotion } from "./story/useReducedMotion";
import { useQuery } from "@tanstack/react-query";
import { Fragment, Suspense, lazy, useEffect, useRef, useState } from "react";
import { IS_LIVE_BACKEND } from "../../lib/frab-api";
import { backendGet, type RawTxnPage } from "../../lib/frab-backend";

const HeroScene = lazy(() => import("./story/HeroScene"));

type Metric = { value: string; label: string; live?: boolean };

// Static fallbacks. TRANSACTIONS is replaced by the live ledger total when the backend answers.
const METRICS: Metric[] = [
  { value: "10", label: "DEMO SCENARIOS" },
  { value: "9,991", label: "TRANSACTIONS" },
  { value: "300", label: "CUSTOMER PROFILES" },
  { value: "6", label: "COORDINATED AGENTS" },
  { value: "GEMMA-2-2B", label: "REASONING VIA vLLM" },
];

const HEADLINE: { w: string; lime?: boolean }[] = [
  { w: "Financial" },
  { w: "Security" },
  { w: "Shouldn't" },
  { w: "Begin" },
  { w: "After", lime: true },
  { w: "Fraud.", lime: true },
];

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function Hero() {
  const reduced = !!useReducedMotion();
  const ref = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [visible, setVisible] = useState(true);
  const [low, setLow] = useState(false);

  // One tiny request: the live ledger size from the bank API (limit=1 returns just the total).
  const ledger = useQuery({
    queryKey: ["landing-ledger-total"],
    queryFn: () => backendGet<RawTxnPage>("/transactions/all?limit=1"),
    enabled: IS_LIVE_BACKEND,
    staleTime: 60_000,
    retry: 1,
  });
  const metrics: Metric[] = METRICS.map((m) =>
    m.label === "TRANSACTIONS" && typeof ledger.data?.total === "number"
      ? { ...m, value: ledger.data.total.toLocaleString("en-US"), live: true }
      : m,
  );

  useEffect(() => {
    setMounted(true);
    setWebgl(hasWebGL());
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setLow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // pause rendering when the hero is off-screen
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const fade = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <section
      ref={ref}
      aria-label="FRAB — Fraud Response & Autonomous Backbone"
      className="relative min-h-[100svh] w-full overflow-hidden bg-background"
    >
      {/* environment */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="frab-grid absolute inset-0 opacity-[0.16]" />
        <div
          className="absolute right-[-10%] top-1/2 h-[70vmin] w-[70vmin] -translate-y-1/2 rounded-full opacity-[0.16] blur-3xl"
          style={{ background: "radial-gradient(circle, var(--lime) 0%, transparent 62%)" }}
        />
      </div>

      {/* 3D financial network — full bleed, lazy, paused off-screen */}
      <div className="absolute inset-0" aria-hidden>
        {mounted && webgl ? (
          <Suspense fallback={null}>
            <HeroScene paused={!visible} low={low} reduced={reduced} />
          </Suspense>
        ) : null}
      </div>
      {/* keeps text readable over the scene */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/75 to-transparent md:via-background/60"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent"
      />

      <div className="relative mx-auto flex min-h-[100svh] max-w-[1440px] flex-col justify-center px-6 pb-36 pt-28 md:px-14">
        <motion.div {...fade(0.1)} className="max-w-2xl border-l border-lime/60 pl-4">
          <p className="font-mono text-[10px] tracking-[0.34em] text-lime">
            FRAUD RESPONSE &amp; AUTONOMOUS BACKBONE
          </p>
          <p className="mt-1.5 font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
            AUTONOMOUS INVESTIGATION
          </p>
        </motion.div>

        <h1 className="mt-9 max-w-3xl text-[clamp(2.3rem,6.2vw,5.2rem)] font-semibold leading-[0.95] tracking-[-0.04em] text-foreground">
          {HEADLINE.map((h, i) => (
            <Fragment key={h.w}>
              <span className="inline-block overflow-hidden pb-[0.08em] align-bottom">
                <motion.span
                  className={`inline-block ${h.lime ? "frab-shimmer" : ""}`}
                  initial={reduced ? false : { y: "110%" }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.85, delay: 0.7 + i * 0.09, ease: [0.16, 1, 0.3, 1] }}
                >
                  {h.w}
                </motion.span>
              </span>{" "}
            </Fragment>
          ))}
        </h1>

        <motion.p
          {...fade(1.5)}
          className="mt-7 max-w-xl font-mono text-[11px] leading-relaxed tracking-[0.12em] text-lime"
        >
          Moving Financial Security from Reactive Protection to Proactive Prevention.
        </motion.p>

        <motion.p
          {...fade(1.65)}
          className="mt-4 max-w-xl text-[0.98rem] leading-relaxed text-muted-foreground"
        >
          Financial threats evolve faster than traditional response systems. FRAB connects
          intelligence, autonomous investigation, and coordinated protection to help financial
          institutions identify and respond to threats proactively.
        </motion.p>

        <motion.div
          {...fade(1.85)}
          className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <Link
            to="/overview"
            className="group inline-flex items-center justify-center gap-3 bg-lime px-7 py-4 whitespace-nowrap font-mono text-[11px] font-medium tracking-[0.2em] text-background transition-colors duration-300 hover:bg-green"
          >
            [ EXPLORE FRAB ]
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center justify-center gap-3 border border-border bg-background/40 px-7 py-4 whitespace-nowrap font-mono text-[11px] tracking-[0.2em] text-foreground backdrop-blur-sm transition-colors duration-300 hover:border-lime/60 hover:text-lime"
          >
            [ SEE HOW IT WORKS ]
          </a>
        </motion.div>

        <motion.div {...fade(2.05)} className="mt-14 max-w-3xl border-t border-border pt-6">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-4">
            {metrics.map((m) => (
              <div key={m.label} className="border-l border-border/80 pl-3">
                <dt className="flex items-center gap-1.5 font-mono text-[14px] leading-none text-bone">
                  {m.value}
                  {m.live ? (
                    <span
                      title="Live from the bank API"
                      aria-label="Live from the bank API"
                      className="frab-dot inline-block h-1.5 w-1.5 rounded-full bg-lime"
                    />
                  ) : null}
                </dt>
                <dd className="mt-2 font-mono text-[9px] leading-[1.5] tracking-[0.18em] text-muted-foreground">
                  {m.label}
                </dd>
              </div>
            ))}
          </dl>
        </motion.div>
      </div>

      {/* scene legend */}
      <motion.div
        {...fade(2.4)}
        aria-hidden
        className="pointer-events-none absolute bottom-24 right-6 hidden flex-col gap-1.5 font-mono text-[9px] tracking-[0.22em] text-muted-foreground md:flex md:right-14"
      >
        <span className="flex items-center gap-2"><i className="h-1.5 w-1.5 rounded-full bg-lime" />TRANSACTION FLOW</span>
        <span className="flex items-center gap-2"><i className="h-1.5 w-1.5 rounded-full bg-critical" />SUSPICIOUS PATHWAY</span>
        <span className="flex items-center gap-2"><i className="h-1.5 w-1.5 rotate-45 border border-lime" />FRAB INTELLIGENCE LAYER</span>
      </motion.div>

      {/* scroll indicator */}
      <motion.a
        {...fade(2.6)}
        href="#problem"
        aria-label="Scroll to the story"
        className="absolute bottom-8 left-6 flex items-center gap-3 font-mono text-[9px] tracking-[0.3em] text-muted-foreground transition-colors hover:text-lime md:left-14"
      >
        <span className="relative block h-9 w-px overflow-hidden bg-border">
          <span className="frab-flow absolute inset-x-0 top-0 h-3 bg-lime" />
        </span>
        SCROLL
      </motion.a>
    </section>
  );
}
