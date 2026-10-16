import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { EmptyState } from "@/components/data-display/EmptyState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
import { Select } from "@/components/ui/select";
import { useNetworks } from "@/features/dashboard/hooks/useDashboardData";
import { PortsTable } from "@/features/ports/components/PortsTable";
import {
  Pager,
  SegmentedControl,
} from "@/features/ports/components/ListControls";
import { useGlobalPortList } from "@/features/ports/hooks/usePorts";
import {
  hasNextPage,
  PORTS_PAGE_SIZE,
  SERVICE_CHIPS,
  STATUS_VIEWS,
  type PortsView,
} from "@/features/ports/lib/portsQuery";
import { cn } from "@/lib/utils";

const VIEW_OPTIONS = (Object.keys(STATUS_VIEWS) as PortsView[]).map((key) => ({
  key,
  label: STATUS_VIEWS[key].label,
}));

interface PortsTabProps {
  initialSearch?: string;
  initialNetworkId?: number;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function PortsTab({ initialSearch, initialNetworkId }: PortsTabProps) {
  const [view, setView] = useState<PortsView>("decide");
  const [search, setSearch] = useState(initialSearch ?? "");
  const [service, setService] = useState<string | undefined>();
  const [networkId, setNetworkId] = useState(initialNetworkId);
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebounced(search, 300);

  const ports = useGlobalPortList({
    view,
    page,
    networkId,
    search: debouncedSearch || undefined,
    service,
  });
  const networks = useNetworks();
  const networkNames = useMemo(
    () => new Map((networks.data?.networks ?? []).map((n) => [n.id, n.name])),
    [networks.data],
  );
  const list = ports.data?.ports ?? [];
  const total = ports.data?.total;

  const resetPage =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(0);
    };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Port status"
          options={VIEW_OPTIONS}
          value={view}
          onChange={resetPage(setView)}
        />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            aria-label="Search ports"
            placeholder="IP, hostname, port or service…"
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            className="w-64 rounded-md border border-border bg-background py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Select
          aria-label="Network"
          className="w-48"
          value={networkId ?? ""}
          onChange={(e) =>
            resetPage(setNetworkId)(
              e.target.value ? Number(e.target.value) : undefined,
            )
          }
        >
          <option value="">All networks</option>
          {(networks.data?.networks ?? []).map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </Select>
        <div className="flex gap-1" role="group" aria-label="Service">
          {SERVICE_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              aria-pressed={service === chip.value}
              onClick={() =>
                resetPage(setService)(
                  service === chip.value ? undefined : chip.value,
                )
              }
              className={cn(
                "cursor-pointer rounded-md px-2 py-1 text-xs font-emphasis transition-colors",
                service === chip.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-2 text-text-quaternary hover:text-text-secondary",
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {ports.isLoading ? (
        <LoadingState rows={8} />
      ) : ports.error ? (
        <ErrorState
          message={ports.error.message}
          onRetry={() => ports.refetch()}
        />
      ) : (
        <>
          {list.length === 0 ? (
            <EmptyState
              title={view === "decide" ? "Nothing to decide" : "No open ports"}
              message={
                view === "decide"
                  ? "Every open port matching these filters is explained."
                  : "No open ports match the current filters."
              }
            />
          ) : (
            <PortsTable ports={list} networkNames={networkNames} />
          )}
          {(list.length > 0 || page > 0) && (
            <Pager
              page={page}
              pageSize={PORTS_PAGE_SIZE}
              shown={list.length}
              total={total}
              hasNext={hasNextPage(page, list.length, total)}
              noun="ports"
              onPage={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
