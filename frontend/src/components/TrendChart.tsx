import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

export type TrendDataPoint = {
  date: string
  count: number
  acknowledged_count?: number
}

export type TrendChartConfig = {
  title: string
  dataKey: string
  dataKey2?: string
  color?: string
  color2?: string
  xAxisLabel?: string
  yAxisLabel?: string
}

type TrendChartProps = {
  data: TrendDataPoint[]
  config: TrendChartConfig
  loading?: boolean
  error?: string
}

const TrendChart = ({ data, config, loading = false, error }: TrendChartProps) => {
  const {
    title,
    dataKey,
    dataKey2,
    color = '#3b82f6',
    color2 = '#10b981',
    xAxisLabel,
    yAxisLabel,
  } = config

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
        <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
        <div className="flex h-64 items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-700 dark:border-t-slate-400"></div>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Loading chart data...
            </span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950/20">
        <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
        <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              No data available for the selected period
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
      <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
        {title}
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-slate-200 dark:stroke-slate-800"
          />
          <XAxis
            dataKey="date"
            label={xAxisLabel ? { value: xAxisLabel, position: 'insideBottom', offset: -5 } : undefined}
            className="text-xs text-slate-600 dark:text-slate-400"
            tick={{ fill: 'currentColor' }}
          />
          <YAxis
            label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft' } : undefined}
            className="text-xs text-slate-600 dark:text-slate-400"
            tick={{ fill: 'currentColor' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--tooltip-bg)',
              border: '1px solid var(--tooltip-border)',
              borderRadius: '0.5rem',
              padding: '0.5rem',
            }}
            labelStyle={{
              color: 'var(--tooltip-text)',
              fontWeight: 600,
            }}
            itemStyle={{
              color: 'var(--tooltip-text)',
            }}
          />
          <Legend
            wrapperStyle={{
              paddingTop: '1rem',
            }}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            name={dataKey.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
          />
          {dataKey2 && (
            <Line
              type="monotone"
              dataKey={dataKey2}
              stroke={color2}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              name={dataKey2.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default TrendChart
