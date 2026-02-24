import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Host, HostNetworkInfo } from '../../../types'

const parseUtcDate = (dateStr: string) => new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)

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
  host: Host
  networks: HostNetworkInfo[]
  isAdmin: boolean
  onUpdateComment: (comment: string | null) => void
  onUpdateHostname: (hostname: string | null) => void
  onRescan: () => void
  isRescanPending: boolean
}

export default function HostInfoCard({
  host,
  networks,
  isAdmin,
  onUpdateComment,
  onUpdateHostname,
  onRescan,
  isRescanPending,
}: Props) {
  const [editingComment, setEditingComment] = useState(false)
  const [commentValue, setCommentValue] = useState(host.user_comment ?? '')
  const [editingHostname, setEditingHostname] = useState(false)
  const [hostnameValue, setHostnameValue] = useState(host.hostname ?? '')

  const handleSaveComment = () => {
    onUpdateComment(commentValue.trim() || null)
    setEditingComment(false)
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
            {host.ip}
          </h2>
          {editingHostname ? (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={hostnameValue}
                onChange={(e) => setHostnameValue(e.target.value)}
                className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-900 dark:text-white"
                placeholder="Hostname..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onUpdateHostname(hostnameValue.trim() || null)
                    setEditingHostname(false)
                  }
                  if (e.key === 'Escape') setEditingHostname(false)
                }}
              />
              <button
                onClick={() => {
                  onUpdateHostname(hostnameValue.trim() || null)
                  setEditingHostname(false)
                }}
                className="px-2 py-1 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700"
              >
                Save
              </button>
              <button
                onClick={() => setEditingHostname(false)}
                className="px-2 py-1 text-xs font-medium rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {host.hostname || <span className="italic">No hostname</span>}
              </p>
              {isAdmin && (
                <button
                  onClick={() => {
                    setHostnameValue(host.hostname ?? '')
                    setEditingHostname(true)
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  title="Edit hostname"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {host.is_pingable === true && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              Up
            </span>
          )}
          {host.is_pingable === false && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
              Down
            </span>
          )}
          {host.is_pingable === null && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300">
              Unknown
            </span>
          )}
          {isAdmin && (
            <button
              onClick={onRescan}
              disabled={isRescanPending}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRescanPending ? 'Scanning...' : 'Rescan'}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <dt className="text-slate-500 dark:text-slate-400">First Seen</dt>
          <dd className="text-slate-900 dark:text-white" title={formatDateTime(parseUtcDate(host.first_seen_at))}>
            {formatRelativeTime(parseUtcDate(host.first_seen_at))}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Last Seen</dt>
          <dd className="text-slate-900 dark:text-white" title={formatDateTime(parseUtcDate(host.last_seen_at))}>
            {formatRelativeTime(parseUtcDate(host.last_seen_at))}
          </dd>
        </div>
        {host.mac_address && (
          <div>
            <dt className="text-slate-500 dark:text-slate-400">MAC Address</dt>
            <dd className="text-slate-900 dark:text-white font-mono text-xs">{host.mac_address}</dd>
          </div>
        )}
        {host.mac_vendor && (
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Vendor</dt>
            <dd className="text-slate-900 dark:text-white">{host.mac_vendor}</dd>
          </div>
        )}
      </div>

      {networks.length > 0 && (
        <div className="mt-4">
          <dt className="text-sm text-slate-500 dark:text-slate-400 mb-1">Networks</dt>
          <dd className="flex flex-wrap gap-2">
            {networks.map((net) => (
              <Link
                key={net.id}
                to={`/networks/${net.id}`}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200 hover:bg-indigo-200 dark:hover:bg-indigo-900/60"
              >
                {net.name} ({net.cidr})
              </Link>
            ))}
          </dd>
        </div>
      )}

      <div className="mt-4">
        <dt className="text-sm text-slate-500 dark:text-slate-400 mb-1">Comment</dt>
        {editingComment ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={commentValue}
              onChange={(e) => setCommentValue(e.target.value)}
              className="flex-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-white"
              placeholder="Add a comment..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveComment()
                if (e.key === 'Escape') setEditingComment(false)
              }}
            />
            <button
              onClick={handleSaveComment}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700"
            >
              Save
            </button>
            <button
              onClick={() => setEditingComment(false)}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
            >
              Cancel
            </button>
          </div>
        ) : (
          <dd className="flex items-center gap-2">
            <span className="text-slate-900 dark:text-white text-sm">
              {host.user_comment || <span className="text-slate-400 italic">No comment</span>}
            </span>
            {isAdmin && (
              <button
                onClick={() => {
                  setCommentValue(host.user_comment ?? '')
                  setEditingComment(true)
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                title="Edit comment"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
          </dd>
        )}
      </div>
    </div>
  )
}
