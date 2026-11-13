import type {
  AnalystAction,
  AnalystDecisionRecord,
  InvestigationResult,
} from "../../../../lib/frab-result";
import { Mono } from "../../ui";
import { REC_TONE } from "../CaseLibrary";

const NA = "NOT AVAILABLE";

const ANALYST_ACTIONS: { key: AnalystAction; label: string }[] = [
  { key: "ESCALATE", label: "[ ESCALATE ]" },
  { key: "MONITOR", label: "[ MONITOR ]" },
  { key: "BLOCK", label: "[ BLOCK ]" },
  { key: "CLOSE", label: "[ CLOSE / FALSE POSITIVE ]" },
  { key: "REQUEST_MANUAL_REVIEW", label: "[ REVIEW ]" },
];

/** Decision room: FRAB's recommendation, its supporting pillars, analyst control. */
export default function DecisionRoom({
  result,
  decision,
  submitting,
  onDecide,
}: {
  result: InvestigationResult;
  decision: AnalystDecisionRecord | null;
  submitting: boolean;
  onDecide: (a: AnalystAction) => void;
}) {
  const pillars = [
    {
      k: "EVIDENCE",
      v: result.evidence.length ? `${result.evidence.length} ITEMS` : NA,
      x: 8,
      y: 12,
    },
    {
      k: "NETWORK",
      v: result.network.nodes.length ? `${result.network.nodes.length} NODES` : NA,
      x: 76,
      y: 12,
    },
    {
      k: "BEHAVIOUR",
      v:
        result.riskComponents.find((c) => c.key === "behaviour" || c.key === "amount")?.score !==
        undefined
          ? `${result.riskComponents.find((c) => c.key === "behaviour" || c.key === "amount")?.score ?? "—"} / 100`
          : NA,
      x: 8,
      y: 72,
    },
    {
      k: "REGULATORY",
      v: result.regulatory.length ? `${result.regulatory.length} REFERENCES` : NA,
      x: 76,
      y: 72,
    },
  ];

  return (
    <div className="space-y-px border border-border bg-border">
      <div className="relative bg-background px-5 py-6">
        <div className="frab-grid pointer-events-none absolute inset-0 opacity-[0.10]" />
        <div className="relative">
          <Mono className="block text-[10px] text-lime">DECISION ROOM</Mono>

          <div className="relative mx-auto mt-4 h-[300px] w-full max-w-[720px]">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              {pillars.map((p) => (
                <line
                  key={p.k}
                  x1={p.x + 8}
                  y1={p.y + 6}
                  x2={50}
                  y2={50}
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
              ))}
            </svg>

            <div className="absolute left-1/2 top-1/2 w-[240px] -translate-x-1/2 -translate-y-1/2 border border-lime/60 bg-surface px-5 py-5 text-center">
              <Mono className="block text-[8px] text-muted-foreground">FRAB RECOMMENDATION</Mono>
              <p
                className={`mt-2 font-mono text-lg tracking-[0.12em] ${REC_TONE[result.recommendation]}`}
              >
                {result.recommendation.replace(/_/g, " ")}
              </p>
              <Mono className="mt-2 block text-[9px] text-technical">
                {result.alert.risk} RISK ·{" "}
                {result.riskScore === null ? NA : `${result.riskScore} / 100`}
              </Mono>
            </div>

            {pillars.map((p) => (
              <div
                key={p.k}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                className="absolute w-[150px] border border-border bg-surface px-3 py-2"
              >
                <Mono className="block text-[8px] text-muted-foreground">{p.k}</Mono>
                <Mono
                  className={`mt-1 block text-[10px] ${p.v === NA ? "text-warning" : "text-foreground"}`}
                >
                  {p.v}
                </Mono>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-2 max-w-2xl text-center text-[12px] leading-relaxed text-secondary-foreground">
            {result.rationale || NA}
          </p>
          <Mono className="mt-2 block text-center text-[8px] text-lime">
            {result.rationaleEvidenceIds.join(" · ") || NA}
          </Mono>
        </div>
      </div>

      <div className="bg-surface px-5 py-5">
        <Mono className="block text-[8px] text-muted-foreground">
          FRAB DOES NOT MAKE THE FINAL COMPLIANCE DECISION · THE ANALYST DECIDES
        </Mono>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={submitting}
            onClick={() =>
              onDecide(
                result.recommendation === "INSUFFICIENT_EVIDENCE"
                  ? "REQUEST_MANUAL_REVIEW"
                  : (result.recommendation as AnalystAction),
              )
            }
            className="border border-lime/60 bg-lime-soft px-3 py-1.5 font-mono text-[9px] tracking-[0.2em] text-lime disabled:opacity-50"
          >
            [ ACCEPT RECOMMENDATION ]
          </button>
          {ANALYST_ACTIONS.map((a) => (
            <button
              key={a.key}
              disabled={submitting}
              onClick={() => onDecide(a.key)}
              className="border border-border px-3 py-1.5 font-mono text-[9px] tracking-[0.2em] text-technical transition-colors hover:border-lime/60 hover:text-lime disabled:opacity-50"
            >
              {a.label}
            </button>
          ))}
        </div>
        <Mono className="mt-4 block text-[9px] text-foreground">
          {decision
            ? `RECORDED · ${decision.action.replace(/_/g, " ")} · ${decision.ts}${
                decision.overridden ? " · OVERRIDES FRAB RECOMMENDATION" : ""
              }`
            : "NO ANALYST DECISION RECORDED"}
        </Mono>
      </div>
    </div>
  );
}
