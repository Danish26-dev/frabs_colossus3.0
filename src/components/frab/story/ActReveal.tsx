import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";
import { useEffect, useMemo, useRef } from "react";
import { Mono, SectionLabel } from "../primitives";

/**
 * ACT 03 — the FRAB reveal. A scattered set of financial signals converges
 * (GSAP ScrollTrigger, scrubbed) into one coordinated network around FRAB.
 */

const W = 800;
const H = 460;
const HUB = { x: 400, y: 230 };

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type P = { x: number; y: number };

function build() {
  const rnd = mulberry(913);
  const target: P[] = [];
  const ring = (n: number, rx: number, ry: number, off: number) => {
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      // rounded: Math.cos/sin differ in the last digit between Node and browsers (hydration)
      target.push({
        x: Math.round((HUB.x + Math.cos(a) * rx) * 100) / 100,
        y: Math.round((HUB.y + Math.sin(a) * ry) * 100) / 100,
      });
    }
  };
  ring(8, 130, 82, -0.3); // inner (0-7)
  ring(14, 300, 180, 0.1); // outer (8-21)
  const start: P[] = target.map(() => ({
    x: Math.round((30 + rnd() * (W - 60)) * 100) / 100,
    y: Math.round((24 + rnd() * (H - 48)) * 100) / 100,
  }));
  const links: [number, number][] = [];
  for (let i = 0; i < 8; i++) links.push([i, i === 7 ? 0 : i + 1]); // inner ring
  for (let o = 8; o < 22; o++) {
    // each outer node attaches to its nearest inner node
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < 8; i++) {
      const to = target[o]!;
      const ti = target[i]!;
      const d = Math.hypot(to.x - ti.x, to.y - ti.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    links.push([o, best]);
  }
  return { target, start, links };
}

const PILLARS = [
  {
    n: "01",
    t: "PROACTIVE INTELLIGENCE",
    d: "Understand suspicious behaviour and financial signals.",
  },
  {
    n: "02",
    t: "AUTONOMOUS INVESTIGATION",
    d: "Connect evidence, beneficiaries, transactions and compliance context.",
  },
  {
    n: "03",
    t: "COORDINATED PROTECTION",
    d: "Support customer verification, investigation reporting and authorised protective responses.",
  },
];

