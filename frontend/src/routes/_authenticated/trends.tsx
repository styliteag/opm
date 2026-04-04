import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { fetchApi } from "@/lib/api";
import { useNetworks } from "@/features/dashboard/hooks/useDashboardData";
import type { TrendDataResponse, AlertTrendDataResponse } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/trends")({
  component: TrendsPage,
});

type RangeKey = "7d" | "30d" | "90d";
type PeriodKey = "day" | "week" | "month";

const RANGE_DAYS: Record<RangeKey, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function dateRange(range: RangeKey) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - RANGE_DAYS[range]);
  return {
    start_date: start.toISOString().split("T")[0],
    end_date: end.toISOString().split("T")[0],
  };
}

function buildParams(
  range: RangeKey,
  networkId: number | null,
  period: PeriodKey = "day",
) {
  const { start_date, end_date } = dateRange(range);
  const params = new URLSearchParams({
    start_date,
    end_date,
    period,
  });
  if (networkId !== null) {
    params.set("network_id", String(networkId));
  }
  return params.toString();
}

function formatChartDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function TrendsPage() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [period, setPeriod] = useState<PeriodKey>("day");
  const [networkId, setNetworkId] = useState<number | null>(null);
  const networks = useNetworks();
  const networkList = networks.data?.networks ?? [];

  const qs = buildParams(range, networkId, period);

  const openPorts = useQuery({
    queryKey: ["trends", "open-ports", range, period, networkId],
    queryFn: () => fetchApi<TrendDataResponse>(`/api/trends/open-ports?${qs}`),
  });

  const hosts = useQuery({
    queryKey: ["trends", "hosts", range, period, networkId],
    queryFn: () => fetchApi<TrendDataResponse>(`/api/trends/hosts?${qs}`),
  });

  const alerts = useQuery({
    queryKey: ["trends", "alerts", range, period, networkId],
    queryFn: () => fetchApi<AlertTrendDataResponse>(`/api/trends/alerts?${qs}`),
  });

  const isLoading = openPorts.isLoading || hosts.isLoading || alerts.isLoading;
  const error = openPorts.error || hosts.error || alerts.error;

  if (isLoading) return <LoadingState rows={10} />;
  if (error) return <ErrorState message={(error as Error).message} />;

  const openPortsData = (openPorts.data?.data ?? []).map((d) => ({
    ...d,
    label: formatChartDate(d.date),
  }));

  const hostsData = (hosts.data?.data ?? []).map((d) => ({
    ...d,
    label: formatChartDate(d.date),
  }));

  const alertsData = (alerts.data?.data ?? []).map((d) => ({
    ...d,
    label: formatChartDate(d.date),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-strong text-foreground">Trends</h1>

        <div className="flex items-center gap-3">
          {/* Network filter */}
          <Select
            value={networkId ?? ""}
            onChange={(e) =>
              setNetworkId(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">All Networks</option>
            {networkList.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </Select>

          {/* Period selector */}
          <div className="flex rounded-md border border-border">
            {(["day", "week", "month"] as PeriodKey[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "ghost"}
                size="sm"
                className="rounded-none first:rounded-l-md last:rounded-r-md capitalize"
                onClick={() => setPeriod(p)}
              >
                {p}
              </Button>
            ))}
          </div>

          {/* Date range buttons */}
          <div className="flex rounded-md border border-border">
            {(["7d", "30d", "90d"] as RangeKey[]).map((r) => (
              <Button
                key={r}
                variant={range === r ? "default" : "ghost"}
                size="sm"
                className="rounded-none first:rounded-l-md last:rounded-r-md"
                onClick={() => setRange(r)}
              >
                {r}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Open Ports Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Open Ports</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <ResponsiveContainer width="100%" height={256} minWidth={0}>
              <LineChart data={openPortsData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                  name="Open Ports"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Host Count Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Hosts Discovered</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <ResponsiveContainer width="100%" height={256} minWidth={0}>
              <LineChart data={hostsData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  name="Hosts"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Alert Count Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <ResponsiveContainer width="100%" height={256} minWidth={0}>
              <LineChart data={alertsData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  name="Total Alerts"
                />
                <Line
                  type="monotone"
                  dataKey="dismissed_count"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  name="Dismissed"
                  strokeDasharray="5 5"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
