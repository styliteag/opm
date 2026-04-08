import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Wifi,
  Monitor,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { fetchApi } from "@/lib/api";
import { useNetworks } from "@/features/dashboard/hooks/useDashboardData";
import { cn } from "@/lib/utils";
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
  const params = new URLSearchParams({ start_date, end_date, period });
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

interface DeltaInfo {
  current: number;
  delta: number;
  pct: number;
}

function computeDelta(data: { count: number }[]): DeltaInfo {
  if (data.length === 0) return { current: 0, delta: 0, pct: 0 };
  const current = data[data.length - 1].count;
  const first = data[0].count;
  const delta = current - first;
  const pct =
    first === 0 ? (current > 0 ? 100 : 0) : Math.round((delta / first) * 100);
  return { current, delta, pct };
}

interface SummaryCardProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  info: DeltaInfo;
  rangeSuffix: string;
  href?: string;
}

function SummaryCard({
  label,
  icon: Icon,
  info,
  rangeSuffix,
  href,
}: SummaryCardProps) {
  const navigate = useNavigate();
  const isUp = info.delta > 0;
  const isDown = info.delta < 0;
  const isFlat = info.delta === 0;

  const DeltaIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  return (
    <Card
      className={cn(
        href && "cursor-pointer transition-colors hover:bg-muted/50",
      )}
      onClick={href ? () => navigate({ to: href }) : undefined}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="mt-2 text-2xl font-strong text-foreground">
          {info.current.toLocaleString()}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <DeltaIcon
            className={cn(
              "h-3.5 w-3.5",
              isUp && "text-red-400",
              isDown && "text-emerald-400",
              isFlat && "text-muted-foreground",
            )}
          />
          <span
            className={cn(
              "text-xs font-emphasis",
              isUp && "text-red-400",
              isDown && "text-emerald-400",
              isFlat && "text-muted-foreground",
            )}
          >
            {isFlat
              ? "No change"
              : `${info.delta > 0 ? "+" : ""}${info.delta} (${info.pct}%)`}
          </span>
          <span className="text-xs text-quaternary">vs {rangeSuffix} ago</span>
        </div>
      </CardContent>
    </Card>
  );
}

interface ResolutionRateCardProps {
  info: DeltaInfo;
  rangeSuffix: string;
}

function ResolutionRateCard({ info, rangeSuffix }: ResolutionRateCardProps) {
  const isUp = info.delta > 0;
  const isDown = info.delta < 0;
  const isFlat = info.delta === 0;

  const DeltaIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Resolution Rate</p>
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="mt-2 text-2xl font-strong text-foreground">
          {info.current}%
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <DeltaIcon
            className={cn(
              "h-3.5 w-3.5",
              isUp && "text-emerald-400",
              isDown && "text-red-400",
              isFlat && "text-muted-foreground",
            )}
          />
          <span
            className={cn(
              "text-xs font-emphasis",
              isUp && "text-emerald-400",
              isDown && "text-red-400",
              isFlat && "text-muted-foreground",
            )}
          >
            {isFlat
              ? "No change"
              : `${info.delta > 0 ? "+" : ""}${info.delta}pp`}
          </span>
          <span className="text-xs text-quaternary">vs {rangeSuffix} ago</span>
        </div>
      </CardContent>
    </Card>
  );
}

const TOOLTIP_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  color: "var(--foreground)",
  fontSize: 12,
};

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 };

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
    active: d.count - d.dismissed_count,
    resolution_rate:
      d.count > 0 ? Math.round((d.dismissed_count / d.count) * 100) : 0,
  }));

  const portsDelta = computeDelta(openPortsData);
  const hostsDelta = computeDelta(hostsData);
  const alertsActiveSeries = alertsData.map((d) => ({ count: d.active }));
  const alertsDelta = computeDelta(alertsActiveSeries);

  const currentResRate =
    alertsData.length > 0
      ? alertsData[alertsData.length - 1].resolution_rate
      : 0;
  const firstResRate =
    alertsData.length > 0 ? alertsData[0].resolution_rate : 0;
  const resRateDelta: DeltaInfo = {
    current: currentResRate,
    delta: currentResRate - firstResRate,
    pct:
      firstResRate === 0
        ? currentResRate > 0
          ? 100
          : 0
        : Math.round(((currentResRate - firstResRate) / firstResRate) * 100),
  };

  const rangeSuffix = range;

  return (
    <div className="space-y-6">
      {/* Header + Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-strong text-foreground">Trends</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track how your attack surface evolves over time.
          </p>
        </div>

        <div className="flex items-center gap-3">
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Open Ports"
          icon={Wifi}
          info={portsDelta}
          rangeSuffix={rangeSuffix}
          href="/hosts"
        />
        <SummaryCard
          label="Hosts Discovered"
          icon={Monitor}
          info={hostsDelta}
          rangeSuffix={rangeSuffix}
          href="/hosts"
        />
        <SummaryCard
          label="Active Alerts"
          icon={ShieldAlert}
          info={alertsDelta}
          rangeSuffix={rangeSuffix}
          href="/alerts"
        />
        <ResolutionRateCard info={resRateDelta} rangeSuffix={rangeSuffix} />
      </div>

      {/* 2x2 Chart Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Open Ports */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Open Ports</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240} minWidth={0}>
              <AreaChart data={openPortsData}>
                <defs>
                  <linearGradient id="portsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7170ff" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#7170ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Open Ports"
                  stroke="#7170ff"
                  fill="url(#portsGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Hosts Discovered */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Hosts Discovered</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240} minWidth={0}>
              <AreaChart data={hostsData}>
                <defs>
                  <linearGradient id="hostsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Hosts"
                  stroke="#22c55e"
                  fill="url(#hostsGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240} minWidth={0}>
              <AreaChart data={alertsData}>
                <defs>
                  <linearGradient
                    id="alertActiveGrad"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient
                    id="alertDismissedGrad"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area
                  type="monotone"
                  dataKey="active"
                  name="Active Alerts"
                  stroke="#ef4444"
                  fill="url(#alertActiveGrad)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="dismissed_count"
                  name="Dismissed"
                  stroke="#22c55e"
                  fill="url(#alertDismissedGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Resolution Rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Resolution Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240} minWidth={0}>
              <AreaChart data={alertsData}>
                <defs>
                  <linearGradient id="resRateGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7170ff" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#7170ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number) => [
                    `${value}%`,
                    "Resolution Rate",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="resolution_rate"
                  name="Resolution Rate"
                  stroke="#7170ff"
                  fill="url(#resRateGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
