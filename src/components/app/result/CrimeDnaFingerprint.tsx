import { useEffect, useState } from "react";
import type { InvestigationResult } from "../../../lib/frab-result";
import { Mono } from "../ui";

/** Progressively reveals each backend axis so the fingerprint is drawn, not popped. */
function useBuildStep(total: number) {
  const [step, setStep] = useState(total);
  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || total === 0) {
      setStep(total);
      return;
    }
    setStep(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setStep(i);
      if (i >= total) window.clearInterval(id);
    }, 150);
    return () => window.clearInterval(id);
  }, [total]);
  return step;
}

const NA = "NOT AVAILABLE";

function toneFor(s: number | null) {
  if (s === null) return { bar: "bg-muted-foreground", text: "text-warning" };
  if (s >= 70) return { bar: "bg-critical", text: "text-critical" };
  if (s >= 45) return { bar: "bg-warning", text: "text-warning" };
  return { bar: "bg-lime", text: "text-lime" };
}

/**
 * Forensic radar fingerprint. Every axis, value and label is derived from the
 * deterministic risk components returned by the backend — nothing is computed
 * or invented in the interface.
 */
export default function CrimeDnaFingerprint({
  result,
  onOpenEvidence,
}: {
  result: InvestigationResult;
  onOpenEvidence: () => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const comps = result.riskComponents;
  const size = 360;
  const c = size / 2;
  const R = 116;
  const n = comps.length;
  const step = useBuildStep(n);

  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i: number, r: number) =>
    [c + Math.cos(angle(i)) * R * r, c + Math.sin(angle(i)) * R * r] as const;

  const poly =
    n >= 3
      ? comps
          .map((cp, i) => point(i, i < step ? (cp.score ?? 0) / 100 : 0).join(","))
          .join(" ")
      : null;

  return (
    <div className="grid grid-cols-1 gap-px border border-border bg-border lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* ------------------------------------------------ radar fingerprint */}
      <div className="relative bg-background px-5 py-6">
        <div className="frab-grid pointer-events-none absolute inset-0 opacity-[0.12]" />
        <div className="relative">
          <Mono className="block text-[10px] text-lime">CRIME DNA</Mono>
          <Mono className="mt-1 block text-[8px] text-muted-foreground">
            DETERMINISTIC BEHAVIOURAL FINGERPRINT
          </Mono>

          {n < 3 || !poly ? (
            <div className="flex h-[280px] items-center justify-center">
              <Mono className="text-[9px] text-warning">
                RISK COMPOSITION NOT AVAILABLE FROM BACKEND
              </Mono>
            </div>
          ) : (
            <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto mt-2 h-auto w-full max-w-[380px]">
              <defs>
                <radialGradient id="dnaGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="var(--lime)" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="var(--lime)" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx={c} cy={c} r={R * 1.05} fill="url(#dnaGlow)" />

              {/* rings */}
              {[0.25, 0.5, 0.75, 1].map((r) => (
                <polygon
                  key={r}
                  points={comps.map((_, i) => point(i, r).join(",")).join(" ")}
                  fill="none"
                  className="stroke-border"
                  strokeWidth={0.6}
                />
              ))}

              {/* axes + labels */}
              {comps.map((cp, i) => {
                const [ax, ay] = point(i, 1);
                const lx = c + Math.cos(angle(i)) * (R + 30);
                const ly = c + Math.sin(angle(i)) * (R + 30);
                const active = hover === cp.key;
                return (
                  <g key={cp.key}>
                    <line
                      x1={c}
                      y1={c}
                      x2={ax}
                      y2={ay}
                      className={active ? "stroke-lime" : "stroke-border"}
                      strokeWidth={0.7}
                    />
                    <text
                      x={lx}
                      y={ly - 4}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className={active ? "fill-[var(--lime)]" : "fill-[var(--technical)]"}
                      style={{ fontSize: 6.6, letterSpacing: "0.16em", fontFamily: "var(--font-mono, monospace)" }}
                    >
                      {cp.label.toUpperCase()}
                    </text>
                    <text
                      x={lx}
                      y={ly + 6}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-[var(--foreground)]"
                      style={{ fontSize: 8.5, fontFamily: "var(--font-mono, monospace)" }}
                    >
                      {cp.score === null ? "—" : cp.score}
                    </text>
                  </g>
                );
              })}

              {/* fingerprint polygon */}
              <polygon
                points={poly}
                className="fill-lime/12 stroke-lime"
                strokeWidth={1.4}
                strokeLinejoin="round"
              />
              {comps.map((cp, i) => {
                if (i >= step) return null;
                const [px, py] = point(i, (cp.score ?? 0) / 100);
                return (
                  <g key={cp.key} className="frab-page-in">
                    <circle
                      cx={px}
                      cy={py}
                      r={hover === cp.key ? 4.2 : 2.6}
                      className="fill-lime"
                    />
                    <circle
                      cx={px}
                      cy={py}
                      r={10}
                      fill="transparent"
                      onMouseEnter={() => setHover(cp.key)}
                      onMouseLeave={() => setHover(null)}
                    />
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>

      {/* ------------------------------------------------- secondary metrics */}
      <div className="flex flex-col gap-px bg-border">
        <div className="grid grid-cols-3 gap-px bg-border">
          <div className="bg-surface px-4 py-4">
            <Mono className="block text-[8px] text-muted-foreground">OVERALL RISK</Mono>
            <p className="mt-1 font-mono text-2xl leading-none text-lime">
              {result.riskScore === null ? (
                <span className="text-[11px] text-warning">{NA}</span>
              ) : (
                <>
                  {result.riskScore}
                  <span className="text-[11px] text-technical"> / 100</span>
                </>
              )}
            </p>
          </div>
          <div className="bg-surface px-4 py-4">
            <Mono className="block text-[8px] text-muted-foreground">RISK TIER</Mono>
            <Mono
              className={`mt-2 block text-[11px] ${
                result.alert.risk === "HIGH"
                  ? "text-critical"
                  : result.alert.risk === "MEDIUM"
                    ? "text-warning"
                    : "text-lime"
              }`}
            >
              {result.alert.risk}
            </Mono>
          </div>
          <div className="bg-surface px-4 py-4">
            <Mono className="block text-[8px] text-muted-foreground">RECOMMENDATION</Mono>
            <Mono className="mt-2 block text-[11px] text-foreground">
              {result.recommendation.replace(/_/g, " ")}
            </Mono>
          </div>
        </div>

        {/* component contribution */}
        <div className="flex-1 bg-surface px-5 py-4">
          <Mono className="block text-[8px] text-muted-foreground">COMPONENT CONTRIBUTION</Mono>
          <ul className="mt-3 space-y-2.5">
            {comps.length === 0 ? (
              <li>
                <Mono className="text-[9px] text-warning">{NA}</Mono>
              </li>
            ) : null}
            {comps.map((cp) => {
              const t = toneFor(cp.score);
              return (
                <li
                  key={cp.key}
                  onMouseEnter={() => setHover(cp.key)}
                  onMouseLeave={() => setHover(null)}
                  className="grid grid-cols-[minmax(0,1fr)_90px_34px] items-center gap-3"
                >
                  <span
                    className={`truncate font-mono text-[9px] tracking-[0.18em] ${hover === cp.key ? "text-lime" : "text-secondary-foreground"}`}
                    title={cp.detail ?? undefined}
                  >
                    {cp.label}
                  </span>
                  <span className="h-[4px] w-full bg-elevated">
                    <span
                      className={`block h-[4px] ${t.bar}`}
                      style={{ width: `${cp.score ?? 0}%` }}
                    />
                  </span>
                  <Mono className={`text-right font-mono text-[11px] ${t.text}`}>
                    {cp.score === null ? "—" : cp.score}
                  </Mono>
                </li>
              );
            })}
          </ul>
        </div>

        {/* evidence map */}
        <div className="bg-surface px-5 py-4">
          <div className="flex items-baseline justify-between gap-4">
            <Mono className="text-[8px] text-muted-foreground">EVIDENCE MAP</Mono>
            <Mono className="text-[8px] text-technical">
              {result.evidence.length} ITEMS RETURNED
            </Mono>
          </div>
          <div className="mt-3 space-y-2">
            {result.evidence.length === 0 ? (
              <Mono className="text-[9px] text-warning">{NA}</Mono>
            ) : null}
            {result.evidence.map((e) => {
              const linked = comps.filter((cp) => cp.evidenceIds.includes(e.id));
              return (
                <div key={e.id} className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={onOpenEvidence}
                    title={e.title}
                    className="border border-border px-2 py-0.5 font-mono text-[9px] tracking-[0.18em] text-technical transition-colors hover:border-lime/60 hover:text-lime"
                  >
                    {e.id}
                  </button>
                  {linked.length ? (
                    linked.map((cp) => (
                      <span
                        key={cp.key}
                        onMouseEnter={() => setHover(cp.key)}
                        onMouseLeave={() => setHover(null)}
                        className={`font-mono text-[8px] tracking-[0.18em] ${hover === cp.key ? "text-lime" : "text-muted-foreground"}`}
                      >
                        · {cp.label}
                      </span>
                    ))
                  ) : (
                    <Mono className="text-[8px] text-muted-foreground">
                      · NO COMPONENT LINK RETURNED
                    </Mono>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
