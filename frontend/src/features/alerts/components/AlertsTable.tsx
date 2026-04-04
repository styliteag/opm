import { Link } from "@tanstack/react-router";
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
  type SortingState,
  flexRender,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  MoreHorizontal,
  Eye,
  XCircle,
  CheckCircle,
  Trash2,
} from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SeverityBadge } from "@/components/data-display/SeverityBadge";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import type { Alert, ResolutionStatus } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

interface AlertsTableProps {
  alerts: Alert[];
  onDismiss?: (alert: Alert) => void;
  onReopen?: (alertId: number) => void;
  onAccept?: (alertIds: number[]) => void;
  onDelete?: (alertId: number) => void;
  selectedIds: number[];
  onSelectChange: (ids: number[]) => void;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
}

const sourceBadgeColors: Record<string, string> = {
  port: "bg-blue-500/10 text-blue-500",
  ssh: "bg-amber-500/10 text-amber-500",
  nse: "bg-purple-500/10 text-purple-500",
};

const resolutionVariant: Record<
  ResolutionStatus,
  "neutral" | "warning" | "success" | "danger"
> = {
  open: "neutral",
  in_progress: "warning",
  resolved: "success",
  fix_planned: "danger",
};

const resolutionLabel: Record<ResolutionStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  fix_planned: "Fix Planned",
};

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

function createColumns(props: {
  onDismiss?: (alert: Alert) => void;
  onReopen?: (alertId: number) => void;
  onAccept?: (alertIds: number[]) => void;
  onDelete?: (alertId: number) => void;
}): ColumnDef<Alert>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all alerts"
          checked={table.getIsAllRowsSelected()}
          onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Select alert: ${row.original.message}`}
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
        />
      ),
      size: 40,
    },
    {
      accessorKey: "severity",
      header: ({ column }) => (
        <SortableHeader label="Severity" column={column} />
      ),
      cell: ({ getValue }) => (
        <SeverityBadge severity={getValue<Alert["severity"]>()} />
      ),
      size: 90,
    },
    {
      accessorKey: "message",
      header: ({ column }) => <SortableHeader label="Alert" column={column} />,
      cell: ({ row }) => {
        const src = row.original.source ?? "port";
        return (
          <Link
            to="/alerts/$alertId"
            params={{ alertId: String(row.original.id) }}
            className="group/link flex items-center gap-2 min-w-0"
          >
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-strong uppercase shrink-0 ${sourceBadgeColors[src] ?? sourceBadgeColors.port}`}
            >
              {src}
            </span>
            <span className="truncate text-sm text-foreground group-hover/link:text-primary transition-colors">
              {row.original.message}
            </span>
          </Link>
        );
      },
    },
    {
      id: "ip",
      accessorKey: "ip",
      header: ({ column }) => <SortableHeader label="Target" column={column} />,
      cell: ({ row }) => {
        const { ip, hostname } = row.original;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-mono text-foreground">{ip}</span>
            {hostname && (
              <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                {hostname}
              </span>
            )}
          </div>
        );
      },
      size: 160,
    },
    {
      accessorKey: "port",
      header: ({ column }) => <SortableHeader label="Port" column={column} />,
      cell: ({ getValue }) => {
        const port = getValue<number | null>();
        return (
          <span className="text-sm font-mono text-foreground">
            {port ?? "-"}
          </span>
        );
      },
      size: 80,
    },
    {
      accessorKey: "network_name",
      header: ({ column }) => (
        <SortableHeader label="Network" column={column} />
      ),
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground">
          {getValue<string | null>() ?? "-"}
        </span>
      ),
      size: 140,
    },
    {
      accessorKey: "resolution_status",
      header: ({ column }) => <SortableHeader label="Status" column={column} />,
      cell: ({ row }) => {
        const status = row.original.resolution_status;
        const assignee = row.original.assigned_to_email;
        return (
          <div className="flex flex-col gap-1">
            <StatusBadge
              label={resolutionLabel[status]}
              variant={resolutionVariant[status]}
              dot
            />
            {assignee && (
              <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
                {assignee.split("@")[0]}
              </span>
            )}
          </div>
        );
      },
      size: 130,
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => (
        <SortableHeader label="Detected" column={column} />
      ),
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatRelativeTime(getValue<string>())}
        </span>
      ),
      size: 110,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const alert = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              aria-label="Alert actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom">
              <DropdownMenuItem asChild>
                <Link
                  to="/alerts/$alertId"
                  params={{ alertId: String(alert.id) }}
                >
                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                  View Details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {alert.dismissed ? (
                <DropdownMenuItem onClick={() => props.onReopen?.(alert.id)}>
                  <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                  Reopen
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => props.onDismiss?.(alert)}>
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  Dismiss
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => props.onAccept?.([alert.id])}>
                <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                Accept (create rule)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  if (confirm("Delete this alert permanently?")) {
                    props.onDelete?.(alert.id);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      size: 50,
    },
  ];
}

export function AlertsTable({
  alerts,
  onDismiss,
  onReopen,
  onAccept,
  onDelete,
  selectedIds,
  onSelectChange,
  sorting,
  onSortingChange,
}: AlertsTableProps) {
  const columns = createColumns({
    onDismiss,
    onReopen,
    onAccept,
    onDelete,
  });

  const rowSelection = Object.fromEntries(
    alerts.map((a, i) => [i, selectedIds.includes(a.id)]),
  );

  const table = useReactTable({
    data: alerts,
    columns,
    state: { sorting, rowSelection },
    manualSorting: true,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    onRowSelectionChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(rowSelection) : updater;
      const ids = Object.entries(next)
        .filter(([, selected]) => selected)
        .map(([idx]) => alerts[Number(idx)].id);
      onSelectChange(ids);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-lg border border-border">
      <Table className="table-fixed">
        <colgroup>
          {table.getAllColumns().map((col) => (
            <col
              key={col.id}
              style={col.columnDef.size ? { width: col.getSize() } : undefined}
            />
          ))}
        </colgroup>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() && "selected"}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={
                    cell.column.id === "message"
                      ? "overflow-hidden max-w-0"
                      : undefined
                  }
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
