import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchJson } from '../lib/api'
import type { NetworkListResponse, SSHHostListResponse, SSHHostSummary } from '../types'

const parseUtcDate = (dateStr: string) => {
  return new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
}

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)

const formatRelativeTime = (value: Date, now: Date) => {
  const diffMs = now.getTime() - value.getTime()
  if (diffMs < 0) {
    return 'Just now'
  }
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) {
    return 'Just now'
  }
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// Parse SSH version string to extract major.minor version number
const parseSSHVersion = (versionStr: string | null): number | null => {
  if (!versionStr) return null
  // Common patterns: "OpenSSH_8.9p1", "SSH-2.0-OpenSSH_7.6p1", "dropbear_2022.82"
  const openSSHMatch = versionStr.match(/OpenSSH[_\s]?(\d+)\.(\d+)/i)
  if (openSSHMatch) {
    return parseFloat(`${openSSHMatch[1]}.${openSSHMatch[2]}`)
  }
  return null
}

const DEFAULT_MIN_SSH_VERSION = 8.0

type FilterType = 'all' | 'insecure_auth' | 'weak_ciphers' | 'outdated_version'
type SortKey = 'ip' | 'port' | 'ssh_version' | 'auth' | 'change' | 'last_scanned'
type SortDirection = 'asc' | 'desc'
type AuthFilterType = 'all' | 'secure' | 'insecure'

