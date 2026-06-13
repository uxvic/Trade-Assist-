export function fmtUSD(value: number | string, opts: Intl.NumberFormatOptions = {}): string {
  const n = Number(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 1000 ? 0 : 2,
    ...opts,
  }).format(n);
}

export function fmtNumber(value: number | string, maxFrac = 6): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFrac }).format(Number(value));
}

export function fmtPct(value: number | string, frac = 2): string {
  const n = Number(value);
  return `${n >= 0 ? "+" : ""}${n.toFixed(frac)}%`;
}

export function fmtSignedUSD(value: number | string): string {
  const n = Number(value);
  return `${n >= 0 ? "+" : "-"}${fmtUSD(Math.abs(n))}`;
}

/** Plain-language take on a P&L number for beginners. */
export function pnlTone(value: number | string): "positive" | "negative" | "flat" {
  const n = Number(value);
  if (Math.abs(n) < 0.005) return "flat";
  return n > 0 ? "positive" : "negative";
}
