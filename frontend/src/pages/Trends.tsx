import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { fetchJson } from '../lib/api'
import TrendChart, { TrendDataPoint, TrendChartConfig } from '../components/TrendChart'

type NetworkListResponse = {
  networks: Array<{ id: number; name: string }>
}

type TrendResponse = {
  data: TrendDataPoint[]
}

type AlertTrendDataPoint = {
  date: string
  count: number
  dismissed_count: number
}

type AlertTrendResponse = {
  data: AlertTrendDataPoint[]
}

const Trends = () => {
  const { token } = useAuth()
  const [period, setPeriod] = useState<'7' | '30' | '90'>('30')
  const [networkId, setNetworkId] = useState<string>('all')

  // Calculate date range based on period
  const dateRange = useMemo(() => {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(period))

    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    }
  }, [period])

  // Fetch networks for filter
  const networksQuery = useQuery({
    queryKey: ['networks'],
    queryFn: () => fetchJson<NetworkListResponse>('/api/networks', token ?? ''),
    enabled: !!token,
  })

  // Build query params
  const buildQueryParams = () => {
    const params = new URLSearchParams({
      period: 'day',
      start_date: dateRange.start,
      end_date: dateRange.end,
    })
    if (networkId !== 'all') {
      params.set('network_id', networkId)
    }
    return params.toString()
  }

  // Fetch open ports trend data
  const openPortsQuery = useQuery({
    queryKey: ['trends', 'open-ports', period, networkId],
    queryFn: () =>
      fetchJson<TrendResponse>(`/api/trends/open-ports?${buildQueryParams()}`, token ?? ''),
    enabled: !!token,
  })

  // Fetch hosts trend data
  const hostsQuery = useQuery({
    queryKey: ['trends', 'hosts', period, networkId],
    queryFn: () => fetchJson<TrendResponse>(`/api/trends/hosts?${buildQueryParams()}`, token ?? ''),
    enabled: !!token,
  })

  // Fetch alerts trend data
  const alertsQuery = useQuery({
    queryKey: ['trends', 'alerts', period, networkId],
    queryFn: () =>
      fetchJson<AlertTrendResponse>(`/api/trends/alerts?${buildQueryParams()}`, token ?? ''),
    enabled: !!token,
  })

  // Chart configurations
  const openPortsConfig: TrendChartConfig = {
    title: 'Open Ports Over Time',
    dataKey: 'count',
    color: '#3b82f6',
    yAxisLabel: 'Open Ports',
  }

  const hostsConfig: TrendChartConfig = {
    title: 'Hosts Discovered Over Time',
    dataKey: 'count',
    color: '#10b981',
    yAxisLabel: 'Hosts',
  }

  const alertsConfig: TrendChartConfig = {
    title: 'Alerts Over Time',
    dataKey: 'count',
    dataKey2: 'dismissed_count',
    color: '#ef4444',
    color2: '#f59e0b',
    yAxisLabel: 'Alerts',
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -left-20 top-16 h-64 w-64 animate-drift rounded-full bg-sky-500/15 blur-[130px]" />
      <div className="pointer-events-none absolute right-0 top-32 h-64 w-64 animate-drift rounded-full bg-emerald-500/20 blur-[140px]" />

      <section className="relative z-10 space-y-8">
        <div className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Analytics</p>
              <h2 className="mt-3 font-display text-3xl text-slate-900 dark:text-white">Historical Trends</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                View historical trends for open ports, hosts, and alerts
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {/* Time Period Selector */}
              <div className="flex items-center gap-2">
                <label
                  htmlFor="period"
                  className="text-xs font-semibold text-slate-500 dark:text-slate-400"
                >
                  Time Period:
                </label>
                <select
                  id="period"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as '7' | '30' | '90')}
                  className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                </select>
              </div>

              {/* Network Filter */}
              <div className="flex items-center gap-2">
                <label
                  htmlFor="network"
                  className="text-xs font-semibold text-slate-500 dark:text-slate-400"
                >
                  Network:
                </label>
                <select
                  id="network"
                  value={networkId}
                  onChange={(e) => setNetworkId(e.target.value)}
                  className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="all">All Networks</option>
                  {(networksQuery.data?.networks ?? []).map((network) => (
                    <option key={network.id} value={network.id}>
                      {network.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="mt-8 grid gap-6 lg:grid-cols-1 xl:grid-cols-1">
            <TrendChart
              data={openPortsQuery.data?.data ?? []}
              config={openPortsConfig}
              loading={openPortsQuery.isLoading}
              error={openPortsQuery.error ? (openPortsQuery.error as Error).message : undefined}
            />

            <TrendChart
              data={hostsQuery.data?.data ?? []}
              config={hostsConfig}
              loading={hostsQuery.isLoading}
              error={hostsQuery.error ? (hostsQuery.error as Error).message : undefined}
            />

            <TrendChart
              data={alertsQuery.data?.data ?? []}
              config={alertsConfig}
              loading={alertsQuery.isLoading}
              error={alertsQuery.error ? (alertsQuery.error as Error).message : undefined}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

export default Trends
