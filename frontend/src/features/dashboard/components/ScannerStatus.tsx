import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/data-display/StatusBadge'
import type { Scanner } from '@/lib/types'
import { formatRelativeTime, parseUTC } from '@/lib/utils'

interface ScannerStatusProps {
  scanners: Scanner[]
}

function isOnline(scanner: Scanner): boolean {
  if (!scanner.last_seen_at) return false
  const diff = Date.now() - parseUTC(scanner.last_seen_at).getTime()
  return diff < 5 * 60 * 1000
}

export function ScannerStatus({ scanners }: ScannerStatusProps) {
  const online = scanners.filter(isOnline).length

  return (
    <Card className="backdrop-blur-sm">
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">Scanner Activity</CardTitle>
        <span className="text-xs text-muted-foreground">
          {online}/{scanners.length} online
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {scanners.map((scanner) => {
          const online_ = isOnline(scanner)
          return (
            <div key={scanner.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground">{scanner.name}</p>
                <p className="text-xs text-muted-foreground">
                  {scanner.last_seen_at
                    ? formatRelativeTime(scanner.last_seen_at)
                    : 'Never seen'}
                </p>
              </div>
              <StatusBadge
                label={online_ ? 'Online' : 'Offline'}
                variant={online_ ? 'success' : 'danger'}
                dot
              />
            </div>
          )
        })}
        {scanners.length === 0 && (
          <p className="text-sm text-muted-foreground">No scanners registered</p>
        )}
      </CardContent>
    </Card>
  )
}
