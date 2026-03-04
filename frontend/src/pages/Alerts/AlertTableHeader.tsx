import type { SortColumn, SortDirection } from './useAlerts'

type Props = {
  isAdmin: boolean
  sortColumn: SortColumn
  sortDirection: SortDirection
  onSort: (column: SortColumn) => void
  allUnackSelected: boolean
  onSelectAll: (checked: boolean) => void
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return null
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d={direction === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
      />
    </svg>
  )
}

const columns: { key: SortColumn; label: string }[] = [
  { key: 'severity', label: 'Severity' },
  { key: 'ip', label: 'IP / Hostname' },
  { key: 'port', label: 'Port' },
  { key: 'network', label: 'Network' },
  { key: 'time', label: 'Time' },
]

export default function AlertTableHeader({
  isAdmin, sortColumn, sortDirection, onSort, allUnackSelected, onSelectAll,
}: Props) {
  return (
    <thead>
      <tr className="border-b border-slate-200/70 bg-slate-50/80 text-left text-xs font-semibold text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300">
        {isAdmin && (
          <th className="w-10 px-4 py-3">
            <input
              type="checkbox"
              checked={allUnackSelected}
              onChange={(e) => onSelectAll(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
              title="Select all unacknowledged"
            />
          </th>
        )}
        <th className="w-10 px-2 py-3"></th>
        {columns.map((col) => (
          <th
            key={col.key}
            className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            onClick={() => onSort(col.key)}
          >
            <div className="flex items-center gap-2">
              {col.label}
              <SortIcon active={sortColumn === col.key} direction={sortDirection} />
            </div>
          </th>
        ))}
        <th className="px-4 py-3">Last Comment</th>
        <th className="px-4 py-3">Assigned To</th>
        <th className="px-4 py-3 text-right">Actions</th>
      </tr>
    </thead>
  )
}
