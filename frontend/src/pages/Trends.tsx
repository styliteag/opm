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
  acknowledged_count: number
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
    queryFn: () => fetchJson<TrendResponse>(`/api/trends/open-ports?${buildQueryParams()}`, token ?? ''),
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
    queryFn: () => fetchJson<AlertTrendResponse>(`/api/trends/alerts?${buildQueryParams()}`, token ?? ''),
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
    dataKey2: 'acknowledged_count',
    color: '#ef4444',
    color2: '#f59e0b',
    yAxisLabel: 'Alerts',
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Historical Trends
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            View historical trends for open ports, hosts, and alerts
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        {/* Time Period Selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="period" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Time Period:
          </label>
          <select
            id="period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as '7' | '30' | '90')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>

        {/* Network Filter */}
        <div className="flex items-center gap-2">
          <label htmlFor="network" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Network:
          </label>
          <select
            id="network"
            value={networkId}
            onChange={(e) => setNetworkId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
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

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-1 xl:grid-cols-1">
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
  )
}

export default Trends
