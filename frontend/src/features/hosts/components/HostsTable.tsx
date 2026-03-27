import { Link } from "@tanstack/react-router";
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
  flexRender,
} from "@tanstack/react-table";

import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import type { Host } from "@/lib/types";
import { formatRelativeTime, isOnline } from "@/lib/utils";

const columns: ColumnDef<Host>[] = [
  {
    accessorKey: "ip",
    header: "IP Address",
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
    header: "Hostname",
    cell: ({ getValue }) => (
      <span className="text-sm text-foreground">
        {getValue<string | null>() ?? "-"}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const recent = isOnline(row.original.last_seen_at, 24 * 60 * 60 * 1000);
      return (
        <StatusBadge
          label={recent ? "Online" : "Offline"}
          variant={recent ? "success" : "neutral"}
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
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {count ?? 0}
        </span>
      );
    },
    size: 100,
  },
  {
    accessorKey: "last_seen_at",
    header: "Last Seen",
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">
        {formatRelativeTime(getValue<string>())}
      </span>
    ),
    size: 120,
  },
];

interface HostsTableProps {
  hosts: Host[];
  selectedIds?: number[];
  onSelectChange?: (ids: number[]) => void;
}

export function HostsTable({
  hosts,
  selectedIds,
  onSelectChange,
}: HostsTableProps) {
  const selectable = Boolean(onSelectChange);
  const table = useReactTable({
    data: hosts,
    columns,
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
                  <Checkbox
                    aria-label="Select all hosts"
                    checked={
                      hosts.length > 0 &&
                      hosts.every((h) => selectedIds?.includes(h.id))
                    }
                    onCheckedChange={toggleAll}
                  />
                </th>
              )}
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
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
                  <Checkbox
                    aria-label={`Select host ${row.original.ip}`}
                    checked={selectedIds?.includes(row.original.id) ?? false}
                    onCheckedChange={() => toggleId(row.original.id)}
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
