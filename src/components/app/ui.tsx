import type { ReactNode } from "react";
import type { DataSource, ServiceState } from "../../lib/frab-api";

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono tracking-[0.22em] ${className}`}>{children}</span>;
}

export function Dot({ state }: { state: "ok" | "warn" | "bad" | "idle" }) {
  const bg =
    state === "ok"
      ? "bg-lime"
      : state === "warn"
        ? "bg-warning"
        : state === "bad"
          ? "bg-critical"
          : "bg-muted-foreground";
  return <span className={`frab-dot inline-block h-1.5 w-1.5 rounded-full ${bg}`} />;
}

export function stateLabel(s: ServiceState) {
  return s === "not_connected" ? "NOT CONNECTED" : s.replace("_", " ").toUpperCase();
}

export function stateTone(s: ServiceState): "ok" | "idle" {
  return s === "not_connected" ? "idle" : "ok";
}

export function StatusLine({
  label,
  value,
  tone = "ok",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "bad" | "idle";
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <Mono className="text-[9px] text-muted-foreground">{label}</Mono>
      <span className="flex items-center gap-2">
        <Dot state={tone} />
        <Mono className={`text-[9px] ${tone === "idle" ? "text-muted-foreground" : "text-foreground"}`}>
          {value}
        </Mono>
      </span>
    </div>
  );
}

export function PanelShell({
  title,
  meta,
  children,
  className = "",
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-border bg-surface ${className}`}>
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5">
        <Mono className="text-[10px] text-foreground">{title}</Mono>
        {meta ? <Mono className="text-[9px] text-muted-foreground">{meta}</Mono> : null}
      </header>
      {children}
    </section>
  );
}

export function SourceTag({ source }: { source: DataSource }) {
  return (
    <span
      className={`border px-2 py-0.5 font-mono text-[9px] tracking-[0.22em] ${
        source === "live" ? "border-lime/50 text-lime" : "border-warning/50 text-warning"
      }`}
    >
      {source === "live" ? "LIVE BACKEND" : "DEMO ENVIRONMENT"}
    </span>
  );
}

export function LoadingBlock({ label = "LOADING" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-8">
      <span className="h-1 w-1 animate-ping bg-lime" />
      <Mono className="text-[9px] text-muted-foreground">{label}…</Mono>
    </div>
  );
}

export function ErrorBlock({ label, onRetry }: { label: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-critical px-4 py-6">
      <Mono className="text-[9px] text-critical">{label}</Mono>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="border border-border px-3 py-1 font-mono text-[9px] tracking-[0.22em] text-foreground transition-colors hover:border-lime/60 hover:text-lime"
        >
          [ RETRY ]
        </button>
      ) : null}
    </div>
  );
}

export function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="px-4 py-8">
      <Mono className="text-[9px] text-muted-foreground">{label}</Mono>
    </div>
  );
}
