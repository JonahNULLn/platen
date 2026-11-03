"use client";

import { useState } from "react";

import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export type RevenuePoint = { label: string; value: number };

// Fixed viewBox + `h-auto w-full` scales uniformly, so the 4px rounded bar tops
// never distort (unlike preserveAspectRatio="none").
const W = 640;
const H = 200;
const PAD_T = 16;
const PAD_B = 26;
const PLOT_H = H - PAD_T - PAD_B;
const RADIUS = 4;

/** Bar with only its top corners rounded, anchored flat to the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(RADIUS, w / 2, Math.max(h, 0));
  if (h <= 0) return "";
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

function compactUsd(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
}

export function RevenueChart({ data, subtitle }: { data: RevenuePoint[]; subtitle: string }) {
  const [hover, setHover] = useState<number | null>(null);

  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const total = values.reduce((s, v) => s + v, 0);
  const n = Math.max(data.length, 1);
  const slot = W / n;
  const barW = Math.min(64, slot * 0.5);

  const active = hover === null ? null : data[hover];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Revenue</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums">
            {formatCurrency(active ? active.value : total)}
          </div>
          <p className="text-xs text-muted-foreground">{active ? active.label : "Total"}</p>
        </div>
      </div>

      {total === 0 ? (
        <div className="flex flex-1 items-center justify-center py-10 text-sm text-muted-foreground">
          No payments recorded yet.
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mt-4 h-auto w-full"
          role="img"
          aria-label={`Revenue for the last ${data.length} months`}
        >
          {/* One template string, not "text {n} text": React 19 requires <title>
              children to be a single string, or it hydration-mismatches. */}
          <title>{`Revenue, last ${data.length} months`}</title>

          {/* Recessive gridlines + max label */}
          {[0, 0.5, 1].map((t) => {
            const y = PAD_T + PLOT_H - t * PLOT_H;
            return (
              <line key={t} x1={0} x2={W} y1={y} y2={y} className="stroke-border" strokeWidth={1} />
            );
          })}
          <text x={4} y={PAD_T - 4} className="fill-muted-foreground text-[11px]">
            {compactUsd(max)}
          </text>

          {data.map((d, i) => {
            const h = (d.value / max) * PLOT_H;
            const x = slot * i + (slot - barW) / 2;
            const y = PAD_T + PLOT_H - h;
            const isActive = hover === i;
            return (
              <g key={d.label}>
                {/* Hit target is the full slot — bigger than the mark. */}
                <rect
                  x={slot * i}
                  y={0}
                  width={slot}
                  height={H}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
                <path
                  d={barPath(x, y, barW, h)}
                  className={cn(
                    "fill-primary transition-opacity",
                    hover !== null && !isActive && "opacity-30",
                  )}
                  pointerEvents="none"
                />
                <text
                  x={slot * i + slot / 2}
                  y={H - 8}
                  textAnchor="middle"
                  className={cn(
                    "text-[11px]",
                    isActive ? "fill-foreground" : "fill-muted-foreground",
                  )}
                  pointerEvents="none"
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
