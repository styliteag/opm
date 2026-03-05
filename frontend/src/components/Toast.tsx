import type { ToastMessage } from '../lib/useToast'

type Props = { toast: ToastMessage | null }

export const Toast = ({ toast }: Props) => {
  if (!toast) return null
  return (
    <div className="fixed top-8 right-8 z-[100] animate-in slide-in-from-top-4 duration-300">
      <div
        className={`px-8 py-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] font-black uppercase text-xs tracking-[0.2em] border ${toast.tone === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-rose-500 border-rose-400 text-white'}`}
      >
        {toast.message}
      </div>
    </div>
  )
}
