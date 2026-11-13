import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

/* ---------------------------------------------------------------- reveal */

export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "tr";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "-8% 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Comp = Tag as any;
  return (
    <Comp
      ref={ref as any}
      className={`${className} transition-[opacity,transform] duration-[900ms] ease-[cubic-bezier(.16,1,.3,1)] ${
        shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Comp>
  );
}

/* ------------------------------------------------------------- structure */

export function Section({
  id,
  label,
  title,
  lead,
  children,
  className = "",
  bordered = true,
}: {
  id?: string;
  label: string;
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  className?: string;
  bordered?: boolean;
}) {
  return (
    <section
      id={id}
      className={`relative w-full scroll-mt-24 ${
        bordered ? "border-t border-border" : ""
      } ${className}`}
    >
      <div className="mx-auto max-w-[1440px] px-6 py-24 md:px-14 lg:py-32">
        <Reveal>
          <SectionLabel>{label}</SectionLabel>
        </Reveal>
        <Reveal delay={60}>
          <h2 className="mt-6 max-w-4xl text-[clamp(1.8rem,3.6vw,3.1rem)] font-semibold uppercase leading-[0.98] tracking-[-0.035em] text-foreground">
            {title}
          </h2>
        </Reveal>
        {lead ? (
          <Reveal delay={120}>
            <div className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
              {lead}
            </div>
          </Reveal>
        ) : null}
        {children ? <div className="mt-14 lg:mt-20">{children}</div> : null}
      </div>
    </section>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 font-mono text-[10px] tracking-[0.4em] text-lime">
      <span className="inline-block h-px w-8 bg-lime/60" />
      {children}
    </p>
  );
}

export function Mono({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`font-mono tracking-[0.24em] ${className}`}>{children}</span>
  );
}

export function Panel({
  children,
  className = "",
  title,
  meta,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  meta?: string;
}) {
  return (
    <div className={`border border-border bg-surface/60 ${className}`}>
      {(title || meta) && (
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <Mono className="text-[10px] text-foreground/80">{title}</Mono>
          {meta ? (
            <Mono className="text-[10px] text-muted-foreground">{meta}</Mono>
          ) : null}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatusDot({
  tone = "lime",
  className = "",
}: {
  tone?: "lime" | "critical" | "warning" | "muted";
  className?: string;
}) {
  const bg =
    tone === "critical"
      ? "bg-critical"
      : tone === "warning"
        ? "bg-warning"
        : tone === "muted"
          ? "bg-muted-foreground"
          : "bg-lime";
  return (
    <span
      className={`frab-dot inline-block h-1.5 w-1.5 rounded-full ${bg} ${className}`}
    />
  );
}

export function RiskTag({ level }: { level: string }) {
  const l = level.toUpperCase();
  const tone =
    l === "HIGH" || l === "CRITICAL"
      ? "border-critical/50 text-critical"
      : l === "MEDIUM"
        ? "border-warning/50 text-warning"
        : "border-border text-muted-foreground";
  return (
    <span className={`border px-2 py-0.5 font-mono text-[10px] tracking-[0.2em] ${tone}`}>
      {l}
    </span>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6 inline-flex items-center gap-2 border border-border px-3 py-1.5 font-mono text-[9px] tracking-[0.28em] text-muted-foreground">
      <span className="h-1 w-1 bg-warning" />
      {children}
    </p>
  );
}

/* ---------------------------------------------------------------- pieces */

export function Node({
  title,
  sub,
  tone = "default",
  className = "",
}: {
  title: string;
  sub?: string;
  tone?: "default" | "lime" | "critical";
  className?: string;
}) {
  const border =
    tone === "lime"
      ? "border-lime/60"
      : tone === "critical"
        ? "border-critical/50"
        : "border-border";
  const text =
    tone === "lime" ? "text-lime" : tone === "critical" ? "text-critical" : "text-foreground";
  return (
    <div
      className={`border ${border} bg-surface/50 px-4 py-3 text-center ${className}`}
    >
      <Mono className={`block text-[10px] ${text}`}>{title}</Mono>
      {sub ? (
        <Mono className="mt-1 block text-[9px] text-muted-foreground">{sub}</Mono>
      ) : null}
    </div>
  );
}

export function VArrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-2">
      <span className="h-6 w-px bg-border" />
      {label ? (
        <Mono className="my-1 text-[9px] text-muted-foreground">{label}</Mono>
      ) : null}
      <span className="h-6 w-px bg-gradient-to-b from-border to-lime/60" />
      <span className="-mt-[3px] h-1.5 w-1.5 rotate-45 border-b border-r border-lime/70" />
    </div>
  );
}

export function CtaPrimary({
  children,
  href = "#demo",
}: {
  children: ReactNode;
  href?: string;
}) {
  return (
    <a
      href={href}
      className="group inline-flex items-center gap-3 bg-lime px-6 py-3.5 font-mono text-[11px] tracking-[0.24em] text-background transition-opacity hover:opacity-85"
    >
      {children}
      <span className="transition-transform group-hover:translate-x-1">→</span>
    </a>
  );
}

export function CtaSecondary({
  children,
  href = "#architecture",
}: {
  children: ReactNode;
  href?: string;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-3 border border-border px-6 py-3.5 font-mono text-[11px] tracking-[0.24em] text-foreground/80 transition-colors hover:border-lime/60 hover:text-lime"
    >
      {children}
    </a>
  );
}

export function Metric({
  value,
  label,
  unit,
}: {
  value: string;
  label: string;
  unit?: string;
}) {
  return (
    <div className="border-l border-border px-5 py-4">
      <Mono className="block text-xl text-lime md:text-2xl">
        {value}
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
      </Mono>
      <Mono className="mt-2 block text-[9px] text-muted-foreground">{label}</Mono>
    </div>
  );
}

/* ------------------------------------------------------------- flow strip */

export function FlowRow({
  items,
  className = "",
}: {
  items: string[];
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-3 ${className}`}>
      {items.map((it, i) => (
        <span key={it} className="flex items-center gap-3">
          <span
            className={`border px-3 py-2 font-mono text-[9px] tracking-[0.22em] ${
              i === items.length - 1
                ? "border-lime/60 bg-lime/[0.06] text-lime"
                : i === 0
                  ? "border-critical/50 text-critical"
                  : "border-border text-foreground/80"
            }`}
          >
            {it}
          </span>
          {i < items.length - 1 ? (
            <span className="font-mono text-[10px] text-muted-foreground">→</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
