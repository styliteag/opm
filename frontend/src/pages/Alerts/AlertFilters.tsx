import type { Network, User } from '../../types'
import type { CategoryFilter, Severity, StatusFilter } from './useAlerts'

type Props = {
  searchQuery: string
  onSearchChange: (value: string) => void
  statusFilter: StatusFilter
  onStatusChange: (value: StatusFilter) => void
  categoryFilter: CategoryFilter
  onCategoryChange: (value: CategoryFilter) => void
  severityFilter: Severity | ''
  onSeverityChange: (value: Severity | '') => void
  networkFilter: number | null
  onNetworkChange: (value: number | null) => void
  assignedUserFilter: number | 'all' | 'unassigned'
  onAssignedUserChange: (value: number | 'all' | 'unassigned') => void
  networks: Network[]
  users: User[]
}

export default function AlertFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  categoryFilter,
  onCategoryChange,
  severityFilter,
  onSeverityChange,
  networkFilter,
  onNetworkChange,
  assignedUserFilter,
  onAssignedUserChange,
  networks,
  users,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[240px]">
        <svg
          className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search IP, hostname, port, network, service, banner..."
          className="w-full rounded-2xl border border-slate-200/70 bg-white pl-10 pr-4 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
        className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value="all">All Status</option>
        <option value="critical_rule">Critical Rule</option>
        <option value="pending">Pending Review</option>
        <option value="accepted">Accepted</option>
        <option value="dismissed">Dismissed</option>
      </select>

      <select
        value={categoryFilter}
        onChange={(e) => onCategoryChange(e.target.value as CategoryFilter)}
        className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value="all">All Sources</option>
        <option value="ssh">SSH</option>
        <option value="port">Port</option>
      </select>

      <select
        value={severityFilter}
        onChange={(e) => onSeverityChange(e.target.value as Severity | '')}
        className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value="">All Severity</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="info">Info</option>
      </select>

      <select
        value={networkFilter ?? ''}
        onChange={(e) => onNetworkChange(e.target.value ? Number(e.target.value) : null)}
        className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value="">All Networks</option>
        {networks.map((network) => (
          <option key={network.id} value={network.id}>
            {network.name}
          </option>
        ))}
      </select>

      <select
        value={assignedUserFilter}
        onChange={(e) => {
          const val = e.target.value
          if (val === 'all' || val === 'unassigned') onAssignedUserChange(val)
          else onAssignedUserChange(Number(val))
        }}
        className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value="all">All Assignees</option>
        <option value="unassigned">Unassigned</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.email}
          </option>
        ))}
      </select>
    </div>
  )
}
