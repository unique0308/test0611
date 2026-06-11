"use client";

import { useCountUp } from "./useCountUp";
import { fmtInt } from "./format";

interface Props {
  value: number;
  fmt?: (v: number) => string;
  duration?: number;
}

export function CountUp({ value, fmt = fmtInt, duration = 900 }: Props) {
  const v = useCountUp(value, { duration });
  return <span className="countup num">{fmt(v)}</span>;
}
