import { useMemo, useState } from "react";
import type { InvestigationResult } from "../../../../lib/frab-result";
import { Mono } from "../../ui";

const NA = "NOT AVAILABLE";

/**
 * Interactive evidence board. Groups are the deterministic risk components
 * returned by the backend; an evidence item appears under a group only when the
 * backend links it there. No relationship is invented in the interface.
 */
export default function EvidenceWall({
  result,
  focusId,
}: {
  result: InvestigationResult;
  focusId?: string | null;
}) {
  const [sel, setSel] = useState<string | null>(focusId ?? null);

  const groups = useMemo(() => {
    const linked = new Set<string>();
    const g = result.riskComponents
      .map((c) => {
        const items = result.evidence.filter((e) => c.evidenceIds.includes(e.id));
        items.forEach((i) => linked.add(i.id));
        return { key: c.key, label: c.label, score: c.score, items };
      })
      .filter((x) => x.items.length > 0);
    const rest = result.evidence.filter((e) => !linked.has(e.id));
    if (rest.length)
      g.push({ key: "__unlinked", label: "NO COMPONENT LINK RETURNED", score: null, items: rest });
    return g;
  }, [result]);

  const item = sel ? result.evidence.find((e) => e.id === sel) ?? null : null;
  const relatedNodes = sel
    ? result.network.nodes.filter((n) => n.evidenceIds.includes(sel))
    : [];
  const relatedFindings = sel ? result.findings.filter((f) => f.evidenceIds.includes(sel)) : [];

  return (
    <div className="grid grid-cols-1 gap-px border border-border bg-border lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="relative bg-background px-4 py-5">
        <div className="frab-grid pointer-events-none absolute inset-0 opacity-[0.10]" />
        <div className="relative">
          <Mono className="block text-[10px] text-lime">EVIDENCE BOARD</Mono>
          <Mono className="mt-1 block text-[8px] text-muted-foreground">
            {result.evidence.length} ITEMS RETURNED · PIN AN ITEM TO INSPECT ITS SOURCE
          </Mono>

          {result.evidence.length === 0 ? (
            <Mono className="mt-8 block text-[9px] text-warning">EVIDENCE {NA}</Mono>
          ) : (
            <>
              <div className="mt-5 flex justify-center">
                <span className="border border-lime/60 bg-lime-soft px-4 py-1.5">
                  <Mono className="text-[9px] text-lime">CASE {result.caseId}</Mono>
                </span>
              </div>
              <div className="mx-auto h-5 w-px bg-border" />

              <div className="flex flex-wrap gap-px bg-border">
                {groups.map((g) => (
                  <div key={g.key} className="min-w-[150px] flex-1 bg-background px-2 py-3">
                    <div className="border-t border-border pt-2">
                      <Mono className="block truncate text-[8px] text-technical">
                        <span title={g.label}>{g.label}</span>
                      </Mono>
                      {g.score !== null ? (
                        <Mono className="mt-0.5 block text-[8px] text-muted-foreground">
                          {g.score} / 100
                        </Mono>
                      ) : null}
                    </div>
                    <ul className="mt-3 space-y-2">
                      {g.items.map((e) => {
                        const active = sel === e.id;
                        return (
                          <li key={`${g.key}-${e.id}`}>
                            <button
                              onClick={() => setSel(active ? null : e.id)}
                              className={`w-full border px-2.5 py-2 text-left transition-colors ${
                                active
                                  ? "border-lime bg-lime-soft"
                                  : "border-border bg-surface hover:bg-elevated"
                              }`}
                            >
                              <Mono
                                className={`block text-[9px] ${active ? "text-lime" : "text-technical"}`}
                              >
                                {e.id}
                              </Mono>
                              <Mono className="mt-1 block truncate text-[8px] text-muted-foreground">
                                {e.title}
                              </Mono>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-surface px-5 py-5">
        {item ? (
          <div className="frab-page-in">
            <Mono className="block text-[9px] text-lime">{item.id}</Mono>
            <Mono className="mt-1 block text-[8px] text-muted-foreground">{item.title}</Mono>
            <p className="mt-3 text-[13px] leading-relaxed text-foreground">{item.summary}</p>

            <dl className="mt-4 grid grid-cols-2 gap-3">
              {[
                ["SOURCE", item.source],
                ["DATA FIELD", item.dataField],
                ["OBSERVED", item.observed],
                ["BASELINE", item.baseline],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <Mono className="block text-[8px] text-muted-foreground">{k}</Mono>
                  <p className="mt-1 break-words text-[11.5px] leading-relaxed text-foreground">{v}</p>
                </div>
              ))}
            </dl>

            <p className="mt-4 text-[12px] leading-relaxed text-secondary-foreground">
              {item.whyItMatters}
            </p>

            <div className="mt-5 border-t border-border pt-3">
              <Mono className="block text-[8px] text-muted-foreground">CONNECTED ELEMENTS</Mono>
              {relatedNodes.length === 0 && relatedFindings.length === 0 ? (
                <Mono className="mt-2 block text-[8px] text-technical">
                  NO LINKED ELEMENTS RETURNED
                </Mono>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {relatedNodes.map((n) => (
                    <li key={n.id}>
                      <Mono className="text-[8px] text-technical">{n.kind.replace(/_/g, " ")}</Mono>{" "}
                      <Mono className="text-[9px] text-lime">{n.label}</Mono>
                    </li>
                  ))}
                  {relatedFindings.map((f) => (
                    <li key={f.no} className="text-[11.5px] leading-relaxed text-foreground">
                      {f.statement}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <Mono className="block text-[9px] text-muted-foreground">
            SELECT AN EVIDENCE OBJECT TO VIEW ITS SOURCE DATA
          </Mono>
        )}
      </div>
    </div>
  );
}
