"use client";

type ChartPoint = {
  label: string;
  y: number;
};

type ChartSeries = {
  name: string;
  color: string;
  points: ChartPoint[];
};

type ChartSize = "compact" | "regular" | "expanded";

function pathFor(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

export function LineChart({
  title,
  yAxisLabel,
  xAxisLabel,
  series,
  size = "regular",
  onExpand
}: {
  title: string;
  yAxisLabel: string;
  xAxisLabel: string;
  series: ChartSeries[];
  size?: ChartSize;
  onExpand?: () => void;
}) {
  const width = 860;
  const height = size === "expanded" ? 460 : size === "compact" ? 180 : 300;
  const left = 58;
  const right = 18;
  const top = size === "expanded" ? 24 : 22;
  const bottom = 56;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const axisFontSize = size === "expanded" ? 13 : size === "compact" ? 12 : 12;
  const titleClass =
    size === "expanded" ? "text-base font-semibold text-slate-900" : "text-sm font-semibold text-slate-900";
  const containerHeight =
    size === "expanded" ? "h-[620px]" : size === "compact" ? "h-[240px]" : "h-[400px]";
  const svgHeightClass =
    size === "expanded" ? "h-[500px]" : size === "compact" ? "h-[150px]" : "h-[300px]";

  const pointCount = Math.max(...series.map((s) => s.points.length), 0);
  const allValues = series.flatMap((s) => s.points.map((p) => p.y));
  const maxY = Math.max(1, ...allValues);
  const yTicks = 4;

  const xForIndex = (index: number) =>
    pointCount <= 1 ? left : left + (index / (pointCount - 1)) * plotWidth;
  const yForValue = (value: number) => top + (1 - value / maxY) * plotHeight;

  if (pointCount === 0) {
    return (
      <div className={`flex ${containerHeight} flex-col rounded-md border border-slate-200 p-4`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className={titleClass}>{title}</p>
          {onExpand ? (
            <button
              type="button"
              onClick={onExpand}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600"
            >
              Expand
            </button>
          ) : null}
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className={size === "expanded" ? "text-base text-slate-500" : "text-sm text-slate-500"}>
            No data available for this range.
          </p>
        </div>
      </div>
    );
  }

  const xLabels = series[0]?.points.map((point) => point.label) ?? [];
  const labelStep = Math.max(1, Math.ceil(pointCount / 6));

  return (
    <div className={`flex ${containerHeight} flex-col rounded-md border border-slate-200 p-4`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className={titleClass}>{title}</p>
        {onExpand ? (
          <button
            type="button"
            onClick={onExpand}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600"
          >
            Expand
          </button>
        ) : null}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className={`${svgHeightClass} w-full flex-1`}>
        <line x1={left} y1={top} x2={left} y2={top + plotHeight} stroke="#CBD5E1" strokeWidth="1" />
        <line
          x1={left}
          y1={top + plotHeight}
          x2={left + plotWidth}
          y2={top + plotHeight}
          stroke="#CBD5E1"
          strokeWidth="1"
        />

        {Array.from({ length: yTicks + 1 }).map((_, idx) => {
          const value = (maxY / yTicks) * idx;
          const y = yForValue(value);
          return (
            <g key={`y-${idx}`}>
              <line x1={left} y1={y} x2={left + plotWidth} y2={y} stroke="#F1F5F9" strokeWidth="1" />
              <text x={left - 8} y={y + 4} textAnchor="end" fontSize={axisFontSize} fill="#64748B">
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        {series.map((line) => {
          const points = line.points.map((point, idx) => ({
            x: xForIndex(idx),
            y: yForValue(point.y)
          }));
          return (
            <g key={line.name}>
              <path d={pathFor(points)} fill="none" stroke={line.color} strokeWidth="2.5" />
              {points.map((point, idx) => (
                <circle key={`${line.name}-${idx}`} cx={point.x} cy={point.y} r="2.5" fill={line.color} />
              ))}
            </g>
          );
        })}

        {xLabels.map((label, idx) => {
          if (idx % labelStep !== 0 && idx !== xLabels.length - 1) return null;
          const x = xForIndex(idx);
          return (
            <text
              key={`x-${idx}`}
              x={x}
              y={top + plotHeight + 18}
              textAnchor="middle"
              fontSize={axisFontSize}
              fill="#64748B"
            >
              {label}
            </text>
          );
        })}

        <text x={16} y={top - 6} fontSize={axisFontSize} fill="#64748B">
          {yAxisLabel}
        </text>
        <text x={left + plotWidth} y={height - 8} textAnchor="end" fontSize={axisFontSize} fill="#64748B">
          {xAxisLabel}
        </text>
      </svg>
      <div className={`mt-2 flex flex-wrap gap-3 ${size === "expanded" ? "text-sm" : "text-xs"} text-slate-600`}>
        {series.map((line) => (
          <div key={line.name} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: line.color }} />
            {line.name}
          </div>
        ))}
      </div>
    </div>
  );
}
