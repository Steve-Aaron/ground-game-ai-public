interface SparklineProps {
  /** Series of values to plot (left → right). At least 2 required to render. */
  data: number[];
  /** Stroke and fill colour (CSS value, e.g. '#12B6CF'). */
  color: string;
  /** SVG viewBox width — defaults to 280. */
  width?: number;
  /** SVG viewBox height — defaults to 48. */
  height?: number;
  /** Unique ID used for the gradient defs (SVG <defs> require unique ids). */
  id: string;
  /** Show an endpoint dot at the final data point. Defaults to true. */
  showEndpoint?: boolean;
}

/**
 * Minimal SVG line chart with gradient stroke and area fill.
 *
 * Single-series, no axes / tooltips / legend — designed for tight inline
 * trend indicators. Use recharts for anything that needs interaction.
 */
export default function Sparkline({
  data,
  color,
  width = 280,
  height = 48,
  id,
  showEndpoint = true,
}: SparklineProps) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const padY = 4;

  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: padY + (1 - (v - min) / range) * (height - padY * 2),
  }));

  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`))
    .join(" ");

  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

  const lineGradientId = `spark-line-${id}`;
  const areaGradientId = `spark-area-${id}`;
  const last = points[points.length - 1];

  return (
    <svg
      data-component="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={lineGradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </linearGradient>
        <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${areaGradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={`url(#${lineGradientId})`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showEndpoint ? (
        <>
          <circle cx={last.x} cy={last.y} r="3" fill={color} />
          <circle cx={last.x} cy={last.y} r="5" fill={color} opacity="0.3" />
        </>
      ) : null}
    </svg>
  );
}
