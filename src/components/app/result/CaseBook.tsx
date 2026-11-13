import { useEffect, useMemo, useRef, useState } from "react";
import {
  EXPORT_AVAILABLE,
  caseExportUrl,
  fetchInvestigationResult,
  startEscalationCall,
  submitAnalystDecision,
  type AnalystAction,
  type AnalystDecisionRecord,
  type CallingAgentState,
  type InvestigationResult,
} from "../../../lib/frab-result";
import { useVoiceEscalation } from "../../../hooks/useVoiceEscalation";
import { useAccountDrainProtection } from "../../../hooks/useAccountDrainProtection";
import { ErrorBlock, LoadingBlock, Mono } from "../ui";
import MoneyTrace from "./MoneyTrace";
import CrimeDnaFingerprint from "./CrimeDnaFingerprint";
import IncidentReconstruction from "./pages/IncidentReconstruction";
import EvidenceWall from "./pages/EvidenceWall";
import RegulatoryFlow from "./pages/RegulatoryFlow";
import ReasoningChain from "./pages/ReasoningChain";
import DecisionRoom from "./pages/DecisionRoom";
import AuditTimeline from "./pages/AuditTimeline";

const NA = "NOT AVAILABLE";

function PageShell({
  no,
  title,
  subtitle,
  children,
}: {
  no: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-6 py-6 md:px-10">
      <header className="mb-5">
        <Mono className="text-[9px] text-lime">
          {no} / {title}
        </Mono>
        {subtitle ? (
          <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-technical">{subtitle}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <Mono className="block text-[8px] text-muted-foreground">{label}</Mono>
      <Mono
        className={`mt-1.5 block truncate text-[10px] tracking-[0.14em] md:text-[9.5px] ${value ? "text-foreground" : "text-warning"}`}
      >
        <span title={value ?? NA}>{value ?? NA}</span>
      </Mono>
    </div>
  );
}

const TABS = [
  "OVERVIEW",
  "DNA",
  "EVIDENCE",
  "NETWORK",
  "REGULATORY",
  "EXPLANATION",
  "ACTION",
  "AUDIT",
];

export default function CaseBook({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const voice = useVoiceEscalation(caseId);
  const protection = useAccountDrainProtection(caseId);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [decision, setDecision] = useState<AnalystDecisionRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [call, setCall] = useState<CallingAgentState | null>(null);
  const [callDialog, setCallDialog] = useState(false);
  const [calling, setCalling] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [printAll, setPrintAll] = useState(false);
  const [evidenceFocus, setEvidenceFocus] = useState<string | null>(null);
  const prevPage = useRef(0);

  const load = () => {
    setState("loading");
    fetchInvestigationResult(caseId)
      .then((r) => {
        setResult(r);
        setDecision(r.decision);
        setCall(r.callingAgent);
        setState("ready");
      })
      .catch(() => setState("error"));
  };

  useEffect(load, [caseId]);
  useEffect(() => setPage(0), [caseId]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const decide = (action: AnalystAction) => {
    if (!result) return;
    setSubmitting(true);
    submitAnalystDecision(caseId, {
      action,
      overridden: action !== (result.recommendation as unknown as AnalystAction),
      reason: "Analyst decision recorded from case book.",
    })
      .then(setDecision)
      .catch(() => undefined)
      .finally(() => setSubmitting(false));
  };

  const runCall = () => {
    // SCN07 mule case: run the TEMPORARY PROTECTION harness (freeze beneficiary
    // → REAL voice verification → confirm/deny branch). Voice is real.
    if (protection.active) {
      protection.trigger();
      setCallDialog(false);
      return;
    }
    // When the voice service is configured, drive the real escalation through
    // it (backend resolves phone + verification; we only supply case context).
    if (voice.available && result) {
      voice.start({
        alert_id: result.alert.alertId,
        frab_recommendation: result.recommendation,
        risk_tier: result.alert.risk,
      });
      setCallDialog(false);
      return;
    }
    // Fallback: the legacy stub, when no voice service is connected.
    setCalling(true);
    startEscalationCall(caseId)
      .then(setCall)
      .catch(() =>
        setCall({
          state: "NOT_CONNECTED",
          contact: null,
          detail: "Escalation call could not be started.",
        }),
      )
      .finally(() => {
        setCalling(false);
        setCallDialog(false);
      });
  };

  const doExport = () => {
    const url = caseExportUrl(caseId);
    if (EXPORT_AVAILABLE && url) {
      window.open(url, "_blank", "noopener");
      setExportNote("COMPLETE CASE BOOK EXPORT REQUESTED FROM BACKEND");
      return;
    }
    setExportNote(
      "BACKEND PDF EXPORT NOT CONNECTED — RENDERING ALL 8 SECTIONS FOR BROWSER PRINT / PDF. NO SERVER-SIDE REPORT WAS GENERATED.",
    );
    setPrintAll(true);
    window.setTimeout(() => {
      window.print();
      setPrintAll(false);
    }, 60);
  };

  const goEvidence = (id: string) => {
    setEvidenceFocus(id);
    setPage(2);
  };

  const pages = useMemo(() => {
    if (!result) return [] as { title: string; node: React.ReactNode }[];

    const overview = (
      <PageShell
        no="01"
        title="INVESTIGATION OVERVIEW"
        subtitle="What happened — reconstructed from the entities returned by the investigation."
      >
        <IncidentReconstruction result={result} onOpenEvidence={goEvidence} />
      </PageShell>
    );

    const dna = (
      <PageShell
        no="02"
        title="CRIME DNA FINGERPRINT"
        subtitle="Deterministic behavioural fingerprint. Computed by the backend. No score is calculated in the interface."
      >
        <CrimeDnaFingerprint result={result} onOpenEvidence={() => setPage(2)} />
      </PageShell>
    );

    const evidence = (
      <PageShell
        no="03"
        title="CONTEXTUAL EVIDENCE"
        subtitle="Evidence gathered by Detective, pinned to the risk components the backend linked it to."
      >
        <EvidenceWall result={result} focusId={evidenceFocus} />
      </PageShell>
    );

    const network = (
      <PageShell
        no="04"
        title="TRACE THE MONEY"
        subtitle="Financial relationships reconstructed from the investigation network graph."
      >
        <MoneyTrace network={result.network} />
      </PageShell>
    );

    const regulatory = (
      <PageShell
        no="05"
        title="REGULATORY RISK ASSESSMENT"
        subtitle="Regulatory context retrieved by Jurist, connected to the evidence supporting the assessment."
      >
        <RegulatoryFlow result={result} />
      </PageShell>
    );

    const explanation = (
      <PageShell
        no="06"
        title="AUDIT-READY EXPLANATION"
        subtitle="How FRAB reached this conclusion, stage by stage."
      >
        <ReasoningChain result={result} onOpenEvidence={goEvidence} />
      </PageShell>
    );

    const action = (
      <PageShell
        no="07"
        title="RECOMMENDED ACTION"
        subtitle="FRAB recommends. The analyst decides."
      >
        <DecisionRoom
          result={result}
          decision={decision}
          submitting={submitting}
          onDecide={decide}
        />
      </PageShell>
    );

    const audit = (
      <PageShell
        no="08"
        title="VOICE ESCALATION + AUDIT TRAIL"
        subtitle="Recorded investigation events. Nothing is added by the interface."
      >
        <AuditTimeline
          result={result}
          decision={decision}
          call={call}
          voice={protection.active ? protection.voice : voice.state}
          voiceStarting={protection.active ? protection.voiceStarting : voice.starting}
          voiceError={protection.active ? protection.voiceError : voice.error}
          voiceAvailable={voice.available}
          protection={
            protection.active
              ? {
                  active: true,
                  state: protection.state,
                  events: protection.events,
                  context: {
                    victimAccount: protection.context.victimAccount,
                    protectedBeneficiary: protection.context.protectedBeneficiary,
                    customerName: protection.context.customerName,
                    triggerAmount: protection.context.triggerAmount,
                  },
                  starting: protection.voiceStarting,
                  onKeep: protection.keepProtection,
                  onRelease: protection.releaseProtection,
                  onContinue: protection.continueInvestigation,
                }
              : null
          }
          onRequestCall={() => setCallDialog(true)}
        />
      </PageShell>
    );

    return [
      { title: "INVESTIGATION OVERVIEW", node: overview },
      { title: "CRIME DNA FINGERPRINT", node: dna },
      { title: "CONTEXTUAL EVIDENCE", node: evidence },
      { title: "TRACE THE MONEY", node: network },
      { title: "REGULATORY RISK", node: regulatory },
      { title: "AUDIT-READY EXPLANATION", node: explanation },
      { title: "RECOMMENDED ACTION", node: action },
      { title: "VOICE ESCALATION + AUDIT TRAIL", node: audit },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    result,
    decision,
    submitting,
    call,
    evidenceFocus,
    voice.state,
    voice.starting,
    voice.error,
    protection.active,
    protection.state,
    protection.events,
    protection.voice,
    protection.voiceStarting,
  ]);

  const total = pages.length || 8;
  const current = Math.min(page, Math.max(0, pages.length - 1));
  const isLast = current === pages.length - 1;
  const back = current < prevPage.current;
  useEffect(() => {
    prevPage.current = current;
  }, [current]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-6">
      <div
        className="absolute inset-0 bg-background/85 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      <div className="relative flex h-[96dvh] w-full max-w-[1180px] flex-col overflow-hidden border border-border bg-background shadow-[0_0_60px_rgba(0,0,0,0.75)] md:h-[88dvh]">
        <header className="shrink-0 border-b border-border bg-surface px-5 py-4 md:px-8 md:py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <Mono className="text-[9px] text-lime">FRAB INVESTIGATION DOSSIER</Mono>
              <h2 className="mt-1.5 font-mono text-base tracking-[0.12em] text-foreground md:text-lg">
                CASE {caseId}
              </h2>
              {result ? (
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  <Mono
                    className={`border px-2 py-0.5 text-[9px] ${
                      result.alert.risk === "HIGH"
                        ? "border-critical/60 text-critical"
                        : result.alert.risk === "MEDIUM"
                          ? "border-warning/60 text-warning"
                          : "border-border text-technical"
                    }`}
                  >
                    {result.alert.risk} RISK
                  </Mono>
                  <Mono className="border border-border px-2 py-0.5 text-[9px] text-secondary-foreground">
                    {result.status === "COMPLETE"
                      ? "INVESTIGATION COMPLETE"
                      : result.status.replace(/_/g, " ")}
                  </Mono>
                </span>
              ) : null}
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={doExport}
                  className="border border-lime/70 bg-lime-soft px-4 py-2 font-mono text-[9px] tracking-[0.2em] text-lime transition-colors hover:bg-lime hover:text-background"
                >
                  [ EXPORT CASE BOOK ]
                </button>
                <button
                  onClick={onClose}
                  className="border border-border bg-surface px-3 py-2 font-mono text-[9px] tracking-[0.2em] text-secondary-foreground transition-colors hover:bg-elevated hover:text-foreground"
                >
                  [ CLOSE ]
                </button>
              </div>
              {result ? (
                <span
                  className={`flex items-center gap-2 border-l-2 px-2 py-1 ${
                    result.source === "live"
                      ? "border-l-lime bg-lime-soft"
                      : "border-l-warning bg-warning/10"
                  }`}
                >
                  <Mono className="text-[8px] text-muted-foreground">DATA SOURCE</Mono>
                  <Mono
                    className={`text-[8px] ${result.source === "live" ? "text-lime" : "text-warning"}`}
                  >
                    {result.source === "live"
                      ? "LIVE BACKEND CONNECTED"
                      : "DEMO DATA · BACKEND NOT CONNECTED"}
                  </Mono>
                </span>
              ) : null}
            </div>
          </div>

          {result ? (
            <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-border pt-3 md:grid-cols-[1.7fr_1fr_1fr_1.1fr_1.2fr]">
              <Meta label="ALERT" value={result.alert.type} />
              <Meta label="CUSTOMER" value={result.alert.customer} />
              <Meta label="ACCOUNT" value={result.alert.account} />
              <Meta label="TRANSACTION" value={result.alert.transaction} />
              <Meta label="INVESTIGATION TIMESTAMP" value={result.alert.completedAt} />
            </div>
          ) : null}

          {result ? (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3">
              {TABS.map((t, i) => (
                <button
                  key={t}
                  onClick={() => setPage(i)}
                  className={`border-b pb-0.5 font-mono text-[9px] tracking-[0.18em] transition-colors ${
                    i === current
                      ? "border-b-lime text-lime"
                      : "border-b-transparent text-technical hover:text-foreground"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")} {t}
                </button>
              ))}
            </div>
          ) : null}

          {exportNote ? (
            <Mono className="mt-3 block text-[8px] leading-relaxed text-warning">{exportNote}</Mono>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          {state === "loading" ? (
            <LoadingBlock label="OPENING CASE FILE" />
          ) : state === "error" || !result ? (
            <ErrorBlock label="CASE FILE UNAVAILABLE" onRetry={load} />
          ) : printAll ? (
            <>
              {pages.map((p) => (
                <div key={p.title}>{p.node}</div>
              ))}
            </>
          ) : (
            <div key={current} className={back ? "frab-page-back" : "frab-page-in"}>
              {pages[current]?.node}
            </div>
          )}
        </div>

        {state === "ready" && result ? (
          <footer className="shrink-0 border-t border-border px-6 py-3.5 md:px-10">
            <div className="flex items-center justify-between gap-4">
              <button
                disabled={current === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="border border-border bg-surface px-4 py-2 font-mono text-[9px] tracking-[0.2em] text-secondary-foreground transition-colors hover:bg-elevated hover:border-lime/60 hover:text-lime disabled:opacity-35 disabled:hover:bg-surface disabled:hover:border-border disabled:hover:text-secondary-foreground"
              >
                [ ← PREVIOUS ]
              </button>
              <Mono className="text-[9px] text-technical">
                PAGE {String(current + 1).padStart(2, "0")} / {String(total).padStart(2, "0")} ·{" "}
                <span className="text-foreground">{pages[current]?.title}</span>
              </Mono>
              {isLast ? (
                <button
                  onClick={onClose}
                  className="border border-lime/60 bg-lime-soft px-4 py-2 font-mono text-[9px] tracking-[0.2em] text-lime transition-colors hover:bg-lime hover:text-background"
                >
                  [ CLOSE CASE BOOK ]
                </button>
              ) : (
                <button
                  onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
                  className="border border-lime/50 bg-surface px-4 py-2 font-mono text-[9px] tracking-[0.2em] text-lime transition-colors hover:bg-lime-soft"
                >
                  [ NEXT → ]
                </button>
              )}
            </div>
          </footer>
        ) : null}
      </div>

      {callDialog && result ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-background/80"
            onClick={() => setCallDialog(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-md border border-border bg-surface px-6 py-6">
            <Mono className="text-[9px] text-lime">CALL ESCALATION AGENT</Mono>
            <div className="mt-4 space-y-3">
              <Meta label="CASE" value={result.caseId} />
              <Meta
                label="REASON"
                value={
                  result.recommendation === "ESCALATE"
                    ? "Escalation recommended based on investigation findings."
                    : `Analyst-initiated escalation. FRAB recommendation: ${result.recommendation.replace(/_/g, " ")}.`
                }
              />
              <Meta label="TARGET" value={call?.contact ?? null} />
            </div>
            <div className="mt-6 flex gap-2">
              <button
                disabled={calling}
                onClick={runCall}
                className="border border-lime/60 bg-lime-soft px-3 py-1.5 font-mono text-[9px] tracking-[0.2em] text-lime disabled:opacity-50"
              >
                {calling ? "[ STARTING… ]" : "[ START CALL ]"}
              </button>
              <button
                onClick={() => setCallDialog(false)}
                className="border border-border px-3 py-1.5 font-mono text-[9px] tracking-[0.2em] text-muted-foreground"
              >
                [ CANCEL ]
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
