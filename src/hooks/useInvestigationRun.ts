import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AGENT_META,
  AGENT_ORDER,
  clockLabel,
  DEMO_CASE,
  DEMO_CONFIDENTIAL,
  DEMO_SCRIPT,
  emptyRuntime,
  fetchInvestigationCase,
  fetchInvestigationEvents,
  INVESTIGATION_MODE,
  READY_CONFIDENTIAL,
  type AgentId,
  type AgentRuntime,
  type AgentState,
  type ConfidentialState,
  type Evidence,
  type InvestigationCase,
  type InvestigationEvent,
  type RunStatus,
  type ScriptStep,
} from "../lib/frab-investigation";
import { IS_WORKER_LIVE, subscribeToInvestigation, type WorkerEvent } from "../lib/frab-worker";

export interface RunSnapshot {
  mode: "live" | "demo";
  status: RunStatus;
  investigationCase: InvestigationCase;
  confidential: ConfidentialState;
  agents: Record<AgentId, AgentRuntime>;
  events: InvestigationEvent[];
  evidence: Evidence[];
  elapsedMs: number;
  activeAgent: AgentId | null;
  completedCount: number;
}

/** Derive an agent + state from a raw event code (worker or legacy). */
function deriveFromCode(code: string): { agent?: AgentId; state?: AgentState } {
  const agent = AGENT_ORDER.find((a) => code.includes(a));
  if (!agent) return {};
  // Worker emits *_COMPLETED; legacy demo emits *_COMPLETE — accept both.
  if (code.endsWith("_COMPLETE") || code.endsWith("_COMPLETED"))
    return { agent, state: "COMPLETE" };
  if (code.includes("_QUERYING") || code.includes("_TRACING") || code.includes("_RETRIEVING"))
    return { agent, state: "QUERYING" };
  if (code.includes("_ANALYZING") || code.includes("_ASSESSING") || code.includes("_COMPILING"))
    return { agent, state: "ANALYZING" };
  if (code.includes("_ERROR") || code.includes("_FAILED")) return { agent, state: "ERROR" };
  if (code.includes("_ACTIVE")) return { agent, state: "ACTIVE" };
  return { agent, state: "ACTIVE" };
}

