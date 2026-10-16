import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
import { FindingsList } from "@/features/hosts/components/FindingsList";
import { HostActivityFeed } from "@/features/hosts/components/HostActivityFeed";
import { HostAdvanced } from "@/features/hosts/components/HostAdvanced";
import { HostHeader } from "@/features/hosts/components/HostHeader";
import { HostPortTable } from "@/features/hosts/components/HostPortTable";
import { useHostFindings } from "@/features/hosts/hooks/useHostFindings";
import { useHostDetail } from "@/features/hosts/hooks/useHosts";
import {
  findingsByPort,
  hostPortRows,
  isImportantFinding,
} from "@/features/hosts/lib/hostFindings";
import type { HostOverviewResponse } from "@/lib/types";

const EMPTY: HostOverviewResponse["alerts"] = [];

function Activity({ hostId }: { hostId: number }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <section className="space-y-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md text-sm font-emphasis text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Chevron className="h-4 w-4" />
        Activity
      </button>
      {open && <HostActivityFeed hostId={hostId} />}
    </section>
  );
}

/** Host detail (UI v4): ports first, findings as evidence on each port. */
export function HostDetailPage({ hostId }: { hostId: number }) {
  const { data, isLoading, error, refetch } = useHostDetail(hostId);
  const openAlerts = data?.alerts ?? EMPTY;
  const findingsQuery = useHostFindings(
    hostId,
    data?.host.ip ?? "",
    openAlerts,
  );

  const rows = useMemo(
    () =>
      data ? hostPortRows(data.ports, data.alerts, data.dismissed_alerts) : [],
    [data],
  );
  const byPort = useMemo(
    () => findingsByPort(findingsQuery.findings),
    [findingsQuery.findings],
  );

  if (isLoading) return <LoadingState rows={8} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!data) return <ErrorState message="Host not found" />;

  const openPorts = new Set(data.ports.map((p) => p.port));
  // Findings on ports that are no longer open would otherwise be invisible.
  const hostFindings = findingsQuery.findings.filter(
    (f) => f.port === null || !openPorts.has(f.port),
  );
  const toReview = rows.filter(
    (r) => r.status === "new" || r.status === "review",
  ).length;
  const important = findingsQuery.findings.filter(isImportantFinding).length;

  return (
    <div className="space-y-6">
      <HostHeader
        host={data.host}
        networks={data.networks}
        toReview={toReview}
        importantFindings={important}
      />

      {findingsQuery.error && (
        <ErrorState
          message={`Findings could not be loaded: ${findingsQuery.error.message}`}
        />
      )}
      <HostPortTable rows={rows} findingsByPort={byPort} />

      {hostFindings.length > 0 && (
        <section className="space-y-2 rounded-lg border border-border p-4">
          <h2 className="text-sm font-emphasis text-foreground">
            Host findings
          </h2>
          <p className="text-xs text-muted-foreground">
            Findings not tied to a currently open port.
          </p>
          <FindingsList findings={hostFindings} />
        </section>
      )}

      <Activity hostId={hostId} />

      <HostAdvanced
        data={data}
        findings={findingsQuery.findings}
        onScanStarted={() => void refetch()}
      />
    </div>
  );
}
