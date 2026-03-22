import { useMemo } from 'react'
import { Clock } from 'lucide-react'
import { CronExpressionParser } from 'cron-parser'
import cronstrue from 'cronstrue'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Network } from '@/lib/types'

interface UpcomingScansProps {
  networks: Network[]
}

interface UpcomingScan {
  networkName: string
  nextRun: Date
  scheduleDescription: string
}

function formatTimeUntil(target: Date): string {
  const diffMs = target.getTime() - Date.now()
  if (diffMs < 0) return 'now'

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'less than a minute'
  if (minutes < 60) return `in ${minutes}m`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours < 24) {
    return remainingMinutes > 0 ? `in ${hours}h ${remainingMinutes}m` : `in ${hours}h`
  }

  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours > 0 ? `in ${days}d ${remainingHours}h` : `in ${days}d`
}

function parseScheduleDescription(schedule: string): string {
  try {
    return cronstrue.toString(schedule)
  } catch {
    return schedule
  }
}

export function UpcomingScans({ networks }: UpcomingScansProps) {
  const upcoming = useMemo<UpcomingScan[]>(() => {
    const scans: UpcomingScan[] = []

    for (const network of networks) {
      if (!network.scan_schedule || !network.scan_schedule_enabled) continue

      try {
        const interval = CronExpressionParser.parseExpression(network.scan_schedule)
        const nextRun = interval.next().toDate()
        scans.push({
          networkName: network.name,
          nextRun,
          scheduleDescription: parseScheduleDescription(network.scan_schedule),
        })
      } catch {
        // Skip networks with invalid cron expressions
      }
    }

    return scans
      .sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime())
      .slice(0, 5)
  }, [networks])

  return (
    <Card className="backdrop-blur-sm">
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">Upcoming Scans</CardTitle>
        <Clock className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        {upcoming.map((scan) => (
          <div key={scan.networkName} className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground truncate">{scan.networkName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {scan.scheduleDescription}
              </p>
            </div>
            <span className="ml-3 shrink-0 text-xs font-medium text-primary">
              {formatTimeUntil(scan.nextRun)}
            </span>
          </div>
        ))}
        {upcoming.length === 0 && (
          <p className="text-sm text-muted-foreground">No scheduled scans</p>
        )}
      </CardContent>
    </Card>
  )
}
