import { Link } from 'react-router-dom'
import type { HostScanEntry } from '../../../types'

const parseUtcDate = (dateStr: string) => new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  running: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  planned: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  cancelled: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
}

type Props = {
  scans: HostScanEntry[]
}

export default function ScanHistorySection({ scans }: Props) {
  if (scans.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recent Scans</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm">No scan history available.</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recent Scans</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Date</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Network</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Status</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Ports Found</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Trigger</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {scans.map((scan) => (
              <tr key={scan.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                <td className="px-4 py-2 text-sm text-slate-900 dark:text-white whitespace-nowrap">
                  {scan.started_at ? formatDateTime(parseUtcDate(scan.started_at)) : '-'}
                </td>
                <td className="px-4 py-2 text-sm">
                  <Link
                    to={`/networks/${scan.network_id}`}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {scan.network_name ?? `Network ${scan.network_id}`}
                  </Link>
                </td>
                <td className="px-4 py-2 text-sm">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[scan.status] ?? statusColors.planned}`}>
                    {scan.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm text-slate-900 dark:text-white font-mono">
                  {scan.port_count}
                </td>
                <td className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 capitalize">
                  {scan.trigger_type}
                </td>
                <td className="px-4 py-2 text-sm">
                  <Link
                    to={`/scans/${scan.id}`}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs"
                  >
                    Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
