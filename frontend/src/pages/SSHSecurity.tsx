import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { fetchJson } from '../lib/api'
import type { SSHHostListResponse, SSHHostSummary } from '../types'

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

const SSHSecurity = () => {
  const { token } = useAuth()
  const now = new Date()
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')

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

  // Filter hosts based on selected card
  const filteredHosts = useMemo(() => {
    switch (activeFilter) {
      case 'insecure_auth':
        return metrics.hostsWithInsecureAuth
      case 'weak_ciphers':
        return metrics.hostsWithWeakCiphers
      case 'outdated_version':
        return metrics.hostsWithOutdatedVersion
      default:
        return hosts
    }
  }, [activeFilter, hosts, metrics])

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
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl text-slate-900 dark:text-white">
              {filterLabels[activeFilter]}
            </h3>
            <span className="rounded-full border border-slate-200/70 bg-slate-100/80 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700/70 dark:bg-slate-800/80 dark:text-slate-300">
              {filteredHosts.length} host{filteredHosts.length !== 1 ? 's' : ''}
            </span>
          </div>

          {hasError ? (
            <div className="mt-4 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
              Unable to load SSH hosts data.
            </div>
          ) : isLoading ? (
            <div className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-400">
              Loading SSH hosts...
            </div>
          ) : filteredHosts.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-400">
              {activeFilter === 'all'
                ? 'No SSH hosts discovered yet. Run a scan to discover SSH services.'
                : 'No hosts match this filter criteria.'}
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200/70 text-left text-xs font-semibold text-slate-500 dark:border-slate-800/70 dark:text-slate-400">
                    <th className="pb-3 pr-4">Host</th>
                    <th className="pb-3 pr-4">SSH Version</th>
                    <th className="pb-3 pr-4">Auth</th>
                    <th className="pb-3 pr-4">Crypto</th>
                    <th className="pb-3 pr-4">Network</th>
                    <th className="pb-3">Last Scanned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                  {filteredHosts.map((host) => (
                    <tr
                      key={`${host.host_ip}:${host.port}`}
                      className="text-sm transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
                    >
                      <td className="py-3 pr-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {host.host_ip}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Port {host.port}
                          </span>
                        </div>
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
