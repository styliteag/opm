import { useState } from 'react'

type Props = {
  alertIp: string
  alertPort: number | null
  onConfirm: (comment: string) => void
  onClose: () => void
  isProcessing?: boolean
}

export default function FixModal({ alertIp, alertPort, onConfirm, onClose, isProcessing = false }: Props) {
  const [comment, setComment] = useState('')

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-slate-200/70 bg-white p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-900">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Mark for Fix</h3>
            <p className="mt-2 font-mono text-2xl font-bold text-amber-600 dark:text-amber-400">
              {alertIp}
              {alertPort != null ? `:${alertPort}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
          This alert will be marked as <strong>fix planned</strong>. Add an optional comment describing what needs to be fixed.
        </p>

        {/* Comment input */}
        <div className="mb-6 space-y-2">
          <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Comment
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="e.g. Firewall rule change scheduled for next maintenance window..."
            autoFocus
            rows={3}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/5 outline-none transition-all dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(comment.trim())}
            disabled={isProcessing}
            className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:bg-amber-500 dark:hover:bg-amber-600 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
          >
            {isProcessing ? 'Processing...' : 'Mark for Fix'}
          </button>
        </div>
      </div>
    </div>
  )
}
