type Props = {
  isPending: boolean
  onConfirm: () => void
  onClose: () => void
}

export function DeleteNetworkConfirmModal({ isPending, onConfirm, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Delete network
            </p>
            <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
              Confirm deletion
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
          >
            Close
          </button>
        </div>
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
          This will permanently delete the network and its associated scans and rules. This action
          cannot be undone.
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-full border border-rose-600 bg-rose-600 px-5 py-2 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-70"
          >
            {isPending ? 'Deleting...' : 'Delete network'}
          </button>
        </div>
      </div>
    </div>
  )
}
