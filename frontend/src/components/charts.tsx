import { useEffect, useId, useRef, useState } from 'react';
import { arc, area, curveMonotoneX, line, max, pie, scaleLinear, scaleTime } from 'd3';
import { motion } from 'motion/react';
import type { Allocation, CashFlowEvent, Snapshot } from '../models';
import { addDays, money, parseDate, projection, shortDate, today } from '../lib/finance';
// D3 computes geometry; React owns the SVG tree and Motion animates its paths.
export function ProjectionChart({ snapshot, days }: { snapshot: Snapshot; days: number }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  // Match the viewBox width to its panel rather than stretching chart labels at wide resolutions.
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(300, entry.contentRect.width)),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  // SVG definitions need per-instance IDs when the same chart appears in multiple views.
  const id = useId().replace(/:/g, ''),
    data = projection(snapshot, days),
    [hover, setHover] = useState<number | null>(null);
  const w = width,
    h = 225,
    p = { left: 52, right: 22, top: 20, bottom: 30 };
  const x = scaleLinear()
    .domain([0, days])
    .range([p.left, w - p.right]);
  // Include shortfalls and reserve headroom; reverse the range because SVG y grows downward.
  const y = scaleLinear()
    .domain([
      Math.min(0, ...data.map((d) => d.balance)),
      Math.max(snapshot.settings.reserve * 2, max(data, (d) => d.balance) ?? 0) * 1.16,
    ])
    .nice()
    .range([h - p.bottom, p.top]);
  // Monotone interpolation smooths the line without adding peaks between daily balances.
  const path = line<(typeof data)[number]>()
    .x((_, i) => x(i))
    .y((d) => y(d.balance))
    .curve(curveMonotoneX);
  const fill = area<(typeof data)[number]>()
    .x((_, i) => x(i))
    .y0(h - p.bottom)
    .y1((d) => y(d.balance))
    .curve(curveMonotoneX);
  const selected = hover === null ? null : data[hover];
  return (
    <div className="projection-chart" ref={container}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ height: 220 }}
        role="img"
        aria-label={`${days}-day projected cash balance. Starts at ${money(data[0].balance)}, ends at ${money(data.at(-1)!.balance)}. Minimum reserve ${money(snapshot.settings.reserve)}.`}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          // Convert screen pixels to viewBox coordinates, then invert the scale to the nearest day.
          const rect = e.currentTarget.getBoundingClientRect();
          setHover(
            Math.max(
              0,
              Math.min(days, Math.round(x.invert(((e.clientX - rect.left) / rect.width) * w))),
            ),
          );
        }}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#72bca9" stopOpacity=".17" />
            <stop offset="100%" stopColor="#72bca9" stopOpacity="0" />
          </linearGradient>
        </defs>
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={p.left} x2={w - p.right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={p.left - 12} y={y(t) + 4} textAnchor="end" className="chart-label">
              {Math.abs(t) >= 1000 ? `${t / 1000}k` : t}
            </text>
          </g>
        ))}
        {[0, Math.round(days * 0.25), Math.round(days * 0.5), Math.round(days * 0.75), days].map(
          (d) => (
            <g key={d}>
              <line
                x1={x(d)}
                x2={x(d)}
                y1={p.top}
                y2={h - p.bottom}
                className="chart-grid vertical"
              />
              <text
                x={x(d)}
                y={h - 7}
                textAnchor={d === 0 ? 'start' : d === days ? 'end' : 'middle'}
                className="chart-label"
              >
                {d === 0 ? 'TODAY' : shortDate(addDays(today(), d)).toUpperCase()}
              </text>
            </g>
          ),
        )}
        <path d={fill(data) ?? ''} fill={`url(#${id})`} />
        <line
          x1={p.left}
          x2={w - p.right}
          y1={y(snapshot.settings.reserve)}
          y2={y(snapshot.settings.reserve)}
          stroke="#9e8655"
          strokeDasharray="4 5"
          opacity=".7"
        />
        <text
          x={w - p.right}
          y={y(snapshot.settings.reserve) - 7}
          textAnchor="end"
          className="chart-label reserve-label"
        >
          RESERVE {money(snapshot.settings.reserve)}
        </text>
        {/* Changing the horizon remounts the path so its draw animation starts again. */}
        <motion.path
          key={days}
          d={path(data) ?? ''}
          fill="none"
          stroke="#85cbb7"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.65 }}
        />
        {data.map((d, i) =>
          d.events.some((e) => e.kind === 'income') ? (
            <g key={d.date}>
              <line
                x1={x(i)}
                x2={x(i)}
                y1={y(d.balance)}
                y2={h - p.bottom}
                stroke="#527f76"
                strokeDasharray="2 5"
              />
              <circle
                cx={x(i)}
                cy={y(d.balance)}
                r="4"
                fill="#0b1318"
                stroke="#9fd6c6"
                strokeWidth="2"
              />
              <text
                x={x(i)}
                y={y(d.balance) - 12}
                textAnchor="middle"
                className="chart-label income-label"
              >
                + PAYCHECK
              </text>
            </g>
          ) : null,
        )}
        <circle cx={x(0)} cy={y(data[0].balance)} r="4" fill="#b0e5d5" />
        {selected && hover !== null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={p.top}
              y2={h - p.bottom}
              stroke="#8fb0bc"
              opacity=".6"
            />
            <circle cx={x(hover)} cy={y(selected.balance)} r="5" fill="#b5eadb" />
            {/* Clamp the tooltip box and text together so they stay inside the chart edges. */}
            <rect
              x={Math.min(w - 174, Math.max(52, x(hover) - 70))}
              y="0"
              width="152"
              height="25"
              fill="#1b2a30"
              stroke="#395159"
            />
            <text
              x={Math.min(w - 98, Math.max(128, x(hover) + 6))}
              y="17"
              textAnchor="middle"
              fill="#d0e6df"
              fontSize="11"
            >
              {shortDate(selected.date)} · {money(selected.balance)}
            </text>
          </g>
        )}
      </svg>
      <div className="chart-foot">
        <span>
          <i className="legend-line" /> Projected liquid balance
        </span>
        <span>
          <i className="legend-dot" /> Scheduled income
        </span>
        <span className="chart-end">
          END BALANCE <b>{money(data.at(-1)!.balance)}</b>
        </span>
      </div>
    </div>
  );
}
export function AllocationRadial({
  allocations,
  safe,
}: {
  allocations: Allocation[];
  safe: number;
}) {
  const total = allocations.reduce((s, a) => s + a.amount, 0),
    remaining = Math.max(0, safe - total);
  // Keep destination order stable; a dummy remainder draws an empty ring when all amounts are zero.
  const segments = pie<{ amount: number; color: string }>()
    .value((d) => d.amount)
    .sort(null)
    .padAngle(0.035)([...allocations, { amount: remaining || (!total ? 1 : 0), color: '#1d3037' }]);
  const shape = arc<(typeof segments)[number]>().innerRadius(70).outerRadius(80);
  return (
    <svg
      className="allocation-radial"
      viewBox="0 0 220 220"
      role="img"
      aria-label={`${money(total)} planned, ${money(remaining)} unallocated`}
    >
      <g transform="translate(110,110)">
        <circle r="91" fill="none" stroke="#25343b" strokeDasharray="1 7" />
        {Array.from({ length: 48 }, (_, i) => (
          <line
            key={i}
            x1="0"
            y1="-96"
            x2="0"
            y2={i % 4 === 0 ? '-102' : '-99'}
            stroke="#3a5058"
            transform={`rotate(${i * 7.5})`}
          />
        ))}
        {segments.map((s, i) => (
          <motion.path
            key={i}
            d={shape(s) ?? ''}
            fill={s.data.color}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />
        ))}
        <text y="-15" textAnchor="middle" className="radial-label">
          UNALLOCATED
        </text>
        <text y="14" textAnchor="middle" className="radial-value">
          {money(remaining)}
        </text>
        <text y="36" textAnchor="middle" className="radial-label">
          {safe > 0 ? Math.round((remaining / safe) * 100) : 0}% AVAILABLE
        </text>
        <path d="M-8 51h16" stroke="#659f92" />
      </g>
    </svg>
  );
}
export function SpendingChart({ spent, plan }: { spent: number[]; plan: number }) {
  // Fit both actual spending and the plan line in the same scale, with space above the highest value.
  const x = scaleLinear()
      .domain([0, spent.length - 1])
      .range([0, 300]),
    y = scaleLinear()
      .domain([0, Math.max(plan, ...spent) * 1.3])
      .range([67, 7]);
  const path = line<number>()
    .x((_, i) => x(i))
    .y((d) => y(d))
    .curve(curveMonotoneX);
  return (
    <svg
      className="spending-chart"
      preserveAspectRatio="none"
      viewBox="0 0 300 76"
      role="img"
      aria-label={`Daily spending: ${spent.map((v) => money(v)).join(', ')}. Daily plan ${money(plan)}.`}
    >
      <line x1="0" x2="300" y1={y(plan)} y2={y(plan)} stroke="#6d777c" strokeDasharray="3 4" />
      <path
        d={
          area<number>()
            .x((_, i) => x(i))
            .y0(75)
            .y1((d) => y(d))
            .curve(curveMonotoneX)(spent) ?? ''
        }
        fill="#71b6a5"
        opacity=".055"
      />
      <motion.path
        d={path(spent) ?? ''}
        fill="none"
        stroke="#76b4a7"
        strokeWidth="1.5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
      />
      <circle cx="300" cy={y(spent.at(-1)!)} r="3" fill="#a3d6c9" />
    </svg>
  );
}
export function CashFlowTimeline({ events, end }: { events: CashFlowEvent[]; end: string }) {
  // Time-based spacing shows gaps between events rather than giving each event an equal slot.
  const visible = events.filter((e) => e.date <= end),
    x = scaleTime()
      .domain([parseDate(today()), parseDate(end)])
      .range([24, 876]);
  return (
    <svg
      className="cash-timeline"
      preserveAspectRatio="none"
      viewBox="0 0 900 64"
      role="img"
      aria-label={`Upcoming cash-flow events: ${visible.map((e) => `${e.name}, ${shortDate(e.date)}, ${e.kind === 'income' ? '+' : '−'}${money(e.amount)}`).join('; ')}`}
    >
      <line x1="24" x2="876" y1="24" y2="24" stroke="#2b3d44" />
      {Array.from({ length: 31 }, (_, i) => (
        <line key={i} x1={24 + i * 28.4} x2={24 + i * 28.4} y1="21" y2="27" stroke="#3b5058" />
      ))}
      {visible.map((e, i) => (
        <g key={e.id} transform={`translate(${x(parseDate(e.date))},24)`}>
          <line
            y1="0"
            y2={i % 2 === 0 ? -13 : 13}
            stroke={e.kind === 'income' ? '#88cdb5' : '#627c8c'}
          />
          <rect
            x="-3"
            y="-3"
            width="6"
            height="6"
            transform="rotate(45)"
            fill={e.kind === 'income' ? '#88cdb5' : '#6c8999'}
          />
        </g>
      ))}
      <text x="24" y="54" className="chart-label">
        TODAY
      </text>
      <text x="876" y="54" textAnchor="end" className="chart-label income-label">
        {shortDate(end).toUpperCase()} · PAYDAY
      </text>
    </svg>
  );
}
