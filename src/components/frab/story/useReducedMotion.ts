import { useEffect, useState } from "react";

/**
 * Hydration-safe prefers-reduced-motion.
 * Always `false` on the server and on the first client render (so the markup matches),
 * then reflects the user's real preference after mount and on change.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}
