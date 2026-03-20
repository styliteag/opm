import type { ToastMessage } from '../lib/useToast'

type Props = { toast: ToastMessage | null }

export const Toast = ({ toast }: Props) => {
  if (!toast) return null
  return (
    <div className="fixed right-8 top-8 z-toast animate-toast-in">
      <div
        className={`rounded-2xl border px-6 py-3 text-xs font-semibold tracking-wide shadow-lg ${toast.tone === 'success' ? 'border-emerald-400/40 bg-emerald-500 text-white' : 'border-rose-400/40 bg-rose-500 text-white'}`}
      >
        {toast.message}
      </div>
    </div>
  )
}
