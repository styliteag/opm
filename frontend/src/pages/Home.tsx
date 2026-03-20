import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchJson, API_BASE_URL } from '../lib/api'
import type {
  AlertListResponse,
  LatestScansByNetworkResponse,
  NetworkListResponse,
  ScannerListResponse,
} from '../types'
import { getAlertLabelCompact, getAlertStyleCompact } from '../constants/alerts'
import { parseUtcDate, formatDateTime, formatRelativeTime } from '../lib/formatters'

const Home = () => {
  const { token } = useAuth()
  const now = new Date()

  const backendVersionQuery = useQuery({
    queryKey: ['version', 'backend'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/version`)
      if (!response.ok) {
        throw new Error('Failed to fetch backend version')
      }
      const data: { version: string; component: string } = await response.json()
      return data.version
    },
    retry: 1,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })

  const frontendVersion = import.meta.env.VITE_APP_VERSION || 'unknown'
  const backendVersion = backendVersionQuery.data ?? 'unknown'

  const networksQuery = useQuery({
    queryKey: ['networks'],
    queryFn: () => fetchJson<NetworkListResponse>('/api/networks', token ?? ''),
    enabled: Boolean(token),
  })

  const scannersQuery = useQuery({
    queryKey: ['scanners'],
    queryFn: () => fetchJson<ScannerListResponse>('/api/scanners', token ?? ''),
    enabled: Boolean(token),
  })

  const recentAlertsQuery = useQuery({
    queryKey: ['alerts', 'recent'],
    queryFn: () => fetchJson<AlertListResponse>('/api/alerts?limit=10', token ?? ''),
    enabled: Boolean(token),
  })

  const activeAlertsQuery = useQuery({
    queryKey: ['alerts', 'active-count'],
    queryFn: () =>
      fetchJson<AlertListResponse>('/api/alerts?dismissed=false&limit=200', token ?? ''),
    enabled: Boolean(token),
  })

  const latestScansQuery = useQuery({
    queryKey: ['scans', 'latest-by-network'],
    queryFn: () =>
      fetchJson<LatestScansByNetworkResponse>('/api/scans/latest-by-network', token ?? ''),
    enabled: Boolean(token),
  })

  const latestScanDate = useMemo(() => {
    const latestScans = latestScansQuery.data?.latest_scans ?? []
    let latest: Date | null = null
    for (const { scan } of latestScans) {
      if (!scan) {
        continue
      }
      const candidate = parseUtcDate(scan.completed_at ?? scan.started_at ?? '')
      if (Number.isNaN(candidate.getTime())) {
        continue
      }
      if (!latest || candidate > latest) {
        latest = candidate
      }
    }
    return latest
  }, [latestScansQuery.data])

  const totalNetworks = networksQuery.data?.networks.length ?? 0
  const totalScanners = scannersQuery.data?.scanners.length ?? 0
  const activeAlertsCount = activeAlertsQuery.data?.alerts.length ?? 0
  const activeAlertsLabel = activeAlertsCount === 200 ? '200+' : `${activeAlertsCount}`

  const recentAlerts = recentAlertsQuery.data?.alerts ?? []
  const scanners = scannersQuery.data?.scanners ?? []

  const latestScanLabel = latestScanDate ? formatRelativeTime(latestScanDate, now) : 'No scans yet'
  const latestScanDetail = latestScanDate
    ? formatDateTime(latestScanDate)
    : 'Awaiting the first scan'

  const summaryCards = [
    {
      label: 'Networks',
      value: `${totalNetworks}`,
      detail: 'Total monitored ranges',
      accent: 'text-cyan-600 dark:text-cyan-200',
    },
    {
      label: 'Scanners',
      value: `${totalScanners}`,
      detail: 'Scanner locations',
      accent: 'text-emerald-600 dark:text-emerald-200',
    },
    {
      label: 'Active alerts',
      value: activeAlertsLabel,
      detail: 'Pending alerts',
      accent: 'text-amber-600 dark:text-amber-200',
    },
    {
      label: 'Last scan',
      value: latestScanLabel,
      detail: latestScanDetail,
      accent: 'text-sky-600 dark:text-sky-200',
    },
  ]

  const quickLinks = [
    {
      title: 'Networks',
      description: 'Review monitored ranges and schedules.',
      to: '/networks',
    },
    {
      title: 'Hosts & Ports',
      description: 'Inspect hosts and open services.',
      to: '/hosts',
    },
    {
      title: 'Alerts',
      description: 'Investigate and acknowledge issues.',
      to: '/alerts',
    },
    {
      title: 'Trends',
      description: 'Track port and alert trends over time.',
      to: '/trends',
    },
  ]

  const isLoading =
    networksQuery.isLoading ||
    scannersQuery.isLoading ||
    recentAlertsQuery.isLoading ||
    activeAlertsQuery.isLoading ||
    latestScansQuery.isLoading

  const hasError =
    networksQuery.isError ||
    scannersQuery.isError ||
    recentAlertsQuery.isError ||
    activeAlertsQuery.isError ||
    latestScansQuery.isError

  const showPlaceholder = isLoading || hasError

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -left-24 top-12 h-72 w-72 rounded-full bg-cyan-500/20 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 top-40 h-72 w-72 rounded-full bg-emerald-500/20 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-sky-500/10 blur-[160px]" />

      <section className="relative z-10 space-y-8">
        <div className="animate-rise rounded-3xl border border-slate-200/60 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/60 dark:bg-slate-950/70">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Dashboard overview
              </p>
              <h2 className="mt-3 font-display text-3xl text-slate-900 dark:text-white">
                Network security at a glance
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Monitor coverage, scanner health, and the latest alerts in one glance. Drill into
                scans and open ports with the quick links.
              </p>
            </div>
            <div
              className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-xs text-slate-500 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-300"
              title={`Frontend v${frontendVersion} | Backend v${backendVersion}`}
            >
              {isLoading ? 'Syncing latest telemetry...' : `Updated ${formatDateTime(now)}`}
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card, index) => (
              <div
                key={card.label}
                style={{ animationDelay: `${index * 0.08}s` }}
                className="group animate-rise rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm transition duration-300 hover:shadow-lg hover:border-slate-300 dark:border-slate-800/70 dark:bg-slate-900/70 dark:hover:border-slate-700"
              >
                <p className="text-xs text-slate-500 dark:text-slate-400">{card.label}</p>
                <div className="mt-3 flex items-baseline gap-2">
                  {showPlaceholder ? (
                    <div className="h-7 w-16 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
                  ) : (
                    <span className={`text-2xl font-semibold ${card.accent}`}>{card.value}</span>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{card.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {quickLinks.map((link, index) => (
              <Link
                key={link.title}
                to={link.to}
                style={{ animationDelay: `${0.2 + index * 0.08}s` }}
                className="group animate-rise cursor-pointer rounded-2xl border border-slate-200/70 bg-white/70 p-5 text-left shadow-sm transition duration-300 hover:border-slate-300 hover:bg-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 dark:border-slate-800/70 dark:bg-slate-950/60 dark:hover:border-slate-700"
              >
                <h3 className="font-display text-lg text-slate-900 dark:text-white">
                  {link.title}
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {link.description}
                </p>
                <span className="mt-3 inline-flex items-center text-xs font-semibold text-cyan-600 dark:text-cyan-300">
                  Explore
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl text-slate-900 dark:text-white">Recent alerts</h3>
              <Link to="/alerts" className="text-xs font-semibold text-cyan-600 dark:text-cyan-300">
                View all
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {hasError ? (
                <div className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-6 text-center dark:border-rose-500/40 dark:bg-rose-500/10">
                  <svg className="mx-auto h-8 w-8 text-rose-400 dark:text-rose-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                  <p className="mt-2 text-sm text-rose-700 dark:text-rose-100">Unable to load alerts right now.</p>
                </div>
              ) : recentAlerts.length === 0 ? (
                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-6 text-center dark:border-slate-800/70 dark:bg-slate-900/60">
                  <svg className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No alerts detected in the latest scans.</p>
                </div>
              ) : (
                recentAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${getAlertStyleCompact(alert.type)}`}
                      >
                        {getAlertLabelCompact(alert.type)}
                      </span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {alert.network_name ?? 'Global'}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {alert.ip}:{alert.port}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="line-clamp-1">{alert.message}</span>
                      <span>{formatRelativeTime(parseUtcDate(alert.created_at), now)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl text-slate-900 dark:text-white">Scanners</h3>
              <Link
                to="/scanners"
                className="text-xs font-semibold text-cyan-600 dark:text-cyan-300"
              >
                Manage
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {scanners.length === 0 ? (
                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-6 text-center dark:border-slate-800/70 dark:bg-slate-900/60">
                  <svg className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" /></svg>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No scanners registered yet.</p>
                  <Link to="/scanners" className="mt-1 inline-block text-xs font-semibold text-cyan-600 dark:text-cyan-300">Add a scanner</Link>
                </div>
              ) : (
                scanners.map((scanner) => {
                  const lastSeen = scanner.last_seen_at ? parseUtcDate(scanner.last_seen_at) : null
                  const lastSeenDiff = lastSeen ? now.getTime() - lastSeen.getTime() : null
                  const isOnline = lastSeenDiff !== null && lastSeenDiff <= 5 * 60 * 1000

                  return (
                    <div
                      key={scanner.id}
                      className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {scanner.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {lastSeen
                            ? `Last seen ${formatRelativeTime(lastSeen, now)}`
                            : 'Awaiting first check-in'}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${
                          isOnline
                            ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200'
                            : 'border-slate-300/60 bg-slate-200/40 text-slate-600 dark:border-slate-600/60 dark:bg-slate-800/60 dark:text-slate-300'
                        }`}
                      >
                        {isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}

export default Home
