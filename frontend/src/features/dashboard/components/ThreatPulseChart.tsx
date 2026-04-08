import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AlertTrendDataPoint } from "@/lib/types";

interface ThreatPulseChartProps {
  data: AlertTrendDataPoint[];
}

export function ThreatPulseChart({ data }: ThreatPulseChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    date: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    active: d.count - d.dismissed_count,
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Threat Pulse (30d)</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="h-64"
          role="img"
          aria-label="Alert trend chart showing new alerts and resolved alerts over the past 30 days"
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={formatted}>
              <defs>
                <linearGradient id="alertGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="dismissedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  color: "var(--foreground)",
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="active"
                name="New Alerts"
                stroke="#ef4444"
                fill="url(#alertGrad)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="dismissed_count"
                name="Resolved"
                stroke="#22c55e"
                fill="url(#dismissedGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
