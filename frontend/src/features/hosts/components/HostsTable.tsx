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

import { StatusBadge } from "@/components/data-display/StatusBadge";
import { InlineTextCell } from "@/components/ui/inline-text-cell";
import { patchApi } from "@/lib/api";
import type { Host } from "@/lib/types";
import { formatRelativeTime, parseUTC } from "@/lib/utils";

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
  return (
    <button
      onClick={column.getToggleSortingHandler()}
      className="flex items-center gap-1 text-xs cursor-pointer"
    >
      {label} <Icon className="h-3 w-3" />
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

  const columns: ColumnDef<Host>[] = [
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
      cell: ({ row }) => (
        <InlineTextCell
          value={row.original.hostname}
          onSave={(val) =>
            hostnameMutation.mutate({ hostId: row.original.id, hostname: val })
          }
          saveLabel="Save hostname"
          placeholder="-"
          isPending={hostnameMutation.isPending}
        />
      ),
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
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const diff = Date.now() - parseUTC(row.original.last_seen_at).getTime();
        const isRecent = diff < 24 * 60 * 60 * 1000;
        return (
          <StatusBadge
            label={isRecent ? "Online" : "Offline"}
            variant={isRecent ? "success" : "neutral"}
            dot
          />
        );
      },
      size: 100,
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
  ];

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
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border bg-card">
              {selectable && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={
                      hosts.length > 0 &&
                      hosts.every((h) => selectedIds?.includes(h.id))
                    }
                    onChange={toggleAll}
                    className="rounded border-border"
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
                    checked={selectedIds?.includes(row.original.id) ?? false}
                    onChange={() => toggleId(row.original.id)}
                    className="rounded border-border"
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
  );
}
