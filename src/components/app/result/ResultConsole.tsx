import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { IS_LIVE_BACKEND } from "../../../lib/frab-api";
import { fetchCaseList, type CaseSummary } from "../../../lib/frab-result";
import { Dot, ErrorBlock, LoadingBlock, Mono } from "../ui";
import CaseBook from "./CaseBook";
import CaseLibrary from "./CaseLibrary";

export default function ResultConsole({ caseId }: { caseId?: string }) {
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(() => {
    setState("loading");
    fetchCaseList()
      .then((c) => {
        setCases(c);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  useEffect(load, [load]);

  const open = (id: string) => void navigate({ to: "/case/$caseId", params: { caseId: id } });
  const close = () => void navigate({ to: "/result" });

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-6 md:px-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <Mono className="text-[9px] text-lime">04 / INVESTIGATION RESULTS</Mono>
            <h1 className="mt-2 font-mono text-lg tracking-[0.14em] text-foreground">
              ALL SOLVED CASES
            </h1>
          </div>
          <span className="flex items-center gap-2">
            <Dot state={IS_LIVE_BACKEND ? "ok" : "idle"} />
            <Mono className={`text-[8px] ${IS_LIVE_BACKEND ? "text-lime" : "text-warning"}`}>
              {IS_LIVE_BACKEND ? "INVESTIGATION ENGINE ONLINE" : "DEMO DATA · BACKEND NOT CONNECTED"}
            </Mono>
          </span>
        </div>
      </header>

      <div className="px-6 py-8 md:px-10">
        {state === "loading" ? (
          <LoadingBlock label="LOADING CASE LIBRARY" />
        ) : state === "error" || !cases ? (
          <ErrorBlock label="CASE LIBRARY UNAVAILABLE" onRetry={load} />
        ) : cases.length === 0 ? (
          <Mono className="text-[9px] text-warning">NO COMPLETED INVESTIGATIONS</Mono>
        ) : (
          <>
            <Mono className="mb-4 block text-[8px] text-muted-foreground">
              {cases.length} COMPLETED INVESTIGATIONS
            </Mono>
            <CaseLibrary cases={cases} onOpen={open} />
          </>
        )}
      </div>

      {caseId ? <CaseBook caseId={caseId} onClose={close} /> : null}
    </div>
  );
}
