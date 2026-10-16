/**
 * `/scans` left the navigation in UI v4: scan history lives on the network
 * detail page. Old links keep working: `?network_id=N` → that network's
 * Scans tab, anything else → the Networks list.
 */
export type ScansRedirect =
  | { to: "/networks" }
  | {
      to: "/networks/$networkId";
      params: { networkId: string };
      search: { tab: "scans" };
    };

export function scansRedirectTarget(
  search: Record<string, unknown>,
): ScansRedirect {
  const id = Number(search.network_id);
  if (Number.isInteger(id) && id > 0) {
    return {
      to: "/networks/$networkId",
      params: { networkId: String(id) },
      search: { tab: "scans" },
    };
  }
  return { to: "/networks" };
}
