import { useEffect, useRef, useState } from "react";
import {
  fetchTransactionPage,
  nextSimulatedTxn,
  FEED_MODE,
  type TxnRecord,
} from "../lib/frab-alerts";

export type FeedStatus = "loading" | "ready" | "error";

interface Options {
  /** Max rows kept in view. */
  window?: number;
  /** Milliseconds between revealed transactions. */
  intervalMs?: number;
  /** Rows fetched per backend page. */
  pageSize?: number;
}

/**
 * Streams the real transaction ledger into the UI as a live feed.
 *
 * Live mode: pages through the real backend ledger and reveals one real
 * transaction at a time on a timer, fetching the next page as the buffer drains
 * so the stream keeps advancing through actual data. Loops back to the newest
 * page when the ledger is exhausted so the demo feed never stops.
 *
 * Demo mode: keeps the synthetic generator ticking (unchanged behaviour).
 */
export function useLiveTransactionFeed({
  window = 14,
  intervalMs = 2400,
  pageSize = 25,
}: Options = {}) {
  const [rows, setRows] = useState<TxnRecord[]>([]);
  const [status, setStatus] = useState<FeedStatus>("loading");

  // Buffer of not-yet-revealed real transactions + paging cursor.
  const buffer = useRef<TxnRecord[]>([]);
  const offset = useRef(0);
  const total = useRef(Infinity);
  const fetching = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    // ---- Demo mode: synthetic generator, unchanged. ----
    if (FEED_MODE !== "live") {
      setRows(Array.from({ length: 9 }, nextSimulatedTxn));
      setStatus("ready");
      timer.current = setInterval(() => {
        setRows((prev) => [nextSimulatedTxn(), ...prev].slice(0, window));
      }, intervalMs);
      return () => {
        if (timer.current) clearInterval(timer.current);
      };
    }

    // ---- Live mode: stream the real ledger. ----
    const refill = async () => {
      if (fetching.current) return;
      if (offset.current >= total.current) offset.current = 0; // loop the ledger
      fetching.current = true;
      try {
        const page = await fetchTransactionPage(offset.current, pageSize);
        if (cancelled) return;
        offset.current = page.offset;
        total.current = page.total;
        buffer.current.push(...page.rows);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus((s) => (s === "loading" ? "error" : s));
      } finally {
        fetching.current = false;
      }
    };

    const reveal = () => {
      if (buffer.current.length === 0) {
        void refill();
        return;
      }
      const next = buffer.current.shift()!;
      setRows((prev) => [next, ...prev].slice(0, window));
      // Prefetch the next page before the buffer fully drains.
      if (buffer.current.length < 5) void refill();
    };

    void (async () => {
      await refill();
      if (cancelled) return;
      // Seed a few rows immediately so the panel isn't empty on first paint.
      const seed = buffer.current.splice(0, Math.min(6, buffer.current.length));
      setRows(seed);
      timer.current = setInterval(reveal, intervalMs);
    })();

    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { rows, status };
}
