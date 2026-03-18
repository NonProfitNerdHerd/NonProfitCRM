"use client";

type PieSlice = {
  label: string;
  amount: number;
  percentage: number;
  color: string;
};

type PieChartSize = "compact" | "expanded";

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  };
}

function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number
) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

export function PieChart({
  title,
  slices,
  size = "compact",
  onExpand,
  valueFormatter
}: {
  title: string;
  slices: PieSlice[];
  size?: PieChartSize;
  onExpand?: () => void;
  valueFormatter?: (value: number) => string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);
  const width = size === "expanded" ? 520 : 220;
  const height = size === "expanded" ? 320 : 180;
  const radius = size === "expanded" ? 104 : 60;
  const cx = size === "expanded" ? 130 : 88;
  const cy = height / 2;
  const containerHeight = size === "expanded" ? "h-[520px]" : "h-[220px]";
  const legendText = size === "expanded" ? "text-sm" : "text-xs";

  if (total <= 0 || slices.length === 0) {
    return (
      <div className={`flex ${containerHeight} flex-col rounded-md border border-slate-200 p-4`}>
        <div className="mb-2 flex items-center justify-between">
          <p className={`${size === "expanded" ? "text-base" : "text-sm"} font-semibold text-slate-900`}>
            {title}
          </p>
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
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
          No data available for this range.
        </div>
      </div>
    );
  }

  let angleCursor = 0;
  const paths = slices.map((slice) => {
    const sweep = (slice.amount / total) * 360;
    const path = describeArc(cx, cy, radius, angleCursor, angleCursor + sweep);
    const mid = angleCursor + sweep / 2;
    angleCursor += sweep;
    return { ...slice, path, mid };
  });

  return (
    <div className={`flex ${containerHeight} flex-col rounded-md border border-slate-200 p-4`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={`${size === "expanded" ? "text-base" : "text-sm"} font-semibold text-slate-900`}>
          {title}
        </p>
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

      <div className="flex min-h-0 flex-1 items-start gap-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={
            size === "expanded" ? "h-[280px] w-[300px] shrink-0" : "h-[150px] w-[190px] shrink-0"
          }
        >
          {paths.map((slice) => (
            <path key={slice.label} d={slice.path} fill={slice.color} stroke="#fff" strokeWidth="1.5" />
          ))}
          {paths.map((slice) => {
            if (slice.percentage < 7 && size !== "expanded") return null;
            const labelPos = polarToCartesian(cx, cy, radius * 0.62, slice.mid);
            return (
              <text
                key={`${slice.label}-label`}
                x={labelPos.x}
                y={labelPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={size === "expanded" ? 12 : 10}
                fill="#0F172A"
              >
                {slice.percentage.toFixed(0)}%
              </text>
            );
          })}
        </svg>

        <div className={`min-w-0 flex-1 overflow-auto ${legendText}`}>
          <div className="space-y-2">
            {paths.map((slice) => (
              <div key={`${slice.label}-legend`} className="rounded-md border border-slate-100 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="font-medium text-slate-800 break-words">{slice.label}</span>
                  </div>
                  <span className="text-slate-500">{slice.percentage.toFixed(1)}%</span>
                </div>
                <p className="mt-0.5 text-slate-600">
                  {valueFormatter ? valueFormatter(slice.amount) : slice.amount.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
