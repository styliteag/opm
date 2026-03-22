import { cn } from '@/lib/utils'

type StatusVariant = 'success' | 'warning' | 'danger' | 'neutral'

const variantStyles: Record<StatusVariant, string> = {
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  danger: 'bg-red-500/10 text-red-400 border-red-500/20',
  neutral: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
}

interface StatusBadgeProps {
  label: string
  variant?: StatusVariant
  dot?: boolean
  className?: string
}

export function StatusBadge({
  label,
  variant = 'neutral',
  dot = false,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            variant === 'success' && 'bg-emerald-400',
            variant === 'warning' && 'bg-yellow-400',
            variant === 'danger' && 'bg-red-400',
            variant === 'neutral' && 'bg-slate-400',
          )}
        />
      )}
      {label}
    </span>
  )
}
