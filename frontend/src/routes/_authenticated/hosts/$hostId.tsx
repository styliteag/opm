import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronDown,
  Download,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InlineHostname } from "@/features/hosts/components/InlineHostname";
import { HostComment } from "@/features/hosts/components/HostComment";
import { HostKnownHostnames } from "@/features/hosts/components/HostKnownHostnames";
import { HostPortsTab } from "@/features/hosts/components/HostPortsTab";
import { HostAlertsTab } from "@/features/hosts/components/HostAlertsTab";
import { HostScansTab } from "@/features/hosts/components/HostScansTab";
import { HostSshTab } from "@/features/hosts/components/HostSshTab";
import { HostActivityFeed } from "@/features/hosts/components/HostActivityFeed";
import { HostScanDialog } from "@/features/hosts/components/HostScanDialog";
import { HostVulnerabilitiesPanel } from "@/features/hosts/components/HostVulnerabilitiesPanel";
import { RiskSparkline } from "@/features/hosts/components/RiskSparkline";
import {
  useHostDetail,
  useHostRiskTrend,
  useRescanHost,
} from "@/features/hosts/hooks/useHosts";
import { useHostGvmVulnerabilities } from "@/features/hosts/hooks/useHostGvmVulnerabilities";
import {
  computeRiskScore,
  riskScoreColor,
  riskScoreLabel,
} from "@/lib/risk-score";
import { formatRelativeTime, cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/hosts/$hostId")({
  component: HostDetailPage,
});

function HostDetailPage() {
  const { hostId } = Route.useParams();
  const id = Number(hostId);
  const { data, isLoading, error, refetch } = useHostDetail(id);
  const vulnerabilities = useHostGvmVulnerabilities(id);
  const rescan = useRescanHost();
  const riskTrend = useHostRiskTrend(id);
  const [scanDialogOpen, setScanDialogOpen] = useState(false);

  if (isLoading) return <LoadingState rows={8} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!data) return <ErrorState message="Host not found" />;

  const { host, ports, alerts, ssh, recent_scans, networks } = data;
  const vulnList = vulnerabilities.data?.results ?? [];
  const totalVulnCount = vulnList.length;
  const riskScore = computeRiskScore(alerts, ports, ssh);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/hosts"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <InlineHostname hostId={id} hostname={host.hostname} ip={host.ip} />
            <p className="mt-0.5 font-mono text-sm text-muted-foreground">
              {host.ip}
              {host.hostname && ` · ${host.hostname}`}
              {networks.length > 0 && (
                <>
                  {" · "}
                  {networks.map((n, i) => (
                    <span key={n.id}>
                      {i > 0 && ", "}
                      <Link
                        to="/networks/$networkId"
                        params={{ networkId: String(n.id) }}
                        className="hover:text-primary transition-colors"
                      >
                        {n.name}
                      </Link>
                    </span>
                  ))}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            {riskTrend.data && <RiskSparkline points={riskTrend.data.points} />}
            <div className="text-right">
              <p
                className={cn(
                  "text-3xl font-strong",
                  riskScoreColor(riskScore),
                )}
              >
                {riskScore}
              </p>
              <p className="text-xs text-muted-foreground">
                {riskScoreLabel(riskScore)} Risk
              </p>
            </div>
          </div>

          {/* Export dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-accent transition-colors">
              <Download className="h-3.5 w-3.5" />
              Export
              <ChevronDown className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => window.open("/api/hosts/export/csv", "_blank")}
              >
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => window.open("/api/hosts/export/pdf", "_blank")}
              >
                Export PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            disabled={rescan.isPending}
            onClick={() =>
              rescan.mutate(host.ip, {
                onSuccess: (resp) => {
                  toast.success(resp.message ?? "Rescan triggered");
                  refetch();
                },
                onError: (err) =>
                  toast.error(err.message ?? "Failed to trigger rescan"),
              })
            }
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", rescan.isPending && "animate-spin")}
            />
            {rescan.isPending ? "Scanning…" : "Rescan"}
          </button>

          <button
            className="flex items-center gap-1.5 rounded-md border border-border bg-accent px-3 py-1.5 text-sm text-foreground hover:bg-accent/80 transition-colors"
            onClick={() => setScanDialogOpen(true)}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Custom Scan
          </button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Open Ports</p>
          <p className="mt-1 text-2xl font-strong text-foreground">
            {ports.length}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Active Alerts</p>
          <p className="mt-1 text-2xl font-strong text-foreground">
            {alerts.length}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Coverage</p>
          <p className="mt-1 text-2xl font-strong text-foreground">
            {ports.length > 0
              ? Math.round(
                  (ports.filter((p) => p.rule_status).length / ports.length) *
                    100,
                )
              : 0}
            %
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Last Seen</p>
          <p className="mt-1 text-sm font-emphasis text-foreground">
            {formatRelativeTime(host.last_seen_at)}
          </p>
        </div>
      </div>

      {/* Host Comment */}
      <HostComment hostId={id} comment={host.user_comment} />

      {/* Cached reverse-IP hostnames (hidden when no cache row exists) */}
      <HostKnownHostnames hostId={id} />

      {/* Tabbed Content */}
      <Tabs defaultValue="ports">
        <TabsList>
          <TabsTrigger value="ports">Ports ({ports.length})</TabsTrigger>
          <TabsTrigger value="alerts">Alerts ({alerts.length})</TabsTrigger>
          <TabsTrigger value="vulns">
            Vulnerabilities ({totalVulnCount})
          </TabsTrigger>
          <TabsTrigger value="scans">Scans ({recent_scans.length})</TabsTrigger>
          <TabsTrigger value="ssh">SSH</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="ports" className="mt-4">
          <HostPortsTab ports={ports} hostId={id} />
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <HostAlertsTab alerts={alerts} />
        </TabsContent>

        <TabsContent value="vulns" className="mt-4">
          <HostVulnerabilitiesPanel
            results={vulnList}
            isLoading={vulnerabilities.isLoading}
          />
        </TabsContent>

        <TabsContent value="scans" className="mt-4">
          <HostScansTab scans={recent_scans} />
        </TabsContent>

        <TabsContent value="ssh" className="mt-4">
          <HostSshTab ssh={ssh} />
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <HostActivityFeed hostId={id} />
        </TabsContent>
      </Tabs>

      <HostScanDialog
        open={scanDialogOpen}
        onOpenChange={setScanDialogOpen}
        hostIp={host.ip}
        networkId={networks[0]?.id ?? 0}
        onSuccess={refetch}
      />
    </div>
  );
}
