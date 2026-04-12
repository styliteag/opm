import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
  type SortingState,
  flexRender,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

import { InlineTextCell } from "@/components/ui/inline-text-cell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CachedVhostsChip } from "@/features/hosts/components/CachedVhostsChip";
import { patchApi } from "@/lib/api";
import type { Host } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

function SortableHeader({
  label,
  column,
}: {
  label: string;
  column: {
    getIsSorted: () => false | "asc" | "desc";
    getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
  };
}) {
  const sorted = column.getIsSorted();
  const Icon =
    sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
  const nextDirection =
    sorted === "asc"
      ? "descending"
      : sorted === "desc"
        ? "unsorted"
        : "ascending";
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className="flex items-center gap-1 text-xs cursor-pointer"
      aria-label={`Sort by ${label}, currently ${
        sorted === false ? "unsorted" : sorted === "asc" ? "ascending" : "descending"
      }, click to sort ${nextDirection}`}
    >
      {label} <Icon className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

interface HostsTableProps {
  hosts: Host[];
  selectedIds?: number[];
  onSelectChange?: (ids: number[]) => void;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
}

export function HostsTable({
  hosts,
  selectedIds,
  onSelectChange,
  sorting,
  onSortingChange,
}: HostsTableProps) {
  const selectable = Boolean(onSelectChange);
  const qc = useQueryClient();

  const hostnameMutation = useMutation({
    mutationFn: ({ hostId, hostname }: { hostId: number; hostname: string }) =>
      patchApi(`/api/hosts/${hostId}`, { hostname }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hosts"] });
      toast.success("Hostname updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commentMutation = useMutation({
    mutationFn: ({
      hostId,
      user_comment,
    }: {
      hostId: number;
      user_comment: string;
    }) => patchApi(`/api/hosts/${hostId}`, { user_comment }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hosts"] });
      toast.success("Comment saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = useMemo<ColumnDef<Host>[]>(
    () => [
      {
        accessorKey: "ip",
        header: ({ column }) => (
          <SortableHeader label="IP Address" column={column} />
        ),
        cell: ({ row }) => (
          <Link
            to="/hosts/$hostId"
            params={{ hostId: String(row.original.id) }}
            className="font-mono text-sm text-primary hover:text-primary/80 transition-colors"
          >
            {row.original.ip}
          </Link>
        ),
      },
      {
        accessorKey: "hostname",
        header: ({ column }) => (
          <SortableHeader label="Hostname" column={column} />
        ),
        cell: ({ row }) => {
          // Display value precedence: user-set host.hostname (still
          // inline-editable) wins; otherwise fall back to the cached
          // first vhost from the hostname_lookup_cache projection.
          // The +N chip is only shown when there are multiple cached
          // vhosts and reveals the full list on hover.
          const displayValue =
            row.original.hostname ?? row.original.cached_display_hostname;
          return (
            <div className="flex items-center gap-1 min-w-0">
              <div className="flex-1 min-w-0">
                <InlineTextCell
                  value={displayValue}
                  onSave={(val) =>
                    hostnameMutation.mutate({
                      hostId: row.original.id,
                      hostname: val,
                    })
                  }
                  saveLabel="Save hostname"
                  placeholder="-"
                  isPending={hostnameMutation.isPending}
                />
              </div>
              {row.original.cached_hostname_count > 1 ? (
                <CachedVhostsChip
                  hostId={row.original.id}
                  count={row.original.cached_hostname_count}
                />
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "user_comment",
        header: "Comment",
        cell: ({ row }) => (
          <InlineTextCell
            value={row.original.user_comment}
            onSave={(val) =>
              commentMutation.mutate({
                hostId: row.original.id,
                user_comment: val,
              })
            }
            saveLabel="Save comment"
            placeholder="Add comment..."
            isPending={commentMutation.isPending}
          />
        ),
        size: 200,
      },
      {
        accessorKey: "open_port_count",
        header: "Open Ports",
        cell: ({ getValue }) => {
          const count = getValue<number | null>();
          return (
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-emphasis text-primary">
              {count ?? 0}
            </span>
          );
        },
        size: 100,
      },
      {
        accessorKey: "last_seen_at",
        header: ({ column }) => (
          <SortableHeader label="Last Seen" column={column} />
        ),
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">
            {formatRelativeTime(getValue<string>())}
          </span>
        ),
        size: 120,
      },
    ],
    [hostnameMutation, commentMutation],
  );

  const table = useReactTable({
    data: hosts,
    columns,
    state: { sorting },
    manualSorting: true,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  const toggleId = (id: number) => {
    if (!onSelectChange || !selectedIds) return;
    onSelectChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  };

  const toggleAll = () => {
    if (!onSelectChange || !selectedIds) return;
    const allIds = hosts.map((h) => h.id);
    const allSelected = allIds.every((id) => selectedIds.includes(id));
    onSelectChange(allSelected ? [] : allIds);
  };

  return (
    <TooltipProvider>
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border bg-card">
              {selectable && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all hosts"
                    checked={
                      hosts.length > 0 &&
                      hosts.every((h) => selectedIds?.includes(h.id))
                    }
                    onChange={toggleAll}
                    className="rounded border-border cursor-pointer"
                  />
                </th>
              )}
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-4 py-3 text-left text-xs font-emphasis uppercase tracking-wider text-muted-foreground"
                  style={{ width: header.getSize() }}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-border hover:bg-accent/50 transition-colors"
            >
              {selectable && (
                <td className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Select host ${row.original.ip}`}
                    checked={selectedIds?.includes(row.original.id) ?? false}
                    onChange={() => toggleId(row.original.id)}
                    className="rounded border-border cursor-pointer"
                  />
                </td>
              )}
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </TooltipProvider>
  );
}