export default function ActReveal() {
  const reduced = useReducedMotion();
  const root = useRef<HTMLElement | null>(null);
  const { target, start, links } = useMemo(build, []);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      const nodes = gsap.utils.toArray<SVGCircleElement>("[data-node]");
      if (reduced) {
        nodes.forEach((n, i) => {
          const t = target[i % target.length]!;
          gsap.set(n, { attr: { cx: t.x, cy: t.y } });
        });
        gsap.set("[data-link]", { strokeDashoffset: 0, opacity: 0.6 });
        gsap.set("[data-hub]", { opacity: 1 });
        gsap.set("[data-rel]", { opacity: 1 });
        return;
      }
      const tl = gsap.timeline({
        defaults: { ease: "power2.inOut" },
        scrollTrigger: {
          trigger: "[data-stage]",
          start: "top 80%",
          end: "bottom 45%",
          scrub: 0.7,
        },
      });
      tl.to(nodes, {
        attr: {
          cx: (i: number) => target[i % target.length]!.x,
          cy: (i: number) => target[i % target.length]!.y,
        },
        duration: 0.55,
        stagger: { each: 0.008, from: "random" },
      })
        .to(
          "[data-node-inner]",
          { attr: { fill: "#C7F000" }, duration: 0.2, stagger: 0.015 },
          0.35,
        )
        .to("[data-link]", { strokeDashoffset: 0, opacity: 0.6, duration: 0.3, stagger: 0.01 }, 0.5)
        .fromTo(
          "[data-hub]",
          { opacity: 0, scale: 0.2, svgOrigin: `${HUB.x} ${HUB.y}` },
          { opacity: 1, scale: 1, svgOrigin: `${HUB.x} ${HUB.y}`, duration: 0.25 },
          0.7,
        )
        .to("[data-rel]", { opacity: 1, duration: 0.15, stagger: 0.04 }, 0.82);
    }, root);
    return () => ctx.revert();
  }, [reduced, target]);

  return (
    <section
      id="solution"
      ref={root}
      aria-label="Act 03 — meet FRAB"
      className="relative scroll-mt-24 border-t border-border"
    >
      <div className="mx-auto max-w-[1440px] px-6 py-24 md:px-14 lg:py-32">
        <SectionLabel>THE REVEAL</SectionLabel>
        <h2 className="mt-6 text-[clamp(2.6rem,8vw,6.5rem)] font-semibold leading-[0.9] tracking-[-0.05em] text-foreground">
          Meet <span className="text-lime">FRAB.</span>
        </h2>
        <p className="mt-4 font-mono text-[11px] tracking-[0.3em] text-lime md:text-xs">
          FRAUD RESPONSE &amp; AUTONOMOUS BACKBONE
        </p>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          An autonomous financial-security backbone designed to connect detection, investigation,
          intelligence, and coordinated response.
        </p>

        <div
          data-stage
          className="relative mt-14 border border-border/70 bg-surface/30 lg:mt-20"
        >
          <div className="pointer-events-none absolute left-3 top-3 font-mono text-[9px] tracking-[0.26em] text-muted-foreground">
            SCROLL: SIGNALS → COORDINATED NETWORK
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Scattered financial signals converging into a coordinated network around FRAB"
            className="h-auto w-full"
          >
            {links.map(([a, b], i) => (
              <line
                key={i}
                data-link
                x1={target[a]!.x}
                y1={target[a]!.y}
                x2={target[b]!.x}
                y2={target[b]!.y}
                stroke="#C7F000"
                strokeWidth={1}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1}
                opacity={0}
              />
            ))}
            {target.slice(0, 8).map((t, i) => (
              <line
                key={`s${i}`}
                data-link
                x1={HUB.x}
                y1={HUB.y}
                x2={t.x}
                y2={t.y}
                stroke="#C7F000"
                strokeWidth={1.2}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1}
                opacity={0}
              />
            ))}
            {start.map((s, i) => (
              <g key={i}>
                <circle data-node cx={s.x} cy={s.y} r={i < 8 ? 6 : 4.5} fill="#1D211C" stroke="#59624F" strokeWidth={1.4} />
              </g>
            ))}
            {/* inner-ring "lit" cores are drawn over the moving nodes */}
            {start.slice(0, 8).map((s, i) => (
              <circle
                key={`c${i}`}
                data-node
                data-node-inner
                cx={s.x}
                cy={s.y}
                r={2.6}
                fill="#59624F"
              />
            ))}
            {/* beneficiary relationship tags */}
            {[1, 4, 6].map((i, k) => (
              <text
                key={i}
                data-rel
                x={target[i]!.x}
                y={target[i]!.y - 14}
                textAnchor="middle"
                fontSize={9}
                letterSpacing="0.16em"
                fill="#C7F000"
                opacity={0}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {["BENEFICIARY LINK", "LINKED ACCOUNT", "TRACED FLOW"][k]}
              </text>
            ))}
            <g data-hub style={{ opacity: 0 }}>
              <circle cx={HUB.x} cy={HUB.y} r={34} fill="#C7F000" opacity={0.14} />
              <polygon
                points={`${HUB.x},${HUB.y - 26} ${HUB.x + 24},${HUB.y - 6} ${HUB.x + 15},${HUB.y + 22} ${HUB.x - 15},${HUB.y + 22} ${HUB.x - 24},${HUB.y - 6}`}
                fill="#0A0C07"
                stroke="#C7F000"
                strokeWidth={1.8}
              />
              <text
                x={HUB.x}
                y={HUB.y + 4}
                textAnchor="middle"
                fontSize={11}
                letterSpacing="0.22em"
                fill="#C7F000"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                FRAB
              </text>
            </g>
          </svg>
        </div>

        <div className="mt-14 grid gap-px border border-border bg-border md:grid-cols-3">
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.n}
              initial={reduced ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ duration: 0.7, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
              className="bg-background px-6 py-8"
            >
              <Mono className="text-[11px] text-lime">{p.n}</Mono>
              <h3 className="mt-4 font-mono text-[12px] tracking-[0.2em] text-foreground">{p.t}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{p.d}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
