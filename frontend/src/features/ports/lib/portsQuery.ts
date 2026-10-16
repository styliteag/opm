import type { PortStatus } from "@/lib/types";

export const PORTS_PAGE_SIZE = 50;

/** Whether a page follows; `total` wins over the "full page means more" guess. */
export function hasNextPage(
  page: number,
  shown: number,
  total: number | undefined,
): boolean {
  if (total === undefined) return shown === PORTS_PAGE_SIZE;
  return page * PORTS_PAGE_SIZE + shown < total;
}

export type PortsView = "decide" | "expected" | "snoozed" | "all";

/** Status segmented control on the Ports tab; "To decide" is the default. */
export const STATUS_VIEWS: Record<
  PortsView,
  { label: string; statuses: PortStatus[] }
> = {
  decide: { label: "To decide", statuses: ["new", "review"] },
  expected: { label: "Expected", statuses: ["expected"] },
  snoozed: { label: "Snoozed", statuses: ["snoozed"] },
  all: { label: "All", statuses: [] },
};

/** Quick chips; values are substrings of nmap's service_guess. */
export const SERVICE_CHIPS: readonly { label: string; value: string }[] = [
  { label: "HTTP", value: "http" },
  { label: "SSH", value: "ssh" },
  { label: "RDP", value: "ms-wbt-server" },
  { label: "SMB", value: "microsoft-ds" },
  { label: "DNS", value: "domain" },
];

export interface PortsFilter {
  view: PortsView;
  page: number;
  networkId?: number;
  search?: string;
  service?: string;
}

export interface PortSearchParams {
  ip_range?: string;
  port_min?: number;
  port_max?: number;
  q?: string;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/;
const IPV4_RANGE = /^\d{1,3}(\.\d{1,3}){3}\s*-\s*\d{1,3}(\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-f]*:[0-9a-f:]*(\/\d{1,3})?$/i;

/**
 * A full address, CIDR or range goes to ip_range (exact), a port number to
 * port_min/port_max, anything else to q (substring of ip, hostname, service).
 */
export function parsePortSearch(raw: string): PortSearchParams {
  const q = raw.trim();
  if (!q) return {};
  if (IPV4.test(q) || IPV4_RANGE.test(q) || IPV6.test(q))
    return { ip_range: q };
  if (/^\d+$/.test(q)) {
    const port = Number(q);
    if (port >= 1 && port <= 65535) return { port_min: port, port_max: port };
  }
  return { q };
}

export function buildPortsParams(filter: PortsFilter): string {
  const params = new URLSearchParams();
  for (const status of STATUS_VIEWS[filter.view].statuses) {
    params.append("status", status);
  }
  if (filter.networkId) params.set("network_id", String(filter.networkId));
  const search = parsePortSearch(filter.search ?? "");
  if (search.ip_range) params.set("ip_range", search.ip_range);
  if (search.port_min) {
    params.set("port_min", String(search.port_min));
    params.set("port_max", String(search.port_max));
  }
  if (search.q) params.set("q", search.q);
  if (filter.service) params.set("service", filter.service);
  params.set("sort_by", "ip");
  params.set("sort_dir", "asc");
  params.set("offset", String(filter.page * PORTS_PAGE_SIZE));
  params.set("limit", String(PORTS_PAGE_SIZE));
  return params.toString();
}
