import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Settings2, ShieldAlert } from "lucide-react";

import { AdvancedSettings } from "@/components/disclosure/AdvancedSettings";
import { Button } from "@/components/ui/button";
import { FindingSeverityBadge } from "@/features/hosts/components/FindingItem";
import { HostKnownHostnames } from "@/features/hosts/components/HostKnownHostnames";
import { HostScanDialog } from "@/features/hosts/components/HostScanDialog";
import type { HostFinding } from "@/features/hosts/lib/hostFindings";
import { SeverityRuleDialog } from "@/features/severity-rules/components/SeverityRuleDialog";
import type { HostOverviewResponse } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

interface HostAdvancedProps {
  data: HostOverviewResponse;
  findings: HostFinding[];
  onScanStarted: () => void;
}

const H =
  "text-xs font-emphasis uppercase tracking-wider text-muted-foreground";

function RecentScans({
  scans,
}: {
  scans: HostOverviewResponse["recent_scans"];
}) {
  if (scans.length === 0)
    return <p className="text-sm text-muted-foreground">No scans yet.</p>;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {scans.map((s) => (
        <li
          key={s.id}
          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
        >
          <Link
            to="/scans/$scanId"
            params={{ scanId: String(s.id) }}
            className="text-primary hover:text-primary/80"
          >
            Scan #{s.id}
          </Link>
          <span className="flex-1 truncate text-muted-foreground">
            {s.network_name ?? `Network ${s.network_id}`} · {s.status} ·{" "}
            {s.trigger_type} · {s.port_count} ports
          </span>
          <span className="text-xs text-muted-foreground">
            {s.started_at ? formatRelativeTime(s.started_at) : "not started"}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Finding IDs + severity rules (ADR 0012: rules are an advanced tool). */
function FindingRules({ findings }: { findings: HostFinding[] }) {
  const [ruleFor, setRuleFor] = useState<HostFinding | null>(null);
  const withIds = findings.filter((f) => f.findingId && f.source !== "ssh");
  if (withIds.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No findings with a finding ID.
      </p>
    );
  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {withIds.map((f) => (
          <li key={f.key} className="flex items-center gap-3 px-3 py-2 text-sm">
            <FindingSeverityBadge severity={f.severity} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{f.title}</span>
              <span className="block truncate font-mono text-xs text-muted-foreground">
                {f.findingId} · {f.source} ·{" "}
                {f.port != null ? `port ${f.port}` : "host"}
              </span>
            </span>
            <Button variant="outline" size="xs" onClick={() => setRuleFor(f)}>
              <ShieldAlert />
              Change severity rule
            </Button>
          </li>
        ))}
      </ul>
      {ruleFor?.findingId && (
        <SeverityRuleDialog
          open
          onClose={() => setRuleFor(null)}
          oid={ruleFor.findingId}
          findingName={ruleFor.title}
          nativeSeverity={ruleFor.severity}
          networkId={null}
        />
      )}
    </>
  );
}

export function HostAdvanced({
  data,
  findings,
  onScanStarted,
}: HostAdvancedProps) {
  const [scanOpen, setScanOpen] = useState(false);
  const { host, networks, recent_scans } = data;

  return (
    <AdvancedSettings summary="Scans, known hostnames, custom scan, finding IDs and severity rules">
      <section className="space-y-2">
        <h3 className={H}>Recent scans</h3>
        <RecentScans scans={recent_scans} />
      </section>
      <section className="space-y-2">
        <h3 className={H}>Known hostnames</h3>
        <HostKnownHostnames hostId={host.id} />
      </section>
      <section className="space-y-2">
        <h3 className={H}>Custom scan</h3>
        <Button
          variant="outline"
          size="sm"
          disabled={networks.length === 0}
          onClick={() => setScanOpen(true)}
        >
          <Settings2 />
          Custom scan…
        </Button>
        <HostScanDialog
          open={scanOpen}
          onOpenChange={setScanOpen}
          hostIp={host.ip}
          networkId={networks[0]?.id ?? 0}
          onSuccess={onScanStarted}
        />
      </section>
      <section className="space-y-2">
        <h3 className={H}>Finding IDs and severity rules</h3>
        <FindingRules findings={findings} />
      </section>
    </AdvancedSettings>
  );
}
