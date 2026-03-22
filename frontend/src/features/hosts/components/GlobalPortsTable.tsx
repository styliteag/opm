import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
  flexRender,
} from '@tanstack/react-table'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { GlobalPort } from '@/features/hosts/hooks/useGlobalPorts'
import { formatRelativeTime } from '@/lib/utils'

const columns: ColumnDef<GlobalPort>[] = [
  {
    accessorKey: 'ip',
    header: 'IP Address',
    cell: ({ getValue }) => (
      <span className="font-mono text-sm text-primary">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'port',
    header: 'Port',
    cell: ({ row, getValue }) => (
      <span className="font-mono text-sm text-foreground">
        {getValue<number>()}
        {row.original.is_stale && (
          <span className="ml-2 inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Stale
          </span>
        )}
      </span>
    ),
    size: 120,
  },
  {
    accessorKey: 'protocol',
    header: 'Protocol',
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground uppercase">{getValue<string>()}</span>
    ),
    size: 80,
  },
  {
    accessorKey: 'service_guess',
    header: 'Service',
    cell: ({ getValue }) => (
      <span className="text-sm text-foreground">{getValue<string | null>() ?? '-'}</span>
    ),
  },
  {
    accessorKey: 'banner',
    header: 'Banner',
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground truncate max-w-xs block">
        {getValue<string | null>() ?? '-'}
      </span>
    ),
  },
  {
    accessorKey: 'last_seen_at',
    header: 'Last Seen',
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">
        {formatRelativeTime(getValue<string>())}
      </span>
    ),
    size: 120,
  },
]

interface GlobalPortsTableProps {
  ports: GlobalPort[]
}

export function GlobalPortsTable({ ports }: GlobalPortsTableProps) {
  const table = useReactTable({
    data: ports,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead key={header.id} style={{ width: header.getSize() }}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                No open ports found.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className={row.original.is_stale ? 'opacity-50' : ''}>
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
  )
}
