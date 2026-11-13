import { useState } from "react";
import type { InvestigationResult } from "../../../../lib/frab-result";
import { Mono } from "../../ui";

const NA = "NOT AVAILABLE";

type Entity = {
  id: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  emphasis?: boolean;
  tone?: "lime" | "critical" | "neutral";
  facts: { k: string; v: string }[];
  evidenceIds: string[];
};

/**
 * Spatial incident reconstruction. Every entity, value and relationship is
 * taken from the investigation result returned by the backend.
 */
export default function IncidentReconstruction({
  result,
  onOpenEvidence,
}: {
  result: InvestigationResult;
  onOpenEvidence: (id: string) => void;
}) {
  const [sel, setSel] = useState<string | null>(null);

  const a = result.alert;
  const net = result.network;
  const beneficiary = net.nodes.find((n) => n.kind === "BENEFICIARY") ?? null;
  const txNode = net.nodes.find((n) => n.kind === "TRANSACTION") ?? null;
  const evi = (id: string) => result.evidence.find((e) => e.id === id) ?? null;

  const amountEvidence = evi("E-001");
  const behaviourEvidence = evi("E-005");
  const beneficiaryEvidence = evi("E-002");

  const entities: Entity[] = [];

  entities.push({
    id: "customer",
    kind: "CUSTOMER",
    label: a.customer,
    x: 50,
    y: 8,
    tone: "neutral",
    evidenceIds: behaviourEvidence ? [behaviourEvidence.id] : [],
    facts: [
      ...(behaviourEvidence
        ? [
            { k: "NORMAL BEHAVIOUR", v: behaviourEvidence.baseline },
            { k: "OBSERVED", v: behaviourEvidence.observed },
          ]
        : []),
      { k: "ALERT RISK", v: a.risk },
    ],
  });

  entities.push({
    id: "transaction",
    kind: "TRANSACTION",
    label: a.transaction ?? txNode?.label ?? NA,
    x: 50,
    y: 40,
    emphasis: true,
    tone: a.risk === "HIGH" ? "critical" : "lime",
    evidenceIds: amountEvidence ? [amountEvidence.id] : [],
    facts: [
      ...(amountEvidence
        ? [
            { k: "AMOUNT", v: amountEvidence.observed },
            { k: "BASELINE", v: amountEvidence.baseline },
            { k: "SOURCE", v: amountEvidence.source },
          ]
        : []),
      ...(txNode ? [{ k: "TRACE", v: txNode.detail }] : []),
    ],
  });

  entities.push({
    id: "account",
    kind: "ACCOUNT",
    label: a.account,
    x: 20,
    y: 70,
    tone: "neutral",
    evidenceIds: amountEvidence ? [amountEvidence.id] : [],
    facts: [
      { k: "ROLE", v: "Originating account" },
      ...(net.nodes.filter((n) => n.kind === "CONNECTED_ACCOUNT").length
        ? [
            {
              k: "CONNECTED ACCOUNTS",
              v: String(net.nodes.filter((n) => n.kind === "CONNECTED_ACCOUNT").length),
            },
          ]
        : []),
    ],
  });

  if (beneficiary) {
    entities.push({
      id: "beneficiary",
      kind: "BENEFICIARY",
      label: beneficiary.label,
      x: 80,
      y: 70,
      tone: a.risk === "HIGH" ? "critical" : "neutral",
      evidenceIds: beneficiary.evidenceIds,
      facts: [
        { k: "DETAIL", v: beneficiary.detail },
        ...(beneficiaryEvidence
          ? [
              { k: "OBSERVED", v: beneficiaryEvidence.observed },
              { k: "BASELINE", v: beneficiaryEvidence.baseline },
            ]
          : []),
      ],
    });
  }

  entities.push({
    id: "alert",
    kind: "ALERT",
    label: a.alertId,
    x: 20,
    y: 92,
    tone: "lime",
    evidenceIds: [],
    facts: [
      { k: "TRIGGER", v: a.type.replace(/_/g, " ") },
      { k: "RAISED ON", v: a.account },
      { k: "COMPLETED", v: a.completedAt },
    ],
  });

  const links: [string, string][] = [
    ["customer", "transaction"],
    ["transaction", "account"],
    ...(beneficiary ? ([["transaction", "beneficiary"]] as [string, string][]) : []),
    ["account", "alert"],
  ];

  const byId = (id: string) => entities.find((e) => e.id === id)!;
  const selected = sel ? entities.find((e) => e.id === sel) ?? null : null;

  return (
    <div className="grid grid-cols-1 gap-px border border-border bg-border lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="relative bg-background px-4 py-5">
        <div className="frab-grid pointer-events-none absolute inset-0 opacity-[0.10]" />
        <div className="relative">
          <Mono className="block text-[10px] text-lime">INCIDENT RECONSTRUCTION</Mono>
          <Mono className="mt-1 block text-[8px] text-muted-foreground">
            SELECT AN ENTITY TO EXPAND ITS CONTEXT
          </Mono>

          <div className="relative mt-4 h-[330px] w-full md:h-[400px]">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              {links.map(([f, t]) => {
                const A = byId(f);
                const B = byId(t);
                const active = sel === f || sel === t;
                return (
                  <line
                    key={`${f}-${t}`}
                    x1={A.x}
                    y1={A.y + 3}
                    x2={B.x}
                    y2={B.y - 3}
                    vectorEffect="non-scaling-stroke"
                    strokeWidth={active ? 1.4 : 1}
                    strokeDasharray={active ? undefined : "3 3"}
                    className={active ? "stroke-lime" : "stroke-border"}
                  />
                );
              })}
            </svg>

            {entities.map((e) => {
              const active = sel === e.id;
              const tone =
                e.tone === "critical"
                  ? "border-critical/70 text-critical"
                  : e.tone === "lime"
                    ? "border-lime/60 text-lime"
                    : "border-border text-foreground";
              return (
                <button
                  key={e.id}
                  onClick={() => setSel(active ? null : e.id)}
                  style={{ left: `${e.x}%`, top: `${e.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 border bg-surface px-3 text-center transition-all duration-300 ${tone} ${
                    active ? "bg-elevated shadow-[0_0_0_1px_var(--lime)]" : "hover:bg-elevated"
                  } ${e.emphasis ? "py-3 md:px-6" : "py-2"}`}
                >
                  <Mono className="block text-[7.5px] text-muted-foreground">{e.kind}</Mono>
                  <Mono
                    className={`mt-1 block ${e.emphasis ? "text-[12px] md:text-[14px]" : "text-[10px]"}`}
                  >
                    {e.label}
                  </Mono>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-surface px-5 py-5">
        {selected ? (
          <div className="frab-page-in">
            <Mono className="block text-[8px] text-muted-foreground">{selected.kind}</Mono>
            <Mono className="mt-1 block text-[13px] text-lime">{selected.label}</Mono>
            <dl className="mt-4 space-y-3">
              {selected.facts.length === 0 ? (
                <Mono className="text-[9px] text-warning">{NA}</Mono>
              ) : null}
              {selected.facts.map((f) => (
                <div key={f.k}>
                  <Mono className="block text-[8px] text-muted-foreground">{f.k}</Mono>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-foreground">{f.v}</p>
                </div>
              ))}
            </dl>
            {selected.evidenceIds.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {selected.evidenceIds.map((id) => (
                  <button
                    key={id}
                    onClick={() => onOpenEvidence(id)}
                    className="border border-border px-2 py-0.5 font-mono text-[9px] tracking-[0.18em] text-technical transition-colors hover:border-lime/60 hover:text-lime"
                  >
                    {id}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div>
            <Mono className="block text-[8px] text-muted-foreground">WHAT HAPPENED</Mono>
            <p className="mt-2 text-[13px] leading-relaxed text-foreground">
              {a.type.replace(/_/g, " ")} — alert {a.alertId} raised on account {a.account}.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-secondary-foreground">
              {result.rationale || NA}
            </p>
            <Mono className="mt-4 block text-[8px] text-muted-foreground">
              EVIDENCE · {result.rationaleEvidenceIds.join(" · ") || NA}
            </Mono>
            <Mono className="mt-4 block text-[8px] text-technical">
              RECOMMENDATION · {result.recommendation.replace(/_/g, " ")}
            </Mono>
          </div>
        )}
      </div>
    </div>
  );
}
