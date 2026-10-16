/** Home queue filters; both map 1:1 onto `GET /api/alerts/` params. */
export interface HomeFilters {
  /** Substring of IP, port, hostname, network name or message (backend `search`). */
  search?: string;
  network_id?: number;
}

/** The backend rejects longer `search` values with a 422. */
const MAX_SEARCH = 200;

/** Validates Home's URL search params; anything unusable is dropped. */
export function parseHomeFilters(raw: Record<string, unknown>): HomeFilters {
  const filters: HomeFilters = {};
  if (typeof raw.search === "string") {
    const search = raw.search.trim();
    if (search && search.length <= MAX_SEARCH) filters.search = search;
  }
  const networkId = Number(raw.network_id);
  if (Number.isInteger(networkId) && networkId > 0) filters.network_id = networkId;
  return filters;
}

export function hasHomeFilters(filters: HomeFilters): boolean {
  return Boolean(filters.search) || filters.network_id !== undefined;
}
