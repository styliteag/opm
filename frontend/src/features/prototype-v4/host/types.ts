// PROTOTYPE (UI v4)
import type { EnrichedHostPort, Host, HostScanEntry, Vulnerability } from "@/lib/types";

export interface HostData {
  host: Host;
  ports: EnrichedHostPort[];
  networks: { id: number; name: string; cidr: string }[];
  vulns: Vulnerability[];
  lastScan: HostScanEntry | null;
}
