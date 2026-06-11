"use client";

import { useEffect, useState } from "react";

interface Options {
  duration?: number;
  start?: number;
}

/** 数值缓动动画 hook（ease-out-cubic，默认 900ms） */
export function useCountUp(target: number, { duration = 900, start = 0 }: Options = {}): number {
  const [value, setValue] = useState(start);
  useEffect(() => {
    let raf: number;
    let t0: number | null = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (t: number) => {
      if (t0 === null) t0 = t;
      const k = Math.min(1, (t - t0) / duration);
      setValue(start + (target - start) * ease(k));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);
  return value;
}
