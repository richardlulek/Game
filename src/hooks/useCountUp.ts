import { useEffect, useRef, useState } from "react";

/** Tweenar mjukt från nuvarande visat värde till målvärdet (ease-out cubic). */
export function useCountUp(target: number, durationMs = 550): number {
  const [val, setVal] = useState(target);
  const displayRef = useRef(target);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const from = displayRef.current;
    if (Math.abs(from - target) < 0.5) {
      displayRef.current = target;
      setVal(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = from + (target - from) * eased;
      displayRef.current = cur;
      setVal(cur);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else displayRef.current = target;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return val;
}
