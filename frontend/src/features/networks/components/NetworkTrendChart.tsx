import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchApi } from "@/lib/api";
import type { AlertTrendDataResponse } from "@/lib/types";

interface NetworkTrendChartProps {
  networkId: number;
}

export function NetworkTrendChart({ networkId }: NetworkTrendChartProps) {
  const [start, end] = useMemo(() => {
    const now = new Date();
    const e = now.toISOString().slice(0, 10);
    const s = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return [s, e];
  }, []);

  const { data } = useQuery({
    queryKey: ["trends", "alerts", networkId, start, end],
    queryFn: () =>
      fetchApi<AlertTrendDataResponse>(
        `/api/trends/alerts?network_id=${networkId}&start_date=${start}&end_date=${end}&period=day`,
      ),
    enabled: networkId > 0,
    refetchInterval: 60_000,
  });

  const formatted = (data?.data ?? []).map((d) => ({
    ...d,
    date: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    active: d.count - d.dismissed_count,
  }));

  if (formatted.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Alert Trend (30d)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48" role="img" aria-label="Network alert trend chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formatted}>
              <defs>
                <linearGradient
                  id={`alertGrad-${networkId}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient
                  id={`dismissedGrad-${networkId}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
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
                name="Active"
                stroke="#ef4444"
                fill={`url(#alertGrad-${networkId})`}
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="dismissed_count"
                name="Resolved"
                stroke="#22c55e"
                fill={`url(#dismissedGrad-${networkId})`}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
