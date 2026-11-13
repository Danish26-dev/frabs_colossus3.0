/**
 * Active-case state shared across the FRAB console.
 *
 * Holds the case id created by POST /investigations so the navigation,
 * workspace and result pages all operate on the same investigation.
 */

import { useEffect, useState } from "react";

export interface ActiveCase {
  caseId: string;
  alertId: string;
  startedAt: string;
  complete: boolean;
}

const KEY = "frab.active-case";
let current: ActiveCase | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

// The active case is in-memory only. The confidential workspace is open only
// while you are actively working a case, so a full page load / new session
// starts with NO active case (the workspace stays locked until you launch an
// investigation from Alert Intelligence). Any stale entries persisted by
// earlier builds are purged so they can never re-open a case on load.
function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    window.localStorage.removeItem(KEY);
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — nothing to purge */
  }
  current = null;
}

function emit() {
  for (const l of listeners) l();
}

function persist() {
  // In-memory only by design — nothing is written to storage, so a reload or
  // new tab always starts locked with no active case.
}

export function setActiveCase(next: ActiveCase) {
  hydrate();
  current = next;
  persist();
  emit();
}

export function markActiveCaseComplete(caseId: string) {
  hydrate();
  if (!current || current.caseId !== caseId || current.complete) return;
  current = { ...current, complete: true };
  persist();
  emit();
}

export function clearActiveCase() {
  hydrate();
  current = null;
  persist();
  emit();
}

export function getActiveCase(): ActiveCase | null {
  hydrate();
  return current;
}

/** Subscribe to the active case. Returns null during SSR / first paint. */
export function useActiveCase(): ActiveCase | null {
  const [state, setState] = useState<ActiveCase | null>(null);
  useEffect(() => {
    hydrate();
    setState(current);
    const l = () => setState(current);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return state;
}
