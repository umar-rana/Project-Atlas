"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface UsageChartProps {
  data: Array<{
    task: string;
    costUsd: number;
  }>;
}

interface TooltipPayloadItem {
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  if (value === undefined) return null;
  return (
    <div className="rounded-lg border border-border-default bg-surface-raised px-3 py-2 shadow-1 text-xs">
      <p className="mb-1 font-mono text-text-secondary">{label}</p>
      <p className="font-semibold text-accent-primary">
        ${value.toFixed(4)}
      </p>
    </div>
  );
}

export function UsageChart({ data }: UsageChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-text-tertiary">
        No data to display yet.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: d.task.replace(/_/g, " "),
    cost: d.costUsd,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 40 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
          angle={-30}
          textAnchor="end"
          interval={0}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => `$${v.toFixed(3)}`}
          tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
          tickLine={false}
          axisLine={false}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-surface-hover)" }} />
        <Bar dataKey="cost" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {chartData.map((_, i) => (
            <Cell key={i} fill="var(--color-accent-primary)" fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
