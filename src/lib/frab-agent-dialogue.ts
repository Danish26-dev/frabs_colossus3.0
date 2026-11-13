/**
 * Agent dialogue layer for the Investigation Workspace.
 *
 * Every line an agent speaks is derived from the live investigation run
 * (agent runtime state, emitted outputs and discovered evidence). Nothing here
 * invents findings: when the run has produced no evidence or output yet the
 * agents say so explicitly, and the UI labels the environment as DEMO when no
 * backend is configured.
 */

import type {
  AgentId,
  AgentRuntime,
  Evidence,
  InvestigationCase,
  RunStatus,
} from "./frab-investigation";

export interface DialogueContext {
  investigationCase: InvestigationCase;
  caseId: string;
  agents: Record<AgentId, AgentRuntime>;
  evidence: Evidence[];
  status: RunStatus;
  recommendation: string | null;
  mode: "live" | "demo";
}

export interface AgentQuestion {
  q: string;
  answer: (ctx: DialogueContext) => string[];
}

export interface AgentPersona {
  role: string;
  tone: string;
  greeting: (ctx: DialogueContext) => string[];
  questions: AgentQuestion[];
}

const nothingYet = (what: string) => [`No ${what} recorded yet.`, "Ask me again once my step runs."];

function stateWord(rt: AgentRuntime) {
  switch (rt.state) {
    case "COMPLETE":
      return "My step is closed.";
    case "IDLE":
      return "I haven't been dispatched yet.";
    case "QUEUED":
      return "I'm queued behind the current step.";
    case "ERROR":
      return "My step errored out.";
    default:
      return `I'm mid-step: ${rt.task.toLowerCase()}.`;
  }
}

function evidenceOf(ctx: DialogueContext, id: AgentId) {
  return ctx.evidence.filter((e) => e.agent === id);
}

