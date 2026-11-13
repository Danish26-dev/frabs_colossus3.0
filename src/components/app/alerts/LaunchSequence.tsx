import { useEffect, useRef, useState } from "react";
import { Mono } from "../ui";

/**
 * Purely visual case-launch transition. It does not fetch, compute or mutate
 * anything — the investigation has already been created by the caller and the
 * same caseId is handed straight through to the workspace.
 */
export default function LaunchSequence({
  caseId,
  onDone,
}: {
  caseId: string;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      finish();
      return;
    }
    const timers = [
      window.setTimeout(() => setStep(1), 550),
      window.setTimeout(() => setStep(2), 1250),
      window.setTimeout(() => setStep(3), 2050),
      window.setTimeout(finish, 3000),
    ];
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", key);
    return () => {
      timers.forEach(window.clearTimeout);
      window.removeEventListener("keydown", key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const caption =
    step === 0
      ? "INITIALIZING INVESTIGATION"
      : step === 1
        ? "INVESTIGATION CORE ONLINE"
        : step === 2
          ? "ACCELERATING TO INVESTIGATION FLOOR"
          : "ENTERING INVESTIGATION ENVIRONMENT";

  return (
    <div
      onClick={finish}
      className="fixed inset-0 z-[100] cursor-pointer overflow-hidden bg-background"
      style={{ animation: step >= 3 ? "frab-launch-out 600ms ease-in forwards" : undefined }}
    >
      <div className="frab-grid absolute inset-0 opacity-[0.10]" />

      {/* speed streaks */}
      <div className="pointer-events-none absolute inset-0">
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="absolute h-px bg-lime/40"
            style={{
              top: `${8 + i * 6.2}%`,
              left: "-40%",
              width: `${20 + ((i * 37) % 45)}%`,
              opacity: step >= 1 ? 1 : 0,
              animationName: step >= 1 ? "frab-streak" : "none",
              animationDuration: `${420 + (i % 5) * 90}ms`,
              animationTimingFunction: "linear",
              animationIterationCount: "infinite",
              animationDelay: `${(i % 7) * 60}ms`,
            }}
          />
        ))}
      </div>

      {/* horizon glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 h-[38vh] -translate-y-1/2"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--lime) 18%, transparent), transparent)",
          opacity: step >= 1 ? 1 : 0.25,
          transition: "opacity 400ms ease-out",
        }}
      />

      {/* side-car silhouette */}
      <div
        className="absolute top-1/2 -translate-y-1/2"
        style={{
          animation:
            step === 0
              ? "frab-car-enter 600ms cubic-bezier(0.16,0.9,0.3,1) forwards"
              : step >= 2
                ? "frab-car-launch 900ms cubic-bezier(0.6,0,0.9,1) forwards"
                : "frab-car-idle 900ms ease-in-out infinite alternate",
          right: "18%",
        }}
      >
        <svg width="360" height="140" viewBox="0 0 360 140" className="max-w-[80vw]">
          <defs>
            <linearGradient id="carBody" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2B3028" />
              <stop offset="100%" stopColor="#171A16" />
            </linearGradient>
          </defs>
          {/* engine bloom */}
          <ellipse cx="316" cy="86" rx={step >= 1 ? 40 : 16} ry="9" fill="var(--lime)" opacity="0.28" />
          {/* chassis */}
          <path
            d="M28 96 L70 62 L188 50 L268 58 L322 78 L330 96 Z"
            fill="url(#carBody)"
            stroke="#3A4036"
            strokeWidth="1.5"
          />
          {/* canopy */}
          <path d="M104 62 L166 54 L214 60 L188 76 L118 78 Z" fill="#171A16" stroke="var(--lime)" strokeWidth="1.2" opacity="0.85" />
          {/* side-car pod */}
          <path d="M60 104 L108 92 L184 92 L206 104 L200 116 L70 116 Z" fill="#242821" stroke="#3A4036" strokeWidth="1.2" />
          {/* lime accents */}
          <path d="M70 90 L262 74" stroke="var(--lime)" strokeWidth="1.6" opacity="0.9" />
          <path d="M214 104 L306 92" stroke="var(--lime)" strokeWidth="1" opacity="0.5" />
          <circle cx="40" cy="92" r="3" fill="#F4F3EA" />
          {/* thrust */}
          <path d="M330 84 L360 88 L330 92 Z" fill="var(--lime)" opacity={step >= 1 ? 0.95 : 0.4} />
        </svg>
      </div>

      {/* caption */}
      <div className="absolute inset-x-0 bottom-[14%] flex flex-col items-center gap-2 px-6 text-center">
        <Mono className="text-[10px] text-lime">{caption}</Mono>
        <Mono className="text-[9px] text-secondary-foreground">CASE {caseId}</Mono>
        <Mono className="mt-3 text-[8px] text-muted-foreground">
          CLICK OR PRESS ESC TO SKIP
        </Mono>
      </div>
    </div>
  );
}