export function useInvestigationRun(caseId = DEMO_CASE.id) {
  const live = INVESTIGATION_MODE === "live";

  const [status, setStatus] = useState<RunStatus>("DORMANT");
  const [investigationCase, setCase] = useState<InvestigationCase>(DEMO_CASE);
  const [agents, setAgents] = useState(emptyRuntime);
  const [events, setEvents] = useState<InvestigationEvent[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [elapsedMs, setElapsed] = useState(0);

  const cursor = useRef(0);
  const lastTick = useRef<number | null>(null);

  /* ---- fresh session per case ----
     When the case changes, wipe all run state so every investigation starts
     from a clean floor (agents IDLE/yellow) and animates to COMPLETE/green.
     Without this, opening a second case shows the previous run's finished
     (green) agents instead of replaying the sequence. */
  useEffect(() => {
    cursor.current = 0;
    lastTick.current = null;
    setStatus("DORMANT");
    setAgents(emptyRuntime());
    setEvents([]);
    setEvidence([]);
    setElapsed(0);
    setCase(DEMO_CASE);
  }, [caseId]);

  /* ---- case metadata (live backend when configured) ---- */
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    fetchInvestigationCase(caseId)
      .then((c) => !cancelled && setCase(c))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [caseId, live]);

  /* ---- worker investigations are already running server-side once created,
     so connect to the live stream automatically once the fresh session is set. ---- */
  useEffect(() => {
    if (live && IS_WORKER_LIVE) {
      // Defer to the next tick so the reset effect above lands first.
      const id = window.setTimeout(() => setStatus((s) => (s === "DORMANT" ? "RUNNING" : s)), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [live, caseId]);

  const applyStep = useCallback((step: ScriptStep, ts: string) => {
    setEvents((prev) => [...prev, { ts, code: step.code, agent: step.agent }]);
    if (step.agent) {
      const id = step.agent;
      setAgents((prev) => {
        const cur = prev[id];
        const next: AgentRuntime = {
          ...cur,
          state: step.state ?? (cur.state === "IDLE" ? "ACTIVE" : cur.state),
          task: step.task ?? cur.task,
          startedAt: cur.startedAt ?? ts,
          completedAt: step.state === "COMPLETE" ? ts : cur.completedAt,
          toolRuns: step.tool
            ? cur.toolRuns.map((t) => (t.name === step.tool ? { ...t, done: true } : t))
            : step.state === "COMPLETE"
              ? cur.toolRuns.map((t) => ({ ...t, done: true }))
              : cur.toolRuns,
          outputs: step.output ? [...cur.outputs, step.output] : cur.outputs,
        };
        // queue the next agent in the chain
        const handoff = AGENT_META[id].handoff;
        const updated = { ...prev, [id]: next };
        if (step.state === "COMPLETE" && handoff !== "INVESTIGATION RESULT") {
          const h = updated[handoff];
          if (h.state === "IDLE") updated[handoff] = { ...h, state: "QUEUED", task: "QUEUED" };
        }
        return updated;
      });
    }
    if (step.evidence && step.agent) {
      const ev = step.evidence;
      const agent = step.agent;
      setEvidence((prev) =>
        prev.some((e) => e.id === ev.id) ? prev : [...prev, { ...ev, agent, ts }],
      );
    }
    if (step.code === "INVESTIGATION_COMPLETE") setStatus("COMPLETE");
  }, []);

  /* ---- apply a live worker SSE event ---- */
  const applyWorkerEvent = useCallback((evt: WorkerEvent) => {
    const ts = clockLabel(evt.timestamp ? new Date(evt.timestamp) : new Date());
    const code = evt.event;
    const meta = evt.metadata ?? {};
    const explicitAgent = AGENT_ORDER.find((a) => (evt.agent ?? "").toUpperCase().includes(a));
    const derived = deriveFromCode(code);
    const agent = explicitAgent ?? derived.agent;

    setEvents((prev) => [...prev, { ts, code, agent }]);

    if (code === "INVESTIGATION_COMPLETE") setStatus("COMPLETE");
    if (code === "FAILED" || code === "PARTIAL") setStatus("COMPLETE");
    if (!agent) return;

    const reasoning = typeof meta["reason"] === "string" ? (meta["reason"] as string) : undefined;
    const toolName = typeof meta["tool"] === "string" ? (meta["tool"] as string) : undefined;
    const output =
      typeof meta["output"] === "string"
        ? (meta["output"] as string)
        : typeof meta["recommendation"] === "string"
          ? `RECOMMENDATION: ${meta["recommendation"] as string}`
          : reasoning;

    setAgents((prev) => {
      const cur = prev[agent];
      const nextState = derived.state ?? (cur.state === "IDLE" ? "ACTIVE" : cur.state);
      const next: AgentRuntime = {
        ...cur,
        state: nextState,
        task: code.replace(`${agent}_`, "").replace(/_/g, " ") || cur.task,
        startedAt: cur.startedAt ?? ts,
        completedAt: nextState === "COMPLETE" ? ts : cur.completedAt,
        toolRuns: toolName
          ? cur.toolRuns.map((t) => (t.name === toolName ? { ...t, done: true } : t))
          : nextState === "COMPLETE"
            ? cur.toolRuns.map((t) => ({ ...t, done: true }))
            : cur.toolRuns,
        outputs: output && !cur.outputs.includes(output) ? [...cur.outputs, output] : cur.outputs,
      };
      const updated = { ...prev, [agent]: next };
      const handoff = AGENT_META[agent].handoff;
      if (nextState === "COMPLETE" && handoff !== "INVESTIGATION RESULT") {
        const h = updated[handoff];
        if (h.state === "IDLE") updated[handoff] = { ...h, state: "QUEUED", task: "QUEUED" };
      }
      return updated;
    });

    // EVIDENCE_DISCOVERED carries an evidence item in metadata.
    if (code.includes("EVIDENCE_DISCOVERED")) {
      const id =
        typeof meta["evidence_id"] === "string" ? (meta["evidence_id"] as string) : undefined;
      const text =
        typeof meta["description"] === "string"
          ? (meta["description"] as string)
          : typeof meta["text"] === "string"
            ? (meta["text"] as string)
            : undefined;
      if (id && text) {
        setEvidence((prev) =>
          prev.some((e) => e.id === id) ? prev : [...prev, { id, text, agent, ts }],
        );
      }
    }
  }, []);

  /* ---- demo engine ---- */
  useEffect(() => {
    if (live || status !== "RUNNING") {
      lastTick.current = null;
      return;
    }
    const id = window.setInterval(() => {
      const now = performance.now();
      const prev = lastTick.current ?? now;
      lastTick.current = now;
      setElapsed((e) => {
        const next = e + (now - prev);
        while (cursor.current < DEMO_SCRIPT.length) {
          const step = DEMO_SCRIPT[cursor.current]!;
          if (step.at * 1000 > next) break;
          cursor.current += 1;
          applyStep(step, clockLabel());
        }
        return next;
      });
    }, 200);
    return () => window.clearInterval(id);
  }, [applyStep, live, status]);

  /* ---- live: worker SSE stream ----
     A completed case replays its whole event stream in milliseconds, which
     would flip every agent to green instantly with no visible progression.
     We buffer incoming events and drain them on a timer so the yellow→green
     sequence animates. Real events, real order — just paced for the floor. */
  useEffect(() => {
    if (!live || !IS_WORKER_LIVE || status !== "RUNNING") return;

    const queue: WorkerEvent[] = [];
    let streamDone = false;
    const STEP_MS = 700;

    const drain = window.setInterval(() => {
      const next = queue.shift();
      if (next) {
        applyWorkerEvent(next);
        return;
      }
      // Buffer empty: if the stream finished, mark complete and stop draining.
      if (streamDone) {
        setStatus("COMPLETE");
        window.clearInterval(drain);
      }
    }, STEP_MS);

    const unsubscribe = subscribeToInvestigation(caseId, {
      onEvent: (evt) => queue.push(evt),
      onDone: () => {
        streamDone = true;
      },
    });

    return () => {
      window.clearInterval(drain);
      unsubscribe();
    };
  }, [caseId, live, status, applyWorkerEvent]);

  /* ---- live without worker (bank only): no event stream available ---- */
  useEffect(() => {
    if (!live || IS_WORKER_LIVE || status !== "RUNNING") return;
    let stop = false;
    const poll = async () => {
      try {
        const list = await fetchInvestigationEvents(caseId);
        if (stop || !list.length) return;
        setEvents(list);
      } catch {
        /* no bank event stream — leave state as-is */
      }
    };
    void poll();
    return () => {
      stop = true;
    };
  }, [caseId, live, status]);

  const start = useCallback(() => {
    setStatus("RUNNING");
  }, []);
  const pause = useCallback(() => setStatus((s) => (s === "RUNNING" ? "PAUSED" : s)), []);
  const resume = useCallback(() => setStatus((s) => (s === "PAUSED" ? "RUNNING" : s)), []);
  const reset = useCallback(() => {
    cursor.current = 0;
    lastTick.current = null;
    setStatus("DORMANT");
    setAgents(emptyRuntime());
    setEvents([]);
    setEvidence([]);
    setElapsed(0);
  }, []);

  const activeAgent = useMemo(() => {
    const running = AGENT_ORDER.filter((a) => a !== "SUPERVISOR").find((a) =>
      ["ACTIVE", "QUERYING", "ANALYZING"].includes(agents[a].state),
    );
    return running ?? (agents.SUPERVISOR.state === "ACTIVE" ? "SUPERVISOR" : null);
  }, [agents]);

  const completedCount = AGENT_ORDER.filter((a) => agents[a].state === "COMPLETE").length;

  const snapshot: RunSnapshot = {
    mode: live ? "live" : "demo",
    status,
    investigationCase,
    confidential:
      live && status !== "DORMANT"
        ? READY_CONFIDENTIAL
        : live
          ? READY_CONFIDENTIAL
          : DEMO_CONFIDENTIAL,
    agents,
    events,
    evidence,
    elapsedMs,
    activeAgent,
    completedCount,
  };

  return { ...snapshot, start, pause, resume, reset };
}