export const AGENT_PERSONA: Record<AgentId, AgentPersona> = {
  SUPERVISOR: {
    role: "INVESTIGATION ORCHESTRATION",
    tone: "OPERATIONS COORDINATOR",
    greeting: (ctx) => [
      "Analyst. You're finally here.",
      `I've had case ${ctx.caseId} running on this floor for a while.`,
      stateWord(ctx.agents.SUPERVISOR),
    ],
    questions: [
      {
        q: "Where does the investigation stand?",
        answer: (ctx) => {
          const done = (Object.keys(ctx.agents) as AgentId[]).filter(
            (a) => ctx.agents[a].state === "COMPLETE",
          );
          return [
            `Status: ${ctx.status}.`,
            done.length ? `Closed steps: ${done.join(", ")}.` : "No step has closed yet.",
            `Evidence on the board: ${ctx.evidence.length}.`,
          ];
        },
      },
      {
        q: "Who is doing what right now?",
        answer: (ctx) =>
          (Object.keys(ctx.agents) as AgentId[]).map(
            (a) => `${a}: ${ctx.agents[a].state} — ${ctx.agents[a].task}`,
          ),
      },
      {
        q: "What happens when this closes?",
        answer: (ctx) =>
          ctx.recommendation
            ? [`Scribe filed the recommendation: ${ctx.recommendation}.`, "The case file is ready."]
            : ["Scribe hasn't filed a recommendation yet.", "I'll tell you the moment it lands."],
      },
    ],
  },

  WATCHMAN: {
    role: "TRIAGE / VALIDATION",
    tone: "CONCISE · METHODICAL",
    greeting: (ctx) => {
      const rt = ctx.agents.WATCHMAN;
      const out = rt.outputs[rt.outputs.length - 1];
      return [
        "Analyst.",
        rt.state === "COMPLETE"
          ? "I validated the alert against the customer's behavioural baseline."
          : stateWord(rt),
        out ?? `Alert under review: ${ctx.investigationCase.alertType}.`,
      ];
    },
    questions: [
      {
        q: "Why did this alert survive triage?",
        answer: (ctx) => {
          const outs = ctx.agents.WATCHMAN.outputs;
          return outs.length ? outs : nothingYet("triage output");
        },
      },
      {
        q: "What signals did you extract?",
        answer: (ctx) => {
          const ev = evidenceOf(ctx, "WATCHMAN");
          const outs = ctx.agents.WATCHMAN.outputs;
          if (ev.length) return ev.map((e) => `${e.id} — ${e.text}`);
          return outs.length ? outs : nothingYet("signal");
        },
      },
      {
        q: "What is the alert type?",
        answer: (ctx) => [
          `Trigger: ${ctx.investigationCase.alertType}.`,
          `Customer: ${ctx.investigationCase.customer} · Account: ${ctx.investigationCase.account}.`,
          `Declared risk: ${ctx.investigationCase.risk}.`,
        ],
      },
    ],
  },

  DETECTIVE: {
    role: "EVIDENCE ACQUISITION",
    tone: "CURIOUS · INVESTIGATIVE",
    greeting: (ctx) => {
      const ev = evidenceOf(ctx, "DETECTIVE");
      return [
        "Analyst.",
        ev.length
          ? `I found ${ev.length} piece${ev.length === 1 ? "" : "s"} of relevant evidence.`
          : stateWord(ctx.agents.DETECTIVE),
        ev.length ? "Everything below is linked to a source query." : "Nothing on the board yet.",
      ];
    },
    questions: [
      {
        q: "Why is this transaction suspicious?",
        answer: (ctx) => {
          const ev = evidenceOf(ctx, "DETECTIVE");
          return ev.length ? ev.map((e) => `${e.id} — ${e.text}`) : nothingYet("finding");
        },
      },
      {
        q: "What did the customer history show?",
        answer: (ctx) => {
          const hits = ctx.agents.DETECTIVE.toolRuns.filter((t) => t.done).map((t) => t.name);
          return hits.length
            ? [`Queries executed: ${hits.join(", ")}.`, ...evidenceOf(ctx, "DETECTIVE").map((e) => e.text)]
            : nothingYet("query");
        },
      },
      {
        q: "Show me the network evidence.",
        answer: (ctx) => {
          const net = evidenceOf(ctx, "DETECTIVE").filter((e) =>
            /network|beneficiar|connect/i.test(e.text),
          );
          return net.length ? net.map((e) => `${e.id} — ${e.text}`) : nothingYet("network trace");
        },
      },
    ],
  },

  JURIST: {
    role: "REGULATORY CONTEXT",
    tone: "PRECISE · FORMAL",
    greeting: (ctx) => {
      const rt = ctx.agents.JURIST;
      return [
        "Analyst.",
        rt.state === "COMPLETE"
          ? "I've retrieved the relevant regulatory context."
          : stateWord(rt),
        "I will not infer beyond the cited material.",
      ];
    },
    questions: [
      {
        q: "Which regulations apply?",
        answer: (ctx) => {
          const src = ctx.agents.JURIST.outputs.filter((o) => /source|regul|fatf|rbi|pmla/i.test(o));
          return src.length ? src : nothingYet("citation");
        },
      },
      {
        q: "What is the regulatory exposure?",
        answer: (ctx) => {
          const outs = ctx.agents.JURIST.outputs;
          return outs.length ? outs : nothingYet("assessment");
        },
      },
      {
        q: "Is this reportable?",
        answer: (ctx) => {
          const outs = ctx.agents.JURIST.outputs.filter((o) => /report|str|expos/i.test(o));
          return outs.length
            ? outs
            : ["I have not issued a reportability position on this case yet."];
        },
      },
    ],
  },

  SCRIBE: {
    role: "AUDIT CASE BUILDER",
    tone: "ORGANIZED · CALM",
    greeting: (ctx) => {
      const rt = ctx.agents.SCRIBE;
      return [
        "Analyst.",
        rt.state === "COMPLETE"
          ? "The evidence package is ready."
          : stateWord(rt),
        rt.state === "COMPLETE"
          ? "Each finding is linked to its supporting evidence."
          : `Evidence currently indexed: ${ctx.evidence.length}.`,
      ];
    },
    questions: [
      {
        q: "What is in the case package?",
        answer: (ctx) => {
          const outs = ctx.agents.SCRIBE.outputs;
          return outs.length
            ? outs
            : nothingYet("compiled section");
        },
      },
      {
        q: "What is the recommendation?",
        answer: (ctx) =>
          ctx.recommendation
            ? [`Recommendation: ${ctx.recommendation}.`]
            : ["No recommendation filed yet."],
      },
      {
        q: "How is the evidence linked?",
        answer: (ctx) =>
          ctx.evidence.length
            ? ctx.evidence.map((e) => `${e.id} · ${e.agent} · ${e.ts}`)
            : nothingYet("evidence link"),
      },
    ],
  },
};

/* ------------------------------------------------------------ supervisor tour */

export interface TourLine {
  text: string;
  focus: AgentId | "CENTER";
  hold: number; // ms
}

export function buildTour(ctx: DialogueContext): TourLine[] {
  return [
    { text: "Analyst, welcome to FRAB.", focus: "CENTER", hold: 2600 },
    {
      text: `Case ${ctx.caseId} is currently under investigation. Sorry about the mess.`,
      focus: "CENTER",
      hold: 3400,
    },
    { text: "I've activated the investigation floor. Start with Watchman.", focus: "WATCHMAN", hold: 3200 },
    {
      text: "Watchman validates the alert against the customer's behavioural baseline.",
      focus: "WATCHMAN",
      hold: 3600,
    },
    { text: "Detective is where the investigation gets interesting.", focus: "DETECTIVE", hold: 3000 },
    {
      text: "Detective queries transaction history, KYC, beneficiaries and network relationships.",
      focus: "DETECTIVE",
      hold: 3800,
    },
    { text: "Jurist handles regulatory context — citations only, no speculation.", focus: "JURIST", hold: 3400 },
    { text: "And Scribe turns everything into an evidence-linked case.", focus: "SCRIBE", hold: 3200 },
    {
      text: "I'm supervising the whole thing. Click any workstation to speak with an agent.",
      focus: "CENTER",
      hold: 3600,
    },
    { text: "Before we continue, identify yourself.", focus: "CENTER", hold: 600 },
  ];
}
