import { useState } from "react";
import type { InvestigationResult } from "../../../../lib/frab-result";
import { Mono } from "../../ui";

const NA = "NOT AVAILABLE";

/**
 * Evidence → pattern → regulatory context flow. Only regulatory entries
 * returned by the retrieval layer are shown; nothing is cited by the interface.
 */
export default function RegulatoryFlow({ result }: { result: InvestigationResult }) {
  const [sel, setSel] = useState(0);
  const entries = result.regulatory;
  const evidenceIds = result.rationaleEvidenceIds;
  const entry = entries[sel] ?? null;

  /** An evidence id is linked when the retrieved text references it explicitly. */
  const linkedEvidence = entry
    ? result.evidence.filter((e) =>
        `${entry.context} ${entry.whyItMatters}`.toUpperCase().includes(e.id),
      )
    : [];

  return (
    <div className="grid grid-cols-1 gap-px border border-border bg-border lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <div className="relative bg-background px-5 py-6">
        <div className="frab-grid pointer-events-none absolute inset-0 opacity-[0.10]" />
        <div className="relative">
          <Mono className="block text-[10px] text-lime">EVIDENCE → PATTERN → CONTEXT</Mono>

          <div className="mt-5 flex flex-wrap gap-2">
            {evidenceIds.length === 0 ? (
              <Mono className="text-[9px] text-warning">SUPPORTING EVIDENCE {NA}</Mono>
            ) : null}
            {evidenceIds.map((id) => (
              <span
                key={id}
                className="border border-border bg-surface px-2.5 py-1 font-mono text-[9px] tracking-[0.18em] text-technical"
              >
                {id}
              </span>
            ))}
          </div>

          <div className="ml-3 mt-3 h-6 w-px bg-border" />

          <div className="border border-border bg-surface px-4 py-3">
            <Mono className="block text-[8px] text-muted-foreground">PATTERN DETECTED</Mono>
            <Mono className="mt-1.5 block text-[11px] text-foreground">
              {result.alert.type.replace(/_/g, " ")}
            </Mono>
            <Mono className="mt-1 block text-[8px] text-technical">
              REGULATORY RISK · {result.regulatoryRisk}
            </Mono>
          </div>

          <div className="ml-3 mt-3 h-6 w-px bg-border" />

          <ul className="space-y-2">
            {entries.length === 0 ? (
              <li>
                <Mono className="text-[9px] text-warning">REGULATORY CONTEXT {NA}</Mono>
              </li>
            ) : null}
            {entries.map((r, i) => (
              <li key={r.reference}>
                <button
                  onClick={() => setSel(i)}
                  className={`w-full border px-3 py-2 text-left transition-colors ${
                    i === sel ? "border-lime bg-lime-soft" : "border-border bg-surface hover:bg-elevated"
                  }`}
                >
                  <Mono className={`block text-[8px] ${i === sel ? "text-lime" : "text-muted-foreground"}`}>
                    {r.source}
                  </Mono>
                  <Mono className="mt-1 block text-[9.5px] leading-relaxed text-foreground">
                    {r.reference}
                  </Mono>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-surface px-5 py-6">
        {entry ? (
          <div className="frab-page-in">
            <Mono className="block text-[8px] text-muted-foreground">SOURCE</Mono>
            <Mono className="mt-1 block text-[10px] text-lime">{entry.source}</Mono>

            <Mono className="mt-4 block text-[8px] text-muted-foreground">PROVISION / REFERENCE</Mono>
            <Mono className="mt-1 block text-[11px] leading-relaxed text-foreground">
              {entry.reference}
            </Mono>

            <Mono className="mt-4 block text-[8px] text-muted-foreground">CONTEXT</Mono>
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">{entry.context}</p>

            <Mono className="mt-4 block text-[8px] text-muted-foreground">WHY IT MATTERS</Mono>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-secondary-foreground">
              {entry.whyItMatters}
            </p>

            <Mono className="mt-4 block text-[8px] text-muted-foreground">LINKED EVIDENCE</Mono>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {linkedEvidence.length === 0 ? (
                <Mono className="text-[8px] text-technical">NO EXPLICIT EVIDENCE LINK RETURNED</Mono>
              ) : (
                linkedEvidence.map((e) => (
                  <span
                    key={e.id}
                    title={e.summary}
                    className="border border-lime/50 px-2 py-0.5 font-mono text-[9px] tracking-[0.18em] text-lime"
                  >
                    {e.id}
                  </span>
                ))
              )}
            </div>
          </div>
        ) : (
          <Mono className="text-[9px] text-warning">REGULATORY CONTEXT {NA}</Mono>
        )}

        <p className="mt-6 border-t border-border pt-3 text-[11.5px] leading-relaxed text-muted-foreground">
          FRAB provides decision support only. Retrieved regulatory context is not legal advice or a
          regulator-approved determination.
        </p>
      </div>
    </div>
  );
}
