import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  trend?: string
  className?: string
}

export function StatCard({ label, value, icon: Icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn('backdrop-blur-sm', className)}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="mt-2 font-display text-2xl font-bold text-foreground">
          {value}
        </p>
        {trend && (
          <p className="mt-1 text-xs text-muted-foreground">{trend}</p>
        )}
      </CardContent>
    </Card>
  )
}
