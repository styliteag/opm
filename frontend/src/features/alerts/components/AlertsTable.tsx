import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  flexRender,
} from '@tanstack/react-table'
import { ArrowUpDown, MoreHorizontal } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SeverityBadge } from '@/components/data-display/SeverityBadge'
import type { Alert } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'

interface AlertsTableProps {
  alerts: Alert[]
  onDismiss?: (alert: Alert) => void
  onReopen?: (alertId: number) => void
  selectedIds: number[]
  onSelectChange: (ids: number[]) => void
}

const columns: ColumnDef<Alert>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllRowsSelected()}
        onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
      />
    ),
    size: 40,
  },
  {
    accessorKey: 'severity',
    header: 'Severity',
    cell: ({ getValue }) => (
      <SeverityBadge severity={getValue<Alert['severity']>()} />
    ),
    size: 100,
  },
  {
    accessorKey: 'message',
    header: 'Alert Name',
    cell: ({ row }) => {
      const src = row.original.source ?? 'port'
      const badgeColors: Record<string, string> = {
        port: 'bg-blue-500/10 text-blue-500',
        ssh: 'bg-amber-500/10 text-amber-500',
        nse: 'bg-purple-500/10 text-purple-500',
      }
      return (
        <Link
          to="/alerts/$alertId"
          params={{ alertId: String(row.original.id) }}
          className="inline-flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
        >
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase shrink-0 ${badgeColors[src] ?? badgeColors.port}`}>
            {src}
          </span>
          {row.original.message}
        </Link>
      )
    },
  },
  {
    id: 'target',
    header: 'Target',
    cell: ({ row }) => (
      <span className="text-sm font-mono text-muted-foreground">
        {row.original.ip}
        {row.original.port ? `:${row.original.port}` : ''}
      </span>
    ),
    size: 160,
  },
  {
    accessorKey: 'network_name',
    header: 'Network',
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">
        {getValue<string | null>() ?? '-'}
      </span>
    ),
    size: 160,
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <button
        onClick={column.getToggleSortingHandler()}
        className="flex items-center gap-1 text-xs"
      >
        Detected <ArrowUpDown className="h-3 w-3" />
      </button>
    ),
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">
        {formatRelativeTime(getValue<string>())}
      </span>
    ),
    size: 120,
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: () => (
      <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors">
        <MoreHorizontal className="h-4 w-4" />
      </button>
    ),
    size: 60,
  },
]

export function AlertsTable({
  alerts,
  selectedIds,
  onSelectChange,
}: AlertsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ])

  const rowSelection = Object.fromEntries(
    alerts.map((a, i) => [i, selectedIds.includes(a.id)]),
  )

  const table = useReactTable({
    data: alerts,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater
      const ids = Object.entries(next)
        .filter(([, selected]) => selected)
        .map(([idx]) => alerts[Number(idx)].id)
      onSelectChange(ids)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead
                  key={header.id}
                  style={{ width: header.getSize() }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
