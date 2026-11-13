import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildTour, type DialogueContext } from "../../../lib/frab-agent-dialogue";
import {
  clearActiveCase,
  markActiveCaseComplete,
  useActiveCase,
} from "../../../lib/frab-case-state";
import { elapsedLabel, type AgentId } from "../../../lib/frab-investigation";
import { useInvestigationRun } from "../../../hooks/useInvestigationRun";
import { Mono } from "../ui";
import Dialogue from "./Dialogue";
import SummaryPanel from "./SummaryPanel";
import Room3D, { type FocusTarget } from "./room3d/Room3D";

const ROLES = ["COMPLIANCE ANALYST", "AML INVESTIGATOR", "INTERNAL AUDITOR"] as const;

export default function WorkspaceView({ caseId }: { caseId?: string | undefined }) {
  const activeCase = useActiveCase();
  const navigate = useNavigate();
  const run = useInvestigationRun(caseId);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [analyst, setAnalyst] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentId | null>(null);
  const [focus, setFocus] = useState<FocusTarget>("CENTER");
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const [arrived, setArrived] = useState(true);
  const [mounted, setMounted] = useState(false);
  const greeted = useRef(false);

  // Client-mount flag so we don't flash the locked screen during SSR/hydration
  // before the active-case store has resolved.
  useEffect(() => setMounted(true), []);

  const fitFloor = useCallback(() => {
    setSelected(null);
    setTourStep(null);
    setFocus("CENTER");
    setFitSignal((n) => n + 1);
  }, []);

  // End the session: clear the active case (re-locks the confidential floor)
  // and return to Alert Intelligence.
  const endSession = useCallback(() => {
    clearActiveCase();
    void navigate({ to: "/alerts" });
  }, [navigate]);

  const activeId = caseId ?? run.investigationCase.id;
  const complete = run.status === "COMPLETE";

  // Fresh workspace session whenever the case changes: re-arm the analyst
  // gate, greeting and "initialized" banner so a new case replays from scratch
  // instead of inheriting the previous case's UI state.
  useEffect(() => {
    setAnalyst(null);
    setSelected(null);
    setFocus("CENTER");
    setEvidenceId(null);
    setTourStep(null);
    setArrived(true);
    greeted.current = false;
  }, [caseId]);

  useEffect(() => {
    if (complete) markActiveCaseComplete(activeId);
  }, [complete, activeId]);

  // lock the page: the workspace is a fixed application viewport
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const recommendation = useMemo(
    () =>
      run.agents.SCRIBE.outputs
        .find((o) => o.startsWith("RECOMMENDATION:"))
        ?.replace("RECOMMENDATION:", "")
        .trim() ?? null,
    [run.agents.SCRIBE.outputs],
  );

  const ctx: DialogueContext = {
    investigationCase: { ...run.investigationCase, id: activeId },
    caseId: activeId,
    agents: run.agents,
    evidence: run.evidence,
    status: run.status,
    recommendation,
    mode: run.mode,
  };

  const tour = useMemo(() => buildTour(ctx), [activeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const tourLine = tourStep !== null ? tour[tourStep] : undefined;

  /* supervisor greets automatically the first time each case's floor is entered */
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (greeted.current) return;
      greeted.current = true;
      setTourStep(0);
    }, 700);
    return () => window.clearTimeout(id);
  }, [caseId]);

  useEffect(() => {
    if (!tourLine) return;
    setFocus(tourLine.focus);
    const id = window.setTimeout(() => {
      setTourStep((s) => (s === null ? null : s + 1 < tour.length ? s + 1 : null));
    }, tourLine.hold);
    return () => window.clearTimeout(id);
  }, [tourStep, tourLine, tour.length]);

  useEffect(() => {
    const id = window.setTimeout(() => setArrived(false), 2200);
    return () => window.clearTimeout(id);
  }, [caseId]);

  const endTour = useCallback(() => {
    setTourStep(null);
    setFocus("CENTER");
  }, []);

  const selectAgent = useCallback((id: AgentId) => {
    setTourStep(null);
    setSelected((cur) => {
      const next = cur === id ? null : id;
      setFocus(next ?? "CENTER");
      return next;
    });
  }, []);

  const selectedEvidence = run.evidence.find((e) => e.id === evidenceId) ?? null;
  const dormant = run.status === "DORMANT";
  const showIdentify = analyst === null && tourStep === null;

  const btn =
    "border border-border px-2.5 py-1 font-mono text-[9px] tracking-[0.2em] text-foreground transition-colors hover:border-lime/60 hover:text-lime disabled:opacity-35 disabled:hover:border-border disabled:hover:text-foreground";

  // Confidential workspace gate: the 3D floor is only accessible while an
  // investigation is open AND the URL's case matches the active case. This
  // blocks direct navigation to an arbitrary /investigation/{id} and re-locks
  // once a session is ended.
  const caseMatches = !caseId || !activeCase || activeCase.caseId === caseId;
  const locked = mounted && (!activeCase || !caseMatches);
  if (locked) {
    return (
      <div className="fixed inset-x-0 bottom-0 top-[90px] flex items-center justify-center overflow-hidden bg-background px-6 lg:left-[272px] lg:top-0">
        <div className="frab-grid pointer-events-none absolute inset-0 opacity-[0.08]" />
        <div className="relative w-full max-w-md border border-critical/40 bg-surface p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center border border-critical/50 text-critical">
            <span className="font-mono text-lg">⛒</span>
          </div>
          <Mono className="mt-5 block text-[10px] tracking-[0.28em] text-critical">
            CONFIDENTIAL WORKSPACE LOCKED
          </Mono>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            The investigation floor is a confidential compute space. It can only be accessed while
            FRAB is actively working a case. No case is currently open.
          </p>
          <Mono className="mt-4 block text-[8px] tracking-[0.2em] text-muted-foreground">
            OPEN AN ALERT AND INITIALIZE AN INVESTIGATION TO ENTER
          </Mono>
          <Link
            to="/alerts"
            className="mt-6 inline-block border border-lime/60 bg-lime-soft px-4 py-2.5 font-mono text-[10px] tracking-[0.22em] text-lime transition-colors hover:bg-lime/20"
          >
            [ GO TO ALERT INTELLIGENCE ]
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 top-[90px] flex flex-col overflow-hidden bg-background lg:left-[272px] lg:top-0">
      {/* compact top bar */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-border bg-surface px-4 py-2.5">
        <Mono className="text-[9px] text-muted-foreground">
          CASE <span className="text-lime">{activeId}</span>
        </Mono>
        <Mono className="text-[9px] text-muted-foreground">
          STATUS <span className="text-foreground">{run.status}</span>
        </Mono>
        <Mono className="hidden text-[9px] text-muted-foreground sm:inline">
          TIME <span className="text-foreground">{elapsedLabel(run.elapsedMs)}</span>
        </Mono>
        <Mono className="hidden text-[9px] text-muted-foreground md:inline">
          EVIDENCE <span className="text-foreground">{run.evidence.length}</span>
        </Mono>
        <Mono className="hidden text-[9px] text-muted-foreground md:inline">
          {run.mode === "live" ? "LIVE BACKEND" : "DEMO ENVIRONMENT"}
        </Mono>

        <div className="ml-auto flex items-center gap-2">
          <button className={btn} onClick={fitFloor}>
            [ FIT FLOOR ]
          </button>
          <button className={btn} onClick={run.pause} disabled={run.status !== "RUNNING"}>
            [ PAUSE ]
          </button>
          <button className={btn} onClick={run.resume} disabled={run.status !== "PAUSED"}>
            [ RESUME ]
          </button>
          <button className={btn} onClick={() => setConfirmReset(true)} disabled={dormant}>
            [ RESET ]
          </button>
          {complete ? (
            <Link
              to="/case/$caseId"
              params={{ caseId: activeId }}
              className="border border-lime/60 bg-lime-soft px-2.5 py-1 font-mono text-[9px] tracking-[0.2em] text-lime hover:bg-lime/20"
            >
              [ RESULT ]
            </Link>
          ) : null}
          <button
            className="border border-critical/60 px-2.5 py-1 font-mono text-[9px] tracking-[0.2em] text-critical transition-colors hover:bg-critical/10"
            onClick={() => setConfirmEnd(true)}
          >
            [ END CASE ]
          </button>
        </div>
      </header>

      {/* floor + summary */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-0 flex-[3] lg:flex-[4]">
          <Room3D
            fitSignal={fitSignal}
            agents={run.agents}
            evidence={run.evidence}
            status={run.status}
            activeAgent={run.activeAgent}
            selected={selected}
            focus={focus}
            speaking={tourLine ? "SUPERVISOR" : selected}
            onSelect={selectAgent}
            onSelectEvidence={(id) => {
              setEvidenceId(id);
              selectAgent("DETECTIVE");
            }}
          />

          <div className="pointer-events-none absolute left-4 top-3">
            <Mono className="text-[8px] text-muted-foreground">
              DRAG TO ORBIT · SCROLL TO ZOOM · CLICK AN AGENT TO SPEAK
            </Mono>
          </div>

          {/* agent dialogue */}
          {selected && !tourLine ? (
            <div className="pointer-events-none absolute bottom-4 left-4 z-20">
              <Dialogue
                agent={selected}
                ctx={ctx}
                analyst={analyst ?? "ANALYST"}
                onClose={() => {
                  setSelected(null);
                  setFocus("CENTER");
                }}
              />
            </div>
          ) : null}

          {/* evidence callout */}
          {selectedEvidence ? (
            <div className="absolute bottom-4 right-4 z-20 max-w-xs border border-lime/50 bg-background/95 p-3 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-4">
                <Mono className="text-[9px] text-lime">{selectedEvidence.id}</Mono>
                <button
                  onClick={() => setEvidenceId(null)}
                  className="font-mono text-[8px] tracking-[0.2em] text-muted-foreground"
                >
                  [ CLOSE ]
                </button>
              </div>
              <p className="mt-2 text-xs text-foreground">{selectedEvidence.text}</p>
              <Mono className="mt-2 block text-[8px] text-muted-foreground">
                {selectedEvidence.agent} · {selectedEvidence.ts}
              </Mono>
            </div>
          ) : null}

          {/* supervisor walkthrough caption */}
          {tourLine ? (
            <div className="absolute inset-x-4 bottom-4 z-30 flex flex-wrap items-center gap-x-5 gap-y-2 border border-lime/40 bg-background/92 px-4 py-3 backdrop-blur-sm">
              <Mono className="text-[9px] text-lime">SUPERVISOR</Mono>
              <p className="flex-1 text-sm text-foreground">{tourLine.text}</p>
              <div className="flex items-center gap-2">
                <button
                  className={btn}
                  onClick={() =>
                    setTourStep((s) => (s === null ? null : s + 1 < tour.length ? s + 1 : null))
                  }
                >
                  [ NEXT ]
                </button>
                <button className={btn} onClick={endTour}>
                  [ SKIP ]
                </button>
              </div>
            </div>
          ) : null}

          {/* analyst identification */}
          {showIdentify ? (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/75 px-6">
              <div className="w-full max-w-sm border border-border bg-surface p-6 backdrop-blur-sm">
                <Mono className="text-[9px] text-lime">IDENTIFY ANALYST</Mono>
                <p className="mt-3 text-sm text-muted-foreground">
                  Select the role you are working this case as. Demo identity only — no account is
                  created.
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        setAnalyst(r);
                        if (run.status === "DORMANT") run.start();
                        setSelected("SUPERVISOR");
                        setFocus("SUPERVISOR");
                      }}
                      className="border border-lime/50 px-3 py-2.5 font-mono text-[10px] tracking-[0.2em] text-lime transition-colors hover:bg-lime-soft"
                    >
                      [ {r} ]
                    </button>
                  ))}
                </div>
                <Mono className="mt-4 block text-[8px] text-muted-foreground">
                  {run.mode === "live"
                    ? "LIVE BACKEND · EVENTS STREAMED FROM INVESTIGATION SERVICE"
                    : "DEMO MODE · NO BACKEND CONFIGURED · SCRIPTED EVENT STREAM"}
                </Mono>
              </div>
            </div>
          ) : null}

          {arrived ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 animate-fade-in border border-lime/50 bg-background/90 px-3 py-1.5 text-center">
              <Mono className="block text-[9px] text-lime">INVESTIGATION INITIALIZED</Mono>
              <Mono className="mt-1 block text-[8px] text-muted-foreground">CASE {activeId}</Mono>
            </div>
          ) : null}

          {run.status === "PAUSED" ? (
            <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 border border-warning/60 bg-background/85 px-3 py-1.5">
              <Mono className="text-[9px] text-warning">INVESTIGATION PAUSED</Mono>
            </div>
          ) : null}
        </div>

        <aside className="min-h-0 w-full shrink-0 border-t border-border bg-surface lg:h-full lg:w-[300px] lg:border-l lg:border-t-0 flex-1 lg:flex-none">
          <SummaryPanel
            caseId={activeId}
            investigationCase={run.investigationCase}
            status={run.status}
            agents={run.agents}
            events={run.events}
            evidence={run.evidence}
            confidential={run.confidential}
            elapsedMs={run.elapsedMs}
            mode={run.mode}
            selected={selected}
            onSelectAgent={selectAgent}
            onSelectEvidence={(id) => setEvidenceId(id)}
          />
        </aside>
      </div>

      {confirmReset ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-6">
          <div className="w-full max-w-sm border border-border bg-surface p-6">
            <Mono className="text-[9px] text-warning">CONFIRM RESET</Mono>
            <p className="mt-3 text-sm text-muted-foreground">
              This clears the current investigation state, timeline and evidence for {activeId}.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setConfirmReset(false)} className={btn}>
                [ CANCEL ]
              </button>
              <button
                onClick={() => {
                  run.reset();
                  setSelected(null);
                  setFocus("CENTER");
                  setConfirmReset(false);
                }}
                className="border border-critical/70 px-2.5 py-1 font-mono text-[9px] tracking-[0.2em] text-critical"
              >
                [ RESET ]
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmEnd ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-6">
          <div className="w-full max-w-sm border border-border bg-surface p-6">
            <Mono className="text-[9px] text-critical">END CASE / CLOSE SESSION</Mono>
            <p className="mt-3 text-sm text-muted-foreground">
              This closes the investigation session for {activeId} and re-locks the confidential
              workspace. You can reopen an alert from Alert Intelligence to start a new
              investigation.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setConfirmEnd(false)} className={btn}>
                [ CANCEL ]
              </button>
              <button
                onClick={endSession}
                className="border border-critical/70 px-2.5 py-1 font-mono text-[9px] tracking-[0.2em] text-critical hover:bg-critical/10"
              >
                [ END CASE ]
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
