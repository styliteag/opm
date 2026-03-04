import { useState } from 'react'
import type { HostSSHSummary } from '../../../types'
import { parseUtcDate, formatDateTime } from '../../../lib/formatters'

type Props = {
  ssh: HostSSHSummary
}

export default function SSHSecuritySection({ ssh }: Props) {
  const hasIssues = ssh.password_enabled || ssh.keyboard_interactive_enabled || ssh.has_weak_ciphers || ssh.has_weak_kex
  const [collapsed, setCollapsed] = useState(!hasIssues)

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-left"
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          SSH Security
          {hasIssues ? (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
              Issues Found
            </span>
          ) : (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              OK
            </span>
          )}
        </h3>
        <svg
          className={`h-5 w-5 text-slate-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="mt-4 space-y-4">
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
              <dd className="text-slate-900 dark:text-white">
                {formatDateTime(parseUtcDate(ssh.last_scanned))}
              </dd>
            </div>
          </div>

          <div className="space-y-2">
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
            <div className="space-y-2">
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
      )}
    </div>
  )
}
