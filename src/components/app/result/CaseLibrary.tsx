import { useMemo, useState } from "react";
import type { CaseSummary, Recommendation, RiskLevel } from "../../../lib/frab-result";
import { Mono } from "../ui";

const RISK_TONE: Record<RiskLevel, string> = {
  HIGH: "text-critical",
  MEDIUM: "text-warning",
  LOW: "text-muted-foreground",
};

export const REC_TONE: Record<Recommendation, string> = {
  ESCALATE: "text-critical",
  BLOCK: "text-critical",
  MONITOR: "text-warning",
  CLOSE: "text-lime",
  INSUFFICIENT_EVIDENCE: "text-muted-foreground",
};

type Filter =
  | "ALL"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "ESCALATE"
  | "MONITOR"
  | "INSUFFICIENT_EVIDENCE";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "ALL" },
  { key: "HIGH", label: "HIGH" },
  { key: "MEDIUM", label: "MEDIUM" },
  { key: "LOW", label: "LOW" },
  { key: "ESCALATE", label: "ESCALATE" },
  { key: "MONITOR", label: "MONITOR" },
  { key: "INSUFFICIENT_EVIDENCE", label: "INSUFFICIENT EVIDENCE" },
];

function match(c: CaseSummary, f: Filter) {
  if (f === "ALL") return true;
  if (f === "HIGH" || f === "MEDIUM" || f === "LOW") return c.risk === f;
  return c.recommendation === f;
}

const ROW =
  "grid grid-cols-[minmax(0,1fr)] gap-y-2 md:grid-cols-[185px_minmax(200px,1fr)_80px_110px_110px_75px_140px] md:items-center md:gap-x-4";

export default function CaseLibrary({
  cases,
  onOpen,
}: {
  cases: CaseSummary[];
  onOpen: (caseId: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const rows = useMemo(() => cases.filter((c) => match(c, filter)), [cases, filter]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`border px-2.5 py-1 font-mono text-[8px] tracking-[0.18em] transition-colors ${
              filter === f.key
                ? "border-lime/60 text-lime"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="border-t border-border">
        <div className={`${ROW} hidden px-4 py-2 md:grid`}>
          <Mono className="text-[8px] text-muted-foreground">CASE ID</Mono>
          <Mono className="text-[8px] text-muted-foreground">ALERT TYPE</Mono>
          <Mono className="text-[8px] text-muted-foreground">RISK</Mono>
          <Mono className="text-[8px] text-muted-foreground">RECOMMENDATION</Mono>
          <Mono className="text-[8px] text-muted-foreground">STATUS</Mono>
          <Mono className="text-[8px] text-muted-foreground">TIME</Mono>
          <Mono className="text-[8px] text-muted-foreground md:text-right">CASE BOOK</Mono>
        </div>

        {rows.length === 0 ? (
          <div className="border-t border-border px-4 py-6">
            <Mono className="text-[9px] text-warning">NO CASES MATCH THIS FILTER</Mono>
          </div>
        ) : null}

        {rows.map((c) => (
          <button
            key={c.caseId}
            onClick={() => onOpen(c.caseId)}
            className="group block w-full cursor-pointer border-t border-border px-4 py-3.5 text-left transition-colors hover:bg-hover focus:outline-none focus-visible:bg-hover"
          >
            <span className="relative block">
              <span className="absolute -left-4 top-[-14px] hidden h-[calc(100%+28px)] w-[2px] bg-lime opacity-0 transition-opacity group-hover:opacity-100 md:block" />
              <span className={ROW}>
                <Mono className="text-[11px] text-foreground group-hover:text-lime">
                  CASE {c.caseId}
                </Mono>
                <Mono className="truncate text-[9px] text-muted-foreground">{c.alertType}</Mono>
                <Mono className={`text-[9px] ${RISK_TONE[c.risk]}`}>{c.risk}</Mono>
                <Mono className={`text-[9px] ${REC_TONE[c.recommendation]}`}>
                  {c.recommendation.replace(/_/g, " ")}
                </Mono>
                <Mono
                  className={`text-[9px] ${c.status === "COMPLETE" ? "text-lime" : "text-warning"}`}
                >
                  {c.status === "COMPLETE" ? "✓ COMPLETE" : "○ REVIEW"}
                </Mono>
                <Mono className="text-[9px] text-muted-foreground">{c.completedAt}</Mono>
                <Mono className="text-[8px] text-muted-foreground group-hover:text-lime md:text-right">
                  [ OPEN CASE BOOK ]
                </Mono>
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
