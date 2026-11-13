import { useQuery } from "@tanstack/react-query";
import { fetchWorkerHealth, IS_WORKER_LIVE } from "../lib/frab-worker";
import { inferenceBadge, normalizeLlmMode, type LlmMode } from "../lib/frab-inference";

/**
 * Polls the worker's open /health endpoint so status badges reflect reality instead of
 * static text. No token is needed or sent.
 */
export function useWorkerHealth() {
  const q = useQuery({
    queryKey: ["worker-health"],
    queryFn: async ({ signal }) => normalizeLlmMode((await fetchWorkerHealth(signal)).llm_mode),
    enabled: IS_WORKER_LIVE,
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 0,
  });
  const mode: LlmMode = !IS_WORKER_LIVE ? "unset" : q.isError ? "down" : (q.data ?? "checking");
  return { mode, badge: inferenceBadge(mode) };
}
