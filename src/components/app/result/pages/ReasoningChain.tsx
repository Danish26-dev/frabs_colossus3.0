import { useState } from "react";
import type { GuardrailInfo, InvestigationResult } from "../../../../lib/frab-result";
import { Mono } from "../../ui";

const NA = "NOT AVAILABLE";

const clean = (s: string | null) => (s ? s.replace(/_/g, " ") : NA);

/**
 * The evidence-grounding guardrail: shows what the LLM proposed, what the
 * deterministic engine implied, and what actually shipped. When they disagree,
 * this is the "LLM is never the source of truth" guarantee, made visible.
 */
function GuardrailPanel({ guardrail }: { guardrail: GuardrailInfo }) {
  const disagreed = guardrail.agree === false;
  return (
    <div
      className={`mt-4 border-l-2 px-4 py-3.5 ${disagreed ? "border-lime bg-lime-soft" : "border-border bg-surface"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <Mono className="text-[9px] text-lime">EVIDENCE-GROUNDING CROSS-CHECK</Mono>
        <Mono
          className={`border px-2 py-0.5 text-[8px] ${
            disagreed ? "border-lime/60 text-lime" : "border-border text-technical"
          }`}
        >
          {disagreed ? "OVERRIDE APPLIED" : "MODEL AGREED"}
        </Mono>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
        <div>
          <Mono className="block text-[8px] text-muted-foreground">LLM PROPOSED</Mono>
          <Mono
            className={`mt-1 block text-[11px] ${disagreed ? "text-warning" : "text-foreground"}`}
          >
            {clean(guardrail.llmProposed)}
          </Mono>
        </div>
        <Mono className="hidden text-[10px] text-technical md:block">→</Mono>
        <div>
          <Mono className="block text-[8px] text-muted-foreground">DETERMINISTIC ENGINE</Mono>
          <Mono className="mt-1 block text-[11px] text-foreground">
            {clean(guardrail.deterministicImplied)}
          </Mono>
        </div>
        <Mono className="hidden text-[10px] text-technical md:block">→</Mono>
        <div>
          <Mono className="block text-[8px] text-muted-foreground">SHIPPED</Mono>
          <Mono className="mt-1 block text-[11px] text-lime">{clean(guardrail.shipped)}</Mono>
        </div>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-secondary-foreground">
        {disagreed
          ? "The language model proposed a different disposition, but the deterministic engine recomputed the answer from the evidence and the auditable result shipped instead. The model can never override the computed numbers."
          : "The language model's proposal matched the deterministic engine. The auditable, computed result shipped."}
      </p>
      {guardrail.llmJustification ? (
        <p className="mt-2 text-[11px] leading-relaxed text-technical">
          <span className="text-muted-foreground">MODEL NOTE: </span>
          {guardrail.llmJustification}
        </p>
      ) : null}
    </div>
  );
}

type Stage = {
  key: string;
  label: string;
  line: string;
  detail: string;
  evidenceIds: string[];
  cta: string;
};

/**
 * Reasoning reconstruction built from the recorded investigation timeline and
 * findings. Stages exist only when the backend recorded them.
 */
export default function ReasoningChain({
  result,
  onOpenEvidence,
}: {
  result: InvestigationResult;
  onOpenEvidence: (id: string) => void;
}) {
  const stages: Stage[] = result.timeline.map((t, i) => ({
    key: `${t.ts}-${i}`,
    label: t.agent,
    line: t.action.replace(/_/g, " "),
    detail: t.result,
    evidenceIds: t.evidenceIds,
    cta: t.evidenceIds.length ? "SHOW EVIDENCE" : "NO EVIDENCE ATTACHED",
  }));

  const [sel, setSel] = useState(0);
  const active = stages[sel] ?? null;
  const finding = result.findings[sel] ?? null;

  return (
    <div className="grid grid-cols-1 gap-px border border-border bg-border lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="relative bg-background px-5 py-6">
        <div className="frab-grid pointer-events-none absolute inset-0 opacity-[0.10]" />
        <div className="relative">
          <Mono className="block text-[10px] text-lime">REASONING CHAIN</Mono>
          <Mono className="mt-1 block text-[8px] text-muted-foreground">
            RECONSTRUCTED FROM THE RECORDED INVESTIGATION
          </Mono>

          {stages.length === 0 ? (
            <Mono className="mt-6 block text-[9px] text-warning">INVESTIGATION EVENTS {NA}</Mono>
          ) : (
            <ol className="mt-5 border-l border-border">
              {stages.map((s, i) => {
                const on = i === sel;
                return (
                  <li key={s.key} className="relative pl-5">
                    <span
                      className={`absolute left-[-3.5px] top-[14px] h-1.5 w-1.5 ${on ? "bg-lime" : "bg-border"}`}
                    />
                    <button
                      onClick={() => setSel(i)}
                      className={`w-full py-2 text-left transition-colors ${on ? "text-lime" : "text-technical hover:text-foreground"}`}
                    >
                      <Mono className="text-[9px]">{s.label}</Mono>
                      <Mono className="ml-2 text-[8px] text-muted-foreground">{s.line}</Mono>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      <div className="bg-surface px-5 py-6">
        {active ? (
          <div className="frab-page-in">
            <Mono className="block text-[8px] text-muted-foreground">STAGE</Mono>
            <Mono className="mt-1 block text-[11px] text-lime">
              {active.label} · {active.line}
            </Mono>
            <p className="mt-3 text-[13px] leading-relaxed text-foreground">{active.detail}</p>
            {finding ? (
              <p className="mt-3 text-[12.5px] leading-relaxed text-secondary-foreground">
                {finding.statement}
              </p>
            ) : null}

            <Mono className="mt-4 block text-[8px] text-muted-foreground">{active.cta}</Mono>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {active.evidenceIds.map((id) => (
                <button
                  key={id}
                  onClick={() => onOpenEvidence(id)}
                  className="border border-border px-2 py-0.5 font-mono text-[9px] tracking-[0.18em] text-technical transition-colors hover:border-lime/60 hover:text-lime"
                >
                  {id}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-2 gap-px border-t border-border bg-border pt-px">
          <div className="bg-surface px-4 py-4">
            <Mono className="block text-[8px] text-muted-foreground">DETERMINISTIC CHECK</Mono>
            <p className="mt-1 font-mono text-xl leading-none text-lime">
              {result.riskScore === null ? (
                <span className="text-[11px] text-warning">{NA}</span>
              ) : (
                <>
                  {result.riskScore}
                  <span className="text-[11px] text-technical"> / 100</span>
                </>
              )}
            </p>
            <Mono className="mt-2 block text-[8px] text-technical">
              COMPONENTS · {result.riskComponents.length}
            </Mono>
          </div>
          <div className="bg-surface px-4 py-4">
            <Mono className="block text-[8px] text-muted-foreground">RECOMMENDATION RETURNED</Mono>
            <Mono className="mt-2 block text-[11px] text-foreground">
              {result.recommendation.replace(/_/g, " ")}
            </Mono>
            <Mono className="mt-2 block text-[8px] text-technical">
              {result.status === "COMPLETE"
                ? "SINGLE RECOMMENDATION RETURNED BY THE BACKEND"
                : result.status.replace(/_/g, " ")}
            </Mono>
          </div>
        </div>

        {result.guardrail ? <GuardrailPanel guardrail={result.guardrail} /> : null}

        {result.recommendation === "INSUFFICIENT_EVIDENCE" || result.status !== "COMPLETE" ? (
          <div className="mt-4 border-l-2 border-warning bg-warning/10 px-4 py-3">
            <Mono className="text-[9px] text-warning">⚠ HUMAN REVIEW REQUIRED</Mono>
            <p className="mt-1.5 text-[12px] leading-relaxed text-secondary-foreground">
              The investigation did not reach a confident disposition. Analyst review is required.
            </p>
          </div>
        ) : null}

        {result.unavailable.length ? (
          <div className="mt-4 border-l-2 border-warning pl-4">
            <Mono className="text-[9px] text-warning">EVIDENCE NOT AVAILABLE</Mono>
            {result.unavailable.map((u) => (
              <p key={u} className="mt-1 text-[12px] leading-relaxed text-secondary-foreground">
                {u}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
