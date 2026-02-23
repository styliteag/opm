import type { HostOpenPort } from '../../../types'

const parseUtcDate = (dateStr: string) => new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)

type Props = {
  ports: HostOpenPort[]
}

export default function OpenPortsSection({ ports }: Props) {
  if (ports.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Open Ports</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm">No open ports detected.</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
        Open Ports ({ports.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Port</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Protocol</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Service</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Banner</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">First Seen</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Last Seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {ports.map((port) => (
              <tr key={`${port.port}-${port.protocol}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                <td className="px-4 py-2 text-sm font-mono text-slate-900 dark:text-white">{port.port}</td>
                <td className="px-4 py-2 text-sm">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 uppercase">
                    {port.protocol}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm text-slate-900 dark:text-white">
                  {port.service_guess || <span className="text-slate-400">-</span>}
                </td>
                <td className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 font-mono text-xs max-w-xs truncate" title={port.banner ?? undefined}>
                  {port.banner || <span className="text-slate-400">-</span>}
                </td>
                <td className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {formatDateTime(parseUtcDate(port.first_seen_at))}
                </td>
                <td className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {formatDateTime(parseUtcDate(port.last_seen_at))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
