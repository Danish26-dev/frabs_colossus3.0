import { useEffect, useMemo, useRef, useState } from "react";
import { AGENT_PERSONA, type DialogueContext } from "../../../lib/frab-agent-dialogue";
import type { AgentId } from "../../../lib/frab-investigation";
import { Mono } from "../ui";

interface Turn {
  who: "AGENT" | "ANALYST";
  lines: string[];
}

export default function Dialogue({
  agent,
  ctx,
  analyst,
  onClose,
}: {
  agent: AgentId;
  ctx: DialogueContext;
  analyst: string;
  onClose: () => void;
}) {
  const persona = AGENT_PERSONA[agent];
  const [turns, setTurns] = useState<Turn[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  // greeting is recomputed whenever the analyst walks up to a different agent
  useEffect(() => {
    setTurns([{ who: "AGENT", lines: persona.greeting(ctx) }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length]);

  const asked = useMemo(
    () => new Set(turns.filter((t) => t.who === "ANALYST").map((t) => t.lines[0])),
    [turns],
  );

  return (
    <div className="pointer-events-auto flex max-h-[52vh] w-[min(400px,calc(100vw-2rem))] flex-col border border-lime/40 bg-background/95 backdrop-blur-sm">
      <header className="flex items-start justify-between gap-3 border-b border-border px-3.5 py-2.5">
        <div>
          <Mono className="text-[11px] text-lime">{agent}</Mono>
          <Mono className="mt-1 block text-[8px] text-muted-foreground">
            {persona.role} · {persona.tone}
          </Mono>
        </div>
        <button
          onClick={onClose}
          className="font-mono text-[8px] tracking-[0.22em] text-muted-foreground transition-colors hover:text-lime"
        >
          [ LEAVE ]
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-3">
        <ul className="space-y-3">
          {turns.map((t, i) => (
            <li key={i} className={t.who === "AGENT" ? "border-l-2 border-lime/50 pl-2.5" : "pl-2.5"}>
              <Mono className={`text-[8px] ${t.who === "AGENT" ? "text-lime" : "text-muted-foreground"}`}>
                {t.who === "AGENT" ? agent : analyst}
              </Mono>
              {t.lines.map((l, j) => (
                <p
                  key={j}
                  className={`mt-1 text-xs leading-relaxed ${
                    t.who === "AGENT" ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {l}
                </p>
              ))}
            </li>
          ))}
        </ul>
        <div ref={endRef} />
      </div>

      <footer className="border-t border-border px-3.5 py-2.5">
        <Mono className="text-[8px] text-muted-foreground">ASK</Mono>
        <div className="mt-2 flex flex-col gap-1.5">
          {persona.questions.map((q) => (
            <button
              key={q.q}
              onClick={() =>
                setTurns((prev) => [
                  ...prev,
                  { who: "ANALYST", lines: [q.q] },
                  { who: "AGENT", lines: q.answer(ctx) },
                ])
              }
              className={`border px-2.5 py-1.5 text-left font-mono text-[9px] tracking-[0.16em] transition-colors ${
                asked.has(q.q)
                  ? "border-border text-muted-foreground hover:text-foreground"
                  : "border-lime/40 text-lime hover:bg-lime-soft"
              }`}
            >
              {q.q}
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
