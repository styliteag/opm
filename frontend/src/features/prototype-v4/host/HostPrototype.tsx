// PROTOTYPE (UI v4) — Host detail variants on /hosts/$hostId via ?variant=A|B|C.
// Question: how should a ports-first host page show status, Why, and per-port findings?
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { useHostDetail } from "@/features/hosts/hooks/useHosts";
import { useHostGvmVulnerabilities } from "@/features/hosts/hooks/useHostGvmVulnerabilities";

import type {
  Vulnerability,
  VulnerabilitySeverity,
  VulnerabilitySource,
} from "@/lib/types";

import { PrototypeSwitcher } from "../PrototypeSwitcher";
import { HostVariantA } from "./HostVariantA";
import { HostVariantB } from "./HostVariantB";
import { HostVariantC } from "./HostVariantC";
import type { HostData } from "./types";

const VARIANTS = [
  { key: "A", label: "Port table + expand" },
  { key: "B", label: "Split view" },
  { key: "C", label: "Needs you first" },
];

export function HostPrototype({ hostId, variant }: { hostId: number; variant: string }) {
  const detail = useHostDetail(hostId);
  const vulns = useHostGvmVulnerabilities(hostId);

  if (detail.isLoading || vulns.isLoading) return <LoadingState rows={8} />;
  if (detail.error) return <ErrorState message={detail.error.message} />;
  if (!detail.data) return <ErrorState message="Host not found" />;

  const data: HostData = {
    host: detail.data.host,
    ports: [...detail.data.ports].sort((a, b) => a.port - b.port),
    networks: detail.data.networks,
    // vulnerabilities endpoint covers GVM/nuclei only; fold open SSH/NSE alerts in as
    // pseudo-findings so the prototype shows every finding on its port.
    vulns: [
      ...(vulns.data?.results ?? []),
      ...detail.data.alerts
        .filter((a) => a.type.startsWith("ssh_") || a.type.startsWith("nse_"))
        .map(
          (a): Vulnerability => ({
            id: -a.id,
            scan_id: 0,
            ip: detail.data.host.ip,
            port: a.port,
            protocol: "tcp",
            oid: a.type,
            name: a.message,
            description: "",
            severity: 0,
            severity_label: a.severity as VulnerabilitySeverity,
            cvss_base_vector: null,
            cve_ids: [],
            solution: null,
            solution_type: null,
            qod: null,
            source: (a.type.startsWith("ssh_") ? "ssh" : "nse") as VulnerabilitySource,
            created_at: a.created_at,
          }),
        ),
    ],
    lastScan: detail.data.recent_scans[0] ?? null,
  };

  return (
    <>
      {variant === "B" ? (
        <HostVariantB data={data} />
      ) : variant === "C" ? (
        <HostVariantC data={data} />
      ) : (
        <HostVariantA data={data} />
      )}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </>
  );
}
