import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type ColumnDef,
  type SortingState,
  flexRender,
} from "@tanstack/react-table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Trash2,
  Power,
  PowerOff,
} from "lucide-react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { InlineTextCell } from "@/components/ui/inline-text-cell";
import { cn } from "@/lib/utils";
import { patchApi } from "@/lib/api";
import { getAlertTypeLabel } from "@/lib/alert-types";
import type { PortRule } from "../types";
import { SourceBadge } from "./SourceBadge";

interface AlertRulesTableProps {
  rules: PortRule[];
  search: string;
  selectedIds: Set<number>;
  onSelectedIdsChange: (ids: Set<number>) => void;
  onDelete: (rule: PortRule) => void;
  isDeleting: boolean;
}

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

function scopeFor(rule: PortRule): "global" | "network" {
  return rule.network_id === null ? "global" : "network";
}

export function AlertRulesTable({
  rules,
  search,
  selectedIds,
  onSelectedIdsChange,
  onDelete,
  isDeleting,
}: AlertRulesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const qc = useQueryClient();

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["policy", "rules"] });

  const updateRule = useMutation({
    mutationFn: ({
      rule,
      patch,
    }: {
      rule: PortRule;
      patch: Record<string, unknown>;
    }) => patchApi(`/api/port-rules/${scopeFor(rule)}/${rule.id}`, patch),
    onSuccess: () => {
      invalidate();
      toast.success("Rule updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const columns = useMemo<ColumnDef<PortRule>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => {
          const allIds = table.getRowModel().rows.map((r) => r.original.id);
          const allSelected =
            allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
          const someSelected = allIds.some((id) => selectedIds.has(id));
          return (
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected && !allSelected}
              onCheckedChange={(v) => {
                if (v) {
                  onSelectedIdsChange(new Set(allIds));
                } else {
                  onSelectedIdsChange(new Set());
                }
              }}
            />
          );
        },
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has(row.original.id)}
            onCheckedChange={(v) => {
              const next = new Set(selectedIds);
              if (v) next.add(row.original.id);
              else next.delete(row.original.id);
              onSelectedIdsChange(next);
            }}
          />
        ),
        size: 40,
        enableSorting: false,
      },
      {
        accessorKey: "source",
        header: ({ column }) => (
          <SortableHeader label="Source" column={column} />
        ),
        cell: ({ row }) => <SourceBadge source={row.original.source} />,
        size: 80,
      },
      {
        id: "scope",
        accessorFn: (row) => row.network_name ?? "Global",
        header: ({ column }) => (
          <SortableHeader label="Scope" column={column} />
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.network_name ?? "Global"}
          </span>
        ),
        size: 140,
      },
      {
        id: "target",
        accessorFn: (row) => `${row.ip ? `${row.ip}:` : ""}${row.port || "*"}`,
        header: ({ column }) => (
          <SortableHeader label="Target" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm text-foreground">
            {row.original.ip ? `${row.original.ip}:` : ""}
            {row.original.port || "*"}
          </span>
        ),
        size: 160,
      },
      {
        id: "alert_info",
        accessorFn: (row) => {
          const parts: string[] = [];
          if (row.alert_type) parts.push(getAlertTypeLabel(row.alert_type));
          if (row.script_name) parts.push(row.script_name);
          return parts.join(" ");
        },
        header: ({ column }) => (
          <SortableHeader label="Alert Type" column={column} />
        ),
        cell: ({ row }) => {
          const parts: string[] = [];
          if (row.original.alert_type)
            parts.push(getAlertTypeLabel(row.original.alert_type));
          if (row.original.script_name) parts.push(row.original.script_name);
          if (parts.length === 0) return null;
          return (
            <span className="text-xs text-muted-foreground">
              {parts.join(" / ")}
            </span>
          );
        },
        size: 180,
      },
      {
        accessorKey: "rule_type",
        header: ({ column }) => <SortableHeader label="Type" column={column} />,
        cell: ({ row }) => (
          <Select
            value={row.original.rule_type}
            onChange={(e) =>
              updateRule.mutate({
                rule: row.original,
                patch: { rule_type: e.target.value },
              })
            }
            className="h-7 text-xs w-[100px]"
          >
            <option value="accepted">Accepted</option>
            <option value="critical">Critical</option>
          </Select>
        ),
        size: 120,
      },
      {
        accessorKey: "description",
        header: ({ column }) => (
          <SortableHeader label="Description" column={column} />
        ),
        cell: ({ row }) => (
          <InlineTextCell
            value={row.original.description}
            placeholder="Add description..."
            onSave={(v) =>
              updateRule.mutate({
                rule: row.original,
                patch: { description: v || null },
              })
            }
            isPending={updateRule.isPending}
          />
        ),
        size: 240,
      },
      {
        accessorKey: "enabled",
        header: ({ column }) => (
          <SortableHeader label="Enabled" column={column} />
        ),
        cell: ({ row }) => {
          const enabled = row.original.enabled;
          return (
            <button
              onClick={() =>
                updateRule.mutate({
                  rule: row.original,
                  patch: { enabled: !enabled },
                })
              }
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors cursor-pointer",
                enabled
                  ? "text-emerald-400 hover:bg-emerald-500/10"
                  : "text-muted-foreground hover:bg-muted",
              )}
              title={enabled ? "Disable rule" : "Enable rule"}
            >
              {enabled ? (
                <Power className="h-3 w-3" />
              ) : (
                <PowerOff className="h-3 w-3" />
              )}
              {enabled ? "On" : "Off"}
            </button>
          );
        },
        size: 80,
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <button
            onClick={() => onDelete(row.original)}
            disabled={isDeleting}
            className="rounded p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/row:opacity-100 transition-all disabled:opacity-50 cursor-pointer"
            title="Remove rule"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ),
        size: 40,
        enableSorting: false,
      },
    ],
    [selectedIds, onSelectedIdsChange, onDelete, isDeleting, updateRule],
  );

  const table = useReactTable({
    data: rules,
    columns,
    state: { sorting, globalFilter: search },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue: string) => {
      const q = filterValue.toLowerCase();
      const r = row.original;
      return (
        (r.source ?? "").toLowerCase().includes(q) ||
        (r.ip ?? "").toLowerCase().includes(q) ||
        (r.port ?? "").toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.network_name ?? "global").toLowerCase().includes(q) ||
        (r.rule_type ?? "").toLowerCase().includes(q) ||
        (r.alert_type ?? "").toLowerCase().includes(q) ||
        (r.script_name ?? "").toLowerCase().includes(q)
      );
    },
  });

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} style={{ width: header.getSize() }}>
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
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-center py-8 text-muted-foreground"
              >
                {search
                  ? "No rules match your search."
                  : "No rules configured."}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className={cn(
                  "group/row",
                  selectedIds.has(row.original.id) && "bg-primary/5",
                  !row.original.enabled && "opacity-50",
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
