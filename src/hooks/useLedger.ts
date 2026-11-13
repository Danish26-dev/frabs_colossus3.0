import { useCallback, useEffect, useRef, useState } from "react";
import { IS_LIVE_BACKEND } from "../lib/frab-api";
import { fetchFullLedger, fetchLedgerRange, fetchLedgerTotal } from "../lib/frab-ledger";
import type { RawTxn } from "../lib/frab-backend";

/**
 * Loads the entire bank ledger once (kept in memory for the session so navigating away and
 * back is instant), then FOLLOWS the backend: every POLL_MS it re-checks the ledger total and
 * appends only the new rows. `added` counts rows that arrived after the first full load.
 */

export type LedgerStatus = "off" | "loading" | "ready" | "error";

const POLL_MS = 15_000;
let cache: RawTxn[] | null = null; // survives route changes within the session

export function useLedger() {
  const [rows, setRows] = useState<RawTxn[]>(cache ?? []);
  const [status, setStatus] = useState<LedgerStatus>(IS_LIVE_BACKEND ? (cache ? "ready" : "loading") : "off");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [added, setAdded] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const rowsRef = useRef<RawTxn[]>(cache ?? []);

  const reload = useCallback(() => {
    cache = null;
    rowsRef.current = [];
    setRows([]);
    setAdded(0);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!IS_LIVE_BACKEND) return;
    let cancelled = false;

    (async () => {
      if (cache) return;
      setStatus("loading");
      setError(null);
      try {
        const all = await fetchFullLedger((done, total) => {
          if (!cancelled) setProgress({ done, total });
        });
        if (cancelled) return;
        cache = all;
        rowsRef.current = all;
        setRows(all);
        setStatus("ready");
        setLastChecked(new Date());
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setError(e instanceof Error ? e.message : "ledger load failed");
        }
      }
    })();

    const id = setInterval(async () => {
      if (!rowsRef.current.length) return;
      try {
        const total = await fetchLedgerTotal();
        if (cancelled) return;
        setLastChecked(new Date());
        const have = rowsRef.current.length;
        if (total > have) {
          const extra = await fetchLedgerRange(have, total - have);
          if (cancelled || !extra.length) return;
          const next = rowsRef.current.concat(extra);
          rowsRef.current = next;
          cache = next;
          setRows(next);
          setAdded((a) => a + extra.length);
        }
      } catch {
        /* a failed poll keeps the data already on screen */
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [nonce]);

  return { rows, status, progress, lastChecked, added, error, reload, pollSeconds: POLL_MS / 1000 };
}