const SSHSecurity = () => {
  const { token } = useAuth()
  const navigate = useNavigate()
  const now = new Date()
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [networkFilter, setNetworkFilter] = useState<number | null>(null)
  const [authFilter, setAuthFilter] = useState<AuthFilterType>('all')
  const [sortKey, setSortKey] = useState<SortKey>('last_scanned')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // Fetch networks for filter dropdown
  const networksQuery = useQuery({
    queryKey: ['networks'],
    queryFn: () => fetchJson<NetworkListResponse>('/api/networks', token ?? ''),
    enabled: Boolean(token),
  })

  // Fetch all SSH hosts (up to 200 for summary statistics)
  const sshHostsQuery = useQuery({
    queryKey: ['ssh-hosts', 'all'],
    queryFn: () => fetchJson<SSHHostListResponse>('/api/ssh/hosts?limit=200', token ?? ''),
    enabled: Boolean(token),
  })

  const hosts = useMemo(
    () => sshHostsQuery.data?.hosts ?? [],
    [sshHostsQuery.data?.hosts]
  )
  const totalHosts = sshHostsQuery.data?.total ?? 0

  // Compute metrics from hosts data
  const metrics = useMemo(() => {
    const hostsWithInsecureAuth = hosts.filter(
      (h) => h.password_enabled || h.keyboard_interactive_enabled
    )
    const hostsWithWeakCiphers = hosts.filter((h) => h.has_weak_ciphers || h.has_weak_kex)
    const hostsWithOutdatedVersion = hosts.filter((h) => {
      const version = parseSSHVersion(h.ssh_version)
      return version !== null && version < DEFAULT_MIN_SSH_VERSION
    })

    return {
      totalHosts,
      insecureAuthCount: hostsWithInsecureAuth.length,
      weakCiphersCount: hostsWithWeakCiphers.length,
      outdatedVersionCount: hostsWithOutdatedVersion.length,
      hostsWithInsecureAuth,
      hostsWithWeakCiphers,
      hostsWithOutdatedVersion,
    }
  }, [hosts, totalHosts])

  // Filter hosts based on selected card, network, and auth status
  const filteredHosts = useMemo(() => {
    let result: SSHHostSummary[]

    // Apply card filter first
    switch (activeFilter) {
      case 'insecure_auth':
        result = metrics.hostsWithInsecureAuth
        break
      case 'weak_ciphers':
        result = metrics.hostsWithWeakCiphers
        break
      case 'outdated_version':
        result = metrics.hostsWithOutdatedVersion
        break
      default:
        result = hosts
    }

    // Apply network filter
    if (networkFilter !== null) {
      result = result.filter((h) => h.network_id === networkFilter)
    }

    // Apply auth method filter
    if (authFilter === 'secure') {
      result = result.filter(
        (h) => h.publickey_enabled && !h.password_enabled && !h.keyboard_interactive_enabled
      )
    } else if (authFilter === 'insecure') {
      result = result.filter((h) => h.password_enabled || h.keyboard_interactive_enabled)
    }

    return result
  }, [activeFilter, hosts, metrics, networkFilter, authFilter])

  // Sort filtered hosts
  const sortedHosts = useMemo(() => {
    const sorted = [...filteredHosts]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'ip':
          cmp = a.host_ip.localeCompare(b.host_ip)
          break
        case 'port':
          cmp = a.port - b.port
          break
        case 'ssh_version':
          cmp = (a.ssh_version ?? '').localeCompare(b.ssh_version ?? '')
          break
        case 'auth': {
          const aInsecure = a.password_enabled || a.keyboard_interactive_enabled ? 1 : 0
          const bInsecure = b.password_enabled || b.keyboard_interactive_enabled ? 1 : 0
          cmp = bInsecure - aInsecure // Insecure first by default
          break
        }
        case 'change': {
          // Sort order: degraded (highest priority) > improved > unchanged > new (null)
          const changeOrder = (status: string | null) => {
            if (status === 'degraded') return 3
            if (status === 'improved') return 2
            if (status === 'unchanged') return 1
            return 0 // null (new)
          }
          cmp = changeOrder(a.change_status) - changeOrder(b.change_status)
          break
        }
        case 'last_scanned':
          cmp = new Date(a.last_scanned).getTime() - new Date(b.last_scanned).getTime()
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredHosts, sortKey, sortDirection])

  const summaryCards = [
    {
      id: 'all' as FilterType,
      label: 'Total SSH Hosts',
      value: metrics.totalHosts,
      detail: 'Discovered SSH services',
      accent: 'text-cyan-600 dark:text-cyan-200',
      borderAccent: 'border-cyan-500',
      bgAccent: 'bg-cyan-500/10',
    },
    {
      id: 'insecure_auth' as FilterType,
      label: 'Insecure Auth',
      value: metrics.insecureAuthCount,
      detail: 'Password or keyboard-interactive enabled',
      accent: 'text-rose-600 dark:text-rose-200',
      borderAccent: 'border-rose-500',
      bgAccent: 'bg-rose-500/10',
    },
    {
      id: 'weak_ciphers' as FilterType,
      label: 'Weak Ciphers',
      value: metrics.weakCiphersCount,
      detail: 'Weak ciphers or KEX algorithms',
      accent: 'text-amber-600 dark:text-amber-200',
      borderAccent: 'border-amber-500',
      bgAccent: 'bg-amber-500/10',
    },
    {
      id: 'outdated_version' as FilterType,
      label: 'Outdated Version',
      value: metrics.outdatedVersionCount,
      detail: `SSH version < ${DEFAULT_MIN_SSH_VERSION}`,
      accent: 'text-orange-600 dark:text-orange-200',
      borderAccent: 'border-orange-500',
      bgAccent: 'bg-orange-500/10',
    },
  ]

  const filterLabels: Record<FilterType, string> = {
    all: 'All SSH Hosts',
    insecure_auth: 'Hosts with Insecure Authentication',
    weak_ciphers: 'Hosts with Weak Ciphers',
    outdated_version: 'Hosts with Outdated SSH Version',
  }

  const isLoading = sshHostsQuery.isLoading
  const hasError = sshHostsQuery.isError

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const renderSortHeader = (label: string, key: SortKey) => (
    <button
      type="button"
      onClick={() => handleSort(key)}
      className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
    >
      {label}
      {sortKey === key && (
        <span className="text-cyan-500">{sortDirection === 'asc' ? '↑' : '↓'}</span>
      )}
    </button>
  )

  const handleRowClick = (host: SSHHostSummary) => {
    // Navigate to hosts page with IP filter
    navigate(`/hosts?ip=${encodeURIComponent(host.host_ip)}`)
  }

  const getAuthMethodBadge = (host: SSHHostSummary) => {
    if (host.password_enabled || host.keyboard_interactive_enabled) {
      return (
        <span className="inline-flex items-center rounded-full border border-rose-400/40 bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:text-rose-200">
          Insecure
        </span>
      )
    }
    if (host.publickey_enabled) {
      return (
        <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
          Key Only
        </span>
      )
    }
    return (
      <span className="inline-flex items-center rounded-full border border-slate-400/40 bg-slate-500/15 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
        Unknown
      </span>
    )
  }

  const getWeaknessBadge = (host: SSHHostSummary) => {
    const hasWeakness = host.has_weak_ciphers || host.has_weak_kex
    if (hasWeakness) {
      return (
        <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-200">
          Weak Crypto
        </span>
      )
    }
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
        Secure
      </span>
    )
  }

  const getVersionBadge = (host: SSHHostSummary) => {
    const version = parseSSHVersion(host.ssh_version)
    const isOutdated = version !== null && version < DEFAULT_MIN_SSH_VERSION
    if (isOutdated) {
      return (
        <span className="inline-flex items-center rounded-full border border-orange-400/40 bg-orange-500/15 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:text-orange-200">
          Outdated
        </span>
      )
    }
    if (version !== null) {
      return (
        <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
          Current
        </span>
      )
    }
    return null
  }

  const getChangeBadge = (host: SSHHostSummary) => {
    if (!host.change_status) {
      // No prior scan data
      return (
        <span className="inline-flex items-center rounded-full border border-slate-300/40 bg-slate-100/50 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:border-slate-600/40 dark:bg-slate-800/50 dark:text-slate-400">
          New
        </span>
      )
    }

    if (host.change_status === 'unchanged') {
      return (
        <span className="inline-flex items-center rounded-full border border-slate-300/40 bg-slate-100/50 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:border-slate-600/40 dark:bg-slate-800/50 dark:text-slate-400">
          —
        </span>
      )
    }

    if (host.change_status === 'improved') {
      return (
        <span
          className="group relative inline-flex cursor-help items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-200"
          title={host.changes.map((c) => c.description).join('\n')}
        >
          <svg
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 10l7-7m0 0l7 7m-7-7v18"
            />
          </svg>
          Improved
        </span>
      )
    }

    // degraded
    return (
      <span
        className="group relative inline-flex cursor-help items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:text-rose-200"
        title={host.changes.map((c) => c.description).join('\n')}
      >
        <svg
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
        Degraded
      </span>
    )
  }

  const getChangeTooltipContent = (host: SSHHostSummary) => {
    if (!host.change_status || host.change_status === 'unchanged' || host.changes.length === 0) {
      return null
    }
    return (
      <div className="absolute bottom-full left-1/2 z-50 mb-2 hidden w-64 -translate-x-1/2 rounded-lg border border-slate-200/70 bg-white p-3 text-left text-xs shadow-lg group-hover:block dark:border-slate-700/70 dark:bg-slate-900">
        <p className="mb-2 font-semibold text-slate-700 dark:text-slate-200">
          Changes since last scan:
        </p>
        <ul className="space-y-1">
          {host.changes.map((change, idx) => (
            <li
              key={idx}
              className={`flex items-start gap-2 ${
                change.is_regression
                  ? 'text-rose-600 dark:text-rose-300'
                  : 'text-emerald-600 dark:text-emerald-300'
              }`}
            >
              <span className="mt-0.5">
                {change.is_regression ? (
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                ) : (
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                )}
              </span>
              <span>{change.description}</span>
            </li>
          ))}
        </ul>
        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-8 border-transparent border-t-white dark:border-t-slate-900" />
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Background decorations */}
      <div className="pointer-events-none absolute -left-24 top-12 h-72 w-72 animate-drift rounded-full bg-cyan-500/20 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 top-40 h-72 w-72 animate-drift rounded-full bg-rose-500/15 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 animate-drift rounded-full bg-amber-500/10 blur-[160px]" />

      <section className="relative z-10 space-y-8">
        {/* Header section */}
        <div className="animate-rise rounded-3xl border border-slate-200/60 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/60 dark:bg-slate-950/70">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Security Analysis
              </p>
              <h2 className="mt-3 font-display text-3xl text-slate-900 dark:text-white">
                SSH Security Dashboard
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Monitor SSH configurations across your infrastructure. Identify hosts with insecure
                authentication methods, weak ciphers, or outdated versions.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-xs text-slate-500 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-300">
              {isLoading ? 'Loading SSH data...' : `Updated ${formatDateTime(now)}`}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card, index) => (
              <button
                key={card.id}
                type="button"
                onClick={() => setActiveFilter(card.id)}
                style={{ animationDelay: `${index * 0.08}s` }}
                className={`group animate-rise rounded-2xl border p-5 text-left shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg ${
                  activeFilter === card.id
                    ? `${card.borderAccent} ${card.bgAccent} dark:border-opacity-60`
                    : 'border-slate-200/70 bg-white/80 dark:border-slate-800/70 dark:bg-slate-900/70'
                }`}
              >
                <p className="text-xs text-slate-500 dark:text-slate-400">{card.label}</p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className={`text-2xl font-semibold ${card.accent}`}>
                    {isLoading || hasError ? '—' : card.value}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{card.detail}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Filtered Hosts Table */}
        <div className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-display text-xl text-slate-900 dark:text-white">
              {filterLabels[activeFilter]}
            </h3>
            <span className="rounded-full border border-slate-200/70 bg-slate-100/80 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700/70 dark:bg-slate-800/80 dark:text-slate-300">
              {sortedHosts.length} host{sortedHosts.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Filter Controls */}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Network
              </label>
              <select
                value={networkFilter ?? ''}
                onChange={(e) => setNetworkFilter(e.target.value ? Number(e.target.value) : null)}
                className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">All Networks</option>
                {(networksQuery.data?.networks ?? []).map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Auth Status
              </label>
              <select
                value={authFilter}
                onChange={(e) => setAuthFilter(e.target.value as AuthFilterType)}
                className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="all">All Auth</option>
                <option value="secure">Secure (Key Only)</option>
                <option value="insecure">Insecure (Password/Kbd)</option>
              </select>
            </div>
          </div>

          {hasError ? (
            <div className="mt-4 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
              Unable to load SSH hosts data.
            </div>
          ) : isLoading ? (
            <div className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-400">
              Loading SSH hosts...
            </div>
          ) : sortedHosts.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-400">
              {activeFilter === 'all' && networkFilter === null && authFilter === 'all'
                ? 'No SSH hosts discovered yet. Run a scan to discover SSH services.'
                : 'No hosts match the current filter criteria.'}
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200/70 text-left dark:border-slate-800/70">
                    <th className="pb-3 pr-4">{renderSortHeader('IP', 'ip')}</th>
                    <th className="pb-3 pr-4">{renderSortHeader('Port', 'port')}</th>
                    <th className="pb-3 pr-4">{renderSortHeader('SSH Version', 'ssh_version')}</th>
                    <th className="pb-3 pr-4">{renderSortHeader('Auth', 'auth')}</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Crypto
                    </th>
                    <th className="pb-3 pr-4">{renderSortHeader('Change', 'change')}</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Network
                    </th>
                    <th className="pb-3">{renderSortHeader('Last Scanned', 'last_scanned')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                  {sortedHosts.map((host) => (
                    <tr
                      key={`${host.host_ip}:${host.port}`}
                      onClick={() => handleRowClick(host)}
                      className="cursor-pointer text-sm transition-colors hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10"
                    >
                      <td className="py-3 pr-4">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {host.host_ip}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-slate-600 dark:text-slate-300">{host.port}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-700 dark:text-slate-200">
                            {host.ssh_version ?? 'Unknown'}
                          </span>
                          {getVersionBadge(host)}
                        </div>
                      </td>
                      <td className="py-3 pr-4">{getAuthMethodBadge(host)}</td>
                      <td className="py-3 pr-4">{getWeaknessBadge(host)}</td>
                      <td className="py-3 pr-4">
                        <div className="group relative inline-block">
                          {getChangeBadge(host)}
                          {getChangeTooltipContent(host)}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-slate-600 dark:text-slate-300">
                          {host.network_name ?? 'Unknown'}
                        </span>
                      </td>
                      <td className="py-3">
                        <span
                          className="text-slate-500 dark:text-slate-400"
                          title={formatDateTime(parseUtcDate(host.last_scanned))}
                        >
                          {formatRelativeTime(parseUtcDate(host.last_scanned), now)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default SSHSecurity
