// PROTOTYPE (UI v4)
import type { Alert, NetworkStatusEntry } from "@/lib/types";

import type { PortGroup } from "../protoData";

export interface HomeData {
  groups: PortGroup[];
  findings: Alert[];
  networks: NetworkStatusEntry[];
  offlineScanners: string[];
  rawPortAlertCount: number;
}
