import { cn } from '@/lib/utils'

interface LoadingStateProps {
  rows?: number
  className?: string
}

export function LoadingState({ rows = 5, className }: LoadingStateProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 animate-pulse rounded-md bg-card"
          style={{ opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  )
}
