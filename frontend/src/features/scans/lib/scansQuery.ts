/** Status presets of the Recent scans page; `active` = queued + running. */
export const SCAN_STATUS_PRESETS = ["all", "active", "completed", "failed", "cancelled"] as const;
export type ScanStatusPreset = (typeof SCAN_STATUS_PRESETS)[number];

export const SCAN_STATUS_PRESET_LABEL: Record<ScanStatusPreset, string> = {
  all: "All",
  active: "In progress",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const SCANS_PAGE_SIZE = 50;

const PRESET_STATUSES: Record<ScanStatusPreset, string[]> = {
  all: [],
  active: ["planned", "running"],
  completed: ["completed"],
  failed: ["failed"],
  cancelled: ["cancelled"],
};

export interface ScansQuery {
  status: ScanStatusPreset;
  networkId?: number;
  showHidden?: boolean;
  page: number;
}

/** Query string for `GET /api/scans`. */
export function buildScansQuery(q: ScansQuery): string {
  const params = new URLSearchParams();
  for (const s of PRESET_STATUSES[q.status]) params.append("status", s);
  if (q.networkId) params.set("network_id", String(q.networkId));
  if (q.showHidden) params.set("include_hidden", "true");
  params.set("offset", String(q.page * SCANS_PAGE_SIZE));
  params.set("limit", String(SCANS_PAGE_SIZE));
  return params.toString();
}

export interface ScansSearch {
  network_id?: number;
  status?: ScanStatusPreset;
}

/** validateSearch for `/scans`: keeps a positive network id and a known preset. */
export function parseScansSearch(search: Record<string, unknown>): ScansSearch {
  const out: ScansSearch = {};
  const id = Number(search.network_id);
  if (Number.isInteger(id) && id > 0) out.network_id = id;
  if (
    typeof search.status === "string" &&
    (SCAN_STATUS_PRESETS as readonly string[]).includes(search.status)
  ) {
    out.status = search.status as ScanStatusPreset;
  }
  return out;
}
