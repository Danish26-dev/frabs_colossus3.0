import { useEffect, useRef } from "react";
import {
  AGENT_ORDER,
  elapsedLabel,
  type AgentId,
  type AgentRuntime,
  type ConfidentialState,
  type Evidence,
  type InvestigationCase,
  type InvestigationEvent,
  type RunStatus,
} from "../../../lib/frab-investigation";
import { Dot, Mono } from "../ui";

function Line({ k, v, tone }: { k: string; v: string; tone?: "lime" | "warn" | "mute" | undefined }) {
  const cls =
    tone === "lime"
      ? "text-lime"
      : tone === "warn"
        ? "text-warning"
        : tone === "mute"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <Mono className="text-[9px] text-muted-foreground">{k}</Mono>
      <Mono className={`break-all text-right text-[9px] ${cls}`}>{v}</Mono>
    </div>
  );
}

function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <Mono className="text-[9px] text-lime">{title}</Mono>
        {meta ? <Mono className="text-[8px] text-muted-foreground">{meta}</Mono> : null}
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function dotState(rt: AgentRuntime) {
  if (rt.state === "COMPLETE") return "ok" as const;
  if (rt.state === "ERROR") return "bad" as const;
  if (rt.state === "IDLE") return "idle" as const;
  return "warn" as const;
}

export default function SummaryPanel({
  caseId,
  investigationCase,
  status,
  agents,
  events,
  evidence,
  confidential,
  elapsedMs,
  mode,
  selected,
  onSelectAgent,
  onSelectEvidence,
}: {
  caseId: string;
  investigationCase: InvestigationCase;
  status: RunStatus;
  agents: Record<AgentId, AgentRuntime>;
  events: InvestigationEvent[];
  evidence: Evidence[];
  confidential: ConfidentialState;
  elapsedMs: number;
  mode: "live" | "demo";
  selected: AgentId | null;
  onSelectAgent: (id: AgentId) => void;
  onSelectEvidence: (id: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [events.length]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <Section title="CASE" meta={elapsedLabel(elapsedMs)}>
          <Line k="ID" v={caseId} tone="lime" />
          <Line k="ALERT" v={investigationCase.alertType} />
          <Line k="ACCOUNT" v={investigationCase.account} />
          <Line k="RISK" v={investigationCase.risk} tone={investigationCase.risk === "HIGH" ? "warn" : undefined} />
          <Line k="STATUS" v={status} tone="lime" />
        </Section>

        <Section title="AGENTS">
          <ul className="space-y-1">
            {AGENT_ORDER.map((id) => (
              <li key={id}>
                <button
                  onClick={() => onSelectAgent(id)}
                  className={`flex w-full items-center justify-between gap-3 border-l-2 px-2 py-1.5 text-left transition-colors ${
                    selected === id
                      ? "border-l-lime bg-lime-soft"
                      : "border-l-transparent hover:bg-hover"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Dot state={dotState(agents[id])} />
                    <Mono className="text-[9px] text-foreground">{id}</Mono>
                  </span>
                  <Mono className="text-[8px] text-muted-foreground">{agents[id].state}</Mono>
                </button>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="EVIDENCE" meta={String(evidence.length)}>
          {evidence.length === 0 ? (
            <Mono className="text-[9px] text-muted-foreground">NONE YET</Mono>
          ) : (
            <ul className="space-y-1.5">
              {evidence.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => onSelectEvidence(e.id)}
                    className="block w-full border-l-2 border-lime/50 pl-2.5 text-left hover:border-lime"
                  >
                    <Mono className="text-[9px] text-lime">{e.id}</Mono>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-foreground">
                      {e.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="TIMELINE" meta={mode === "live" ? "LIVE" : "DEMO"}>
          {events.length === 0 ? (
            <Mono className="text-[9px] text-muted-foreground">NO EVENTS</Mono>
          ) : (
            <ul className="space-y-1">
              {events.slice(-40).map((e, i) => (
                <li key={`${e.ts}-${e.code}-${i}`} className="flex items-start gap-2">
                  <Mono className="text-[8px] text-muted-foreground">{e.ts}</Mono>
                  <Mono
                    className={`break-all text-[8px] ${
                      e.code.endsWith("_COMPLETE") ? "text-lime" : "text-foreground"
                    }`}
                  >
                    {e.code}
                  </Mono>
                </li>
              ))}
            </ul>
          )}
          <div ref={endRef} />
        </Section>

        <Section title="CONFIDENTIAL COMPUTE">
          {(
            [
              ["TEE", confidential.tee],
              ["ATTESTATION", confidential.attestation],
              ["CHANNEL", confidential.channel],
              ["MODEL", confidential.model],
              ["INFERENCE", confidential.inference],
            ] as const
          ).map(([k, v]) => (
            <Line key={k} k={k} v={v} tone={v === "NOT CONNECTED" ? "mute" : "lime"} />
          ))}
        </Section>
      </div>
    </div>
  );
}
