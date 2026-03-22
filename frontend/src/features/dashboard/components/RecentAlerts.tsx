import { Link } from '@tanstack/react-router'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SeverityBadge } from '@/components/data-display/SeverityBadge'
import type { Alert } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'

interface RecentAlertsProps {
  alerts: Alert[]
}

export function RecentAlerts({ alerts }: RecentAlertsProps) {
  return (
    <Card className="backdrop-blur-sm">
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">Recent Alerts</CardTitle>
        <Link
          to="/alerts"
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          View all
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.length === 0 && (
          <p className="text-sm text-muted-foreground">No active alerts</p>
        )}
        {alerts.map((alert) => (
          <Link
            key={alert.id}
            to="/alerts/$alertId"
            params={{ alertId: String(alert.id) }}
            className="flex items-center gap-3 rounded-md px-2 py-2 -mx-2 hover:bg-accent transition-colors"
          >
            <SeverityBadge severity={alert.severity} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">
                {alert.message}
              </p>
              <p className="text-xs text-muted-foreground">
                {alert.ip}
                {alert.port ? `:${alert.port}` : ''}{' '}
                {alert.network_name && `· ${alert.network_name}`}
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatRelativeTime(alert.created_at)}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
