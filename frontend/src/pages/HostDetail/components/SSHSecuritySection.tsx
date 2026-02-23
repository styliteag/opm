import { Link } from 'react-router-dom'
import type { HostSSHSummary } from '../../../types'

const parseUtcDate = (dateStr: string) => new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')

const formatRelativeTime = (date: Date) => {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

type Props = {
  ssh: HostSSHSummary
}

export default function SSHSecuritySection({ ssh }: Props) {
  const hasIssues = ssh.password_enabled || ssh.keyboard_interactive_enabled || ssh.has_weak_ciphers || ssh.has_weak_kex

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          SSH Security
          {hasIssues && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
              Issues Found
            </span>
          )}
          {!hasIssues && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              OK
            </span>
          )}
        </h3>
        <Link
          to={`/ssh-security`}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Full SSH Report
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Port</dt>
          <dd className="text-slate-900 dark:text-white font-mono">{ssh.port}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">SSH Version</dt>
          <dd className="text-slate-900 dark:text-white font-mono">{ssh.ssh_version ?? 'Unknown'}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Last Scanned</dt>
          <dd className="text-slate-900 dark:text-white" title={parseUtcDate(ssh.last_scanned).toLocaleString()}>
            {formatRelativeTime(parseUtcDate(ssh.last_scanned))}
          </dd>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">Authentication Methods</h4>
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            ssh.publickey_enabled
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
          }`}>
            Public Key: {ssh.publickey_enabled ? 'Enabled' : 'Disabled'}
          </span>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            ssh.password_enabled
              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
          }`}>
            Password: {ssh.password_enabled ? 'Enabled' : 'Disabled'}
          </span>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            ssh.keyboard_interactive_enabled
              ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
          }`}>
            Keyboard Interactive: {ssh.keyboard_interactive_enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>

      {(ssh.has_weak_ciphers || ssh.has_weak_kex) && (
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">Cryptographic Warnings</h4>
          <div className="flex flex-wrap gap-2">
            {ssh.has_weak_ciphers && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                Weak Ciphers Detected
              </span>
            )}
            {ssh.has_weak_kex && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                Weak Key Exchange Detected
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
