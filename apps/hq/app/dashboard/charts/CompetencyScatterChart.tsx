'use client';

import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';

export interface CompetencyScatterPoint {
  student: string;
  competency: string;
  growth: number;
  progress: number;
}

const PALETTE = [
  '#2563eb', // blue
  '#16a34a', // green
  '#d97706', // amber
  '#9333ea', // purple
  '#dc2626', // red
  '#0891b2', // cyan
  '#65a30d', // lime
  '#db2777', // pink
];

interface Props {
  data: CompetencyScatterPoint[];
}

interface TooltipPayloadItem {
  payload?: CompetencyScatterPoint;
}

function renderTooltip(
  active: boolean | undefined,
  payload: TooltipPayloadItem[] | undefined,
): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-ink">{p.student}</div>
      <div className="text-muted">{p.competency}</div>
      <div className="mt-1">
        Growth: <span className="font-medium text-ink">{p.growth}</span>
      </div>
      <div>
        Progress: <span className="font-medium text-ink">{p.progress}%</span>
      </div>
    </div>
  );
}

export function CompetencyScatterChart({ data }: Props): JSX.Element {
  if (data.length === 0) {
    return <p className="text-sm text-muted">No competency data to chart.</p>;
  }

  const competencies = [...new Set(data.map((d) => d.competency))].sort();
  const grouped = competencies.map((c) => ({
    competency: c,
    points: data.filter((d) => d.competency === c),
  }));

  return (
    <div className="h-96 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 16, right: 16, bottom: 32, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            type="number"
            dataKey="growth"
            name="Growth"
            stroke="#64748b"
            fontSize={12}
            label={{ value: 'Growth', position: 'insideBottom', offset: -8, fontSize: 12, fill: '#64748b' }}
          />
          <YAxis
            type="number"
            dataKey="progress"
            name="Progress"
            stroke="#64748b"
            fontSize={12}
            domain={[0, 100]}
            tickFormatter={(v) => `${String(v)}%`}
            label={{ value: 'Progress', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#64748b' }}
          />
          <ZAxis range={[60, 60]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={(props) =>
              renderTooltip(
                props.active,
                props.payload as unknown as TooltipPayloadItem[] | undefined,
              )
            }
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 16 }}
            iconType="circle"
            iconSize={8}
          />
          {grouped.map((g, i) => (
            <Scatter
              key={g.competency}
              name={g.competency}
              data={g.points}
              fill={PALETTE[i % PALETTE.length]}
              fillOpacity={0.7}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
