"use client";
import { Table2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Money } from "@/components/finance/money";
import { Button } from "@/components/ui/button";
import { formatCompactMoney } from "@/lib/finance/money";
import { cn } from "@/lib/utils/cn";

/**
 * Column chart (grouped, stacked or signed single series) in plain SVG.
 * Mark specs follow the dataviz reference: bars <= 24px, 4px rounded data
 * end (square at the baseline), 2px surface gaps, hairline solid grid, a
 * legend for >= 2 series, a per-column hover/focus tooltip listing every
 * series, and a table view so no value is gated behind hover.
 *
 * Amounts arrive as decimal strings; numbers are used for pixel geometry
 * only — every figure shown is formatted from the original string.
 */

export type ChartSeries = { key: string; label: string; color: string; values: string[] };
export type ChartCategory = { key: string; label: string; fullLabel?: string };

const MARGIN = { top: 12, right: 8, bottom: 28, left: 52 };
const GAP = 2;
const MAX_BAR = 24;
const RADIUS = 4;

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [0, max || 1];
  const span = max - min;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => span / s <= count) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/** Bar with a rounded data end; `up` = the rounded end is at the top. */
function barPath(x: number, y: number, w: number, h: number, rounded: boolean, up: boolean) {
  if (h <= 0) return "";
  const r = rounded ? Math.min(RADIUS, w / 2, h) : 0;
  if (up) {
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

export function ColumnChart({
  title,
  description,
  categories,
  series,
  mode = "grouped",
  currency,
  height = 220,
  signedColors,
}: {
  title: string;
  description?: string;
  categories: ChartCategory[];
  series: ChartSeries[];
  mode?: "grouped" | "stacked";
  currency: string;
  height?: number;
  /** Single signed series: colour by sign (diverging pair) instead of one hue. */
  signedColors?: { positive: string; negative: string };
}) {
  const { ref, width } = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const nums = useMemo(() => series.map((s) => s.values.map((v) => Number(v))), [series]);
  const { min, max } = useMemo(() => {
    let lo = 0;
    let hi = 0;
    categories.forEach((_, ci) => {
      if (mode === "stacked") {
        const pos = nums.reduce((sum, s) => sum + Math.max(0, s[ci] ?? 0), 0);
        const neg = nums.reduce((sum, s) => sum + Math.min(0, s[ci] ?? 0), 0);
        hi = Math.max(hi, pos);
        lo = Math.min(lo, neg);
      } else {
        for (const s of nums) {
          hi = Math.max(hi, s[ci] ?? 0);
          lo = Math.min(lo, s[ci] ?? 0);
        }
      }
    });
    return { min: lo, max: hi };
  }, [categories, nums, mode]);

  const ticks = niceTicks(min, max);
  const domainMin = Math.min(...ticks);
  const domainMax = Math.max(...ticks);
  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const y = (v: number) => MARGIN.top + ((domainMax - v) / (domainMax - domainMin || 1)) * plotH;
  const band = categories.length ? plotW / categories.length : 0;
  const perGroup = mode === "grouped" ? series.length : 1;
  const barW = Math.max(2, Math.min(MAX_BAR, (band * 0.72 - GAP * (perGroup - 1)) / perGroup));
  const labelEvery = band > 0 ? Math.max(1, Math.ceil(44 / band)) : 1;
  const hasData = nums.some((s) => s.some((v) => v !== 0));

  const bars: { d: string; color: string; key: string }[] = [];
  categories.forEach((cat, ci) => {
    const center = MARGIN.left + band * ci + band / 2;
    if (mode === "stacked") {
      let posTop = 0;
      let negBottom = 0;
      const topIndex = nums.map((s) => s[ci] ?? 0).findLastIndex((v) => v > 0);
      nums.forEach((s, si) => {
        const v = s[ci] ?? 0;
        if (v === 0) return;
        const x = center - barW / 2;
        if (v > 0) {
          const y0 = y(posTop);
          const y1 = y(posTop + v);
          // 2px surface gap above every segment that has another segment on top.
          const gap = si === topIndex ? 0 : GAP;
          bars.push({ key: `${cat.key}-${si}`, color: series[si]!.color, d: barPath(x, y1 + gap, barW, y0 - y1 - gap, si === topIndex, true) });
          posTop += v;
        } else {
          const y0 = y(negBottom);
          const y1 = y(negBottom + v);
          bars.push({ key: `${cat.key}-${si}`, color: series[si]!.color, d: barPath(x, y0, barW, y1 - y0, true, false) });
          negBottom += v;
        }
      });
    } else {
      const groupW = barW * perGroup + GAP * (perGroup - 1);
      nums.forEach((s, si) => {
        const v = s[ci] ?? 0;
        if (v === 0) return;
        const x = center - groupW / 2 + si * (barW + GAP);
        const color = signedColors ? (v >= 0 ? signedColors.positive : signedColors.negative) : series[si]!.color;
        const top = y(Math.max(v, 0));
        const bottom = y(Math.min(v, 0));
        bars.push({ key: `${cat.key}-${si}`, color, d: barPath(x, top, barW, bottom - top, true, v >= 0) });
      });
    }
  });

  const activeCat = active !== null ? categories[active] : null;
  // Tooltip sits beside the hovered column (never on top of the marks it describes).
  const TOOLTIP_W = 264;
  const bandLeft = active !== null ? MARGIN.left + band * active : 0;
  const tooltipLeft =
    bandLeft + band + 8 + TOOLTIP_W <= width ? bandLeft + band + 8 : Math.max(0, bandLeft - 8 - TOOLTIP_W);

  return (
    <figure className="grid gap-3">
      <figcaption className="flex flex-wrap items-start justify-between gap-2">
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">{title}</span>
          {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setShowTable((x) => !x)} aria-pressed={showTable}>
          <Table2 /> {showTable ? "График" : "Таблица"}
        </Button>
      </figcaption>

      {series.length > 1 && !signedColors ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Обозначения">
          {series.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}

      {showTable ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Период</th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="px-3 py-2 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {categories.map((c, ci) => (
                <tr key={c.key}>
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    {c.fullLabel ?? c.label}
                  </th>
                  {series.map((s) => (
                    <td key={s.key} className="px-3 py-2 text-right">
                      <Money amount={s.values[ci] ?? "0"} currency={currency} hideCurrency />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative" style={{ height }} onPointerLeave={() => setActive(null)}>
          {width > 0 ? (
            <svg width={width} height={height} role="img" aria-label={`${title}. Переходите по периодам клавишей Tab или откройте таблицу.`} className="block overflow-visible">
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} shapeRendering="crispEdges" />
                  <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular">
                    {formatCompactMoney(String(t))}
                  </text>
                </g>
              ))}
              {active !== null ? <rect x={MARGIN.left + band * active} y={MARGIN.top} width={band} height={plotH} className="fill-muted/70" /> : null}
              {bars.map((b) => (
                <path key={b.key} d={b.d} fill={b.color} />
              ))}
              {categories.map((c, ci) =>
                ci % labelEvery === 0 ? (
                  <text key={c.key} x={MARGIN.left + band * ci + band / 2} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                    {c.label}
                  </text>
                ) : null,
              )}
              {categories.map((c, ci) => (
                <rect
                  key={`hit-${c.key}`}
                  x={MARGIN.left + band * ci}
                  y={MARGIN.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${c.fullLabel ?? c.label}: ${series.map((s) => `${s.label} ${s.values[ci]}`).join(", ")}`}
                  className="outline-none focus-visible:stroke-ring"
                  strokeWidth={2}
                  onPointerEnter={() => setActive(ci)}
                  onFocus={() => setActive(ci)}
                  onBlur={() => setActive(null)}
                />
              ))}
            </svg>
          ) : null}
          {!hasData && width > 0 ? (
            <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">За этот период данных нет</p>
          ) : null}
          {activeCat && active !== null ? (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 grid gap-1 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg"
              style={{ left: tooltipLeft, width: TOOLTIP_W }}
            >
              <span className="text-muted-foreground">{activeCat.fullLabel ?? activeCat.label}</span>
              {series.map((s) => {
                const value = s.values[active] ?? "0";
                const color = signedColors ? (Number(value) >= 0 ? signedColors.positive : signedColors.negative) : s.color;
                return (
                  <span key={s.key} className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
                      <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: color }} />
                      {s.label}
                    </span>
                    <Money amount={value} currency={currency} className={cn("font-semibold text-foreground")} />
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </figure>
  );
}
