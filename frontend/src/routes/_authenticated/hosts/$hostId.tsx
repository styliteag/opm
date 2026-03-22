import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Bug,
  ChevronDown,
  Download,
  Globe,
  Pencil,
  RefreshCw,
  Check,
  X,
  ShieldAlert,
  Scan,
  Terminal,
} from 'lucide-react'
import { toast } from 'sonner'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LoadingState } from '@/components/data-display/LoadingState'
import { ErrorState } from '@/components/data-display/ErrorState'
import { SeverityBadge } from '@/components/data-display/SeverityBadge'
import { StatusBadge } from '@/components/data-display/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useHostDetail } from '@/features/hosts/hooks/useHosts'
import { useHostVulnerabilities } from '@/features/hosts/hooks/useHostVulnerabilities'
import { computeRiskScore, riskScoreColor, riskScoreLabel } from '@/lib/risk-score'
import { fetchApi, patchApi } from '@/lib/api'
import type {
  EnrichedHostPort,
  HostAlertSummary,
  HostScanEntry,
  AlertSSHSummary,
  NseResult,
} from '@/lib/types'
import { formatRelativeTime, formatDate, cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/hosts/$hostId')({
  component: HostDetailPage,
})

/* ------------------------------------------------------------------ */
/*  Timeline types                                                     */
/* ------------------------------------------------------------------ */

interface TimelineEvent {
  id: number
  event_type: string
  timestamp: string
  title: string
  description: string
}

interface TimelineResponse {
  events: TimelineEvent[]
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function HostDetailPage() {
  const { hostId } = Route.useParams()
  const id = Number(hostId)
  const { data, isLoading, error, refetch } = useHostDetail(id)

  if (isLoading) return <LoadingState rows={8} />
  if (error) return <ErrorState message={error.message} onRetry={refetch} />
  if (!data) return <ErrorState message="Host not found" />

  const { host, ports, alerts, ssh, recent_scans, networks } = data
  const vulns = useHostVulnerabilities(host.ip)
  const vulnList = vulns.data?.results ?? []
  const riskScore = computeRiskScore(alerts, ports, ssh)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/hosts"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <InlineHostname hostId={id} hostname={host.hostname} ip={host.ip} />
            <p className="mt-0.5 font-mono text-sm text-muted-foreground">
              {host.ip}
              {host.hostname && ` · ${host.hostname}`}
              {networks.length > 0 && ` · ${networks.map((n) => n.name).join(', ')}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className={cn('font-display text-3xl font-bold', riskScoreColor(riskScore))}>
              {riskScore}
            </p>
            <p className="text-xs text-muted-foreground">{riskScoreLabel(riskScore)} Risk</p>
          </div>

          {/* Export dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-accent transition-colors">
              <Download className="h-3.5 w-3.5" />
              Export
              <ChevronDown className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => window.open('/api/hosts/export/csv', '_blank')}>
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open('/api/hosts/export/pdf', '_blank')}>
                Export PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />
            Rescan
          </button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Open Ports</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{ports.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Active Alerts</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{alerts.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Coverage</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">
            {ports.length > 0
              ? Math.round((ports.filter((p) => p.rule_status).length / ports.length) * 100)
              : 0}
            %
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Last Seen</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {formatRelativeTime(host.last_seen_at)}
          </p>
        </div>
      </div>

      {/* Host Comment */}
      <HostComment hostId={id} comment={host.user_comment} />

      {/* Tabbed Content */}
      <Tabs defaultValue="ports">
        <TabsList>
          <TabsTrigger value="ports">Ports ({ports.length})</TabsTrigger>
          <TabsTrigger value="alerts">Alerts ({alerts.length})</TabsTrigger>
          <TabsTrigger value="vulns">Vulnerabilities ({vulnList.length})</TabsTrigger>
          <TabsTrigger value="scans">Scans ({recent_scans.length})</TabsTrigger>
          <TabsTrigger value="ssh">SSH</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="ports" className="mt-4">
          <PortsTab ports={ports} />
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <AlertsTab alerts={alerts} />
        </TabsContent>

        <TabsContent value="vulns" className="mt-4">
          <VulnerabilitiesTab vulnerabilities={vulnList} isLoading={vulns.isLoading} />
        </TabsContent>

        <TabsContent value="scans" className="mt-4">
          <ScansTab scans={recent_scans} />
        </TabsContent>

        <TabsContent value="ssh" className="mt-4">
          <SshTab ssh={ssh} />
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <TimelineTab hostId={id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Inline hostname edit (Feature 3)                                   */
/* ------------------------------------------------------------------ */

function InlineHostname({
  hostId,
  hostname,
  ip,
}: {
  hostId: number
  hostname: string | null
  ip: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(hostname ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const save = useMutation({
    mutationFn: (value: string) => patchApi(`/api/hosts/${hostId}`, { hostname: value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hosts', hostId, 'overview'] })
      setEditing(false)
      toast.success('Hostname updated')
    },
    onError: (e) => toast.error(e.message),
  })

  const startEditing = useCallback(() => {
    setDraft(hostname ?? '')
    setEditing(true)
  }, [hostname])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      save.mutate(draft)
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setEditing(false)}
          className="font-display text-2xl font-bold text-foreground bg-transparent border-b-2 border-primary outline-none"
          disabled={save.isPending}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => {
            e.preventDefault()
            save.mutate(draft)
          }}
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => {
            e.preventDefault()
            setEditing(false)
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <h1
      className="group flex items-center gap-2 font-display text-2xl font-bold text-foreground cursor-pointer"
      onClick={startEditing}
    >
      {hostname ?? ip}
      <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </h1>
  )
}

/* ------------------------------------------------------------------ */
/*  Timeline tab (Feature 2)                                           */
/* ------------------------------------------------------------------ */

const EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  alert_created: ShieldAlert,
  port_discovered: Globe,
  ssh_scanned: Terminal,
  vulnerability_found: Bug,
}

const EVENT_COLORS: Record<string, string> = {
  alert_created: 'text-destructive',
  port_discovered: 'text-primary',
  ssh_scanned: 'text-yellow-500',
  vulnerability_found: 'text-orange-500',
}

function TimelineTab({ hostId }: { hostId: number }) {
  const PAGE_SIZE = 50

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } =
    useInfiniteQuery({
      queryKey: ['hosts', hostId, 'timeline'],
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
        if (pageParam) {
          params.set('before', pageParam)
        }
        return fetchApi<TimelineResponse>(`/api/hosts/${hostId}/timeline?${params}`)
      },
      initialPageParam: '' as string,
      getNextPageParam: (lastPage) => {
        if (lastPage.events.length < PAGE_SIZE) return undefined
        const lastEvent = lastPage.events[lastPage.events.length - 1]
        return lastEvent?.timestamp
      },
    })

  if (isLoading) return <LoadingState rows={6} />
  if (error) return <ErrorState message={error.message} />

  const events = data?.pages.flatMap((p) => p.events) ?? []

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        No activity recorded for this host
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative space-y-0">
        {events.map((event, idx) => {
          const Icon = EVENT_ICONS[event.event_type] ?? Scan
          const colorClass = EVENT_COLORS[event.event_type] ?? 'text-muted-foreground'
          const isLast = idx === events.length - 1

          return (
            <div key={`${event.event_type}-${event.id}`} className="flex gap-4">
              {/* Timeline line + icon */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card',
                    colorClass,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                {!isLast && <div className="w-px flex-1 bg-border" />}
              </div>
              {/* Content */}
              <div className="pb-6 pt-1">
                <p className="text-sm font-medium text-foreground">{event.title}</p>
                <p className="text-xs text-muted-foreground">{event.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatRelativeTime(event.timestamp)}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Host Comment                                                       */
/* ------------------------------------------------------------------ */

function HostComment({ hostId, comment }: { hostId: number; comment: string | null }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment ?? '')
  const qc = useQueryClient()

  const save = useMutation({
    mutationFn: (user_comment: string) => patchApi(`/api/hosts/${hostId}`, { user_comment }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hosts', hostId, 'overview'] })
      setEditing(false)
      toast.success('Comment saved')
    },
    onError: (e) => toast.error(e.message),
  })

  if (editing) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Host Comment
        </label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          placeholder="Add a comment about this host..."
        />
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" onClick={() => save.mutate(draft)} disabled={save.isPending}>
            <Check className="h-3.5 w-3.5 mr-1" />
            {save.isPending ? 'Saving...' : 'Save'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(comment ?? '')
              setEditing(false)
            }}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="group rounded-lg border border-border bg-card p-4 cursor-pointer hover:border-primary/30 transition-colors"
      onClick={() => {
        setDraft(comment ?? '')
        setEditing(true)
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">Host Comment</span>
        <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="text-sm text-foreground">
        {comment || (
          <span className="text-muted-foreground italic">Click to add a comment...</span>
        )}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Ports tab                                                          */
/* ------------------------------------------------------------------ */

function PortsTab({ ports }: { ports: EnrichedHostPort[] }) {
  return (
    <div className="rounded-lg border border-border">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-card">
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
              Port
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
              Protocol
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
              Service
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
              Banner
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
              Status
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
              Last Seen
            </th>
          </tr>
        </thead>
        <tbody>
          {ports.map((port) => (
            <tr
              key={`${port.port}:${port.protocol}`}
              className="border-b border-border hover:bg-accent/50 transition-colors"
            >
              <td className="px-4 py-2 font-mono text-sm text-primary">{port.port}</td>
              <td className="px-4 py-2 text-sm text-muted-foreground uppercase">
                {port.protocol}
              </td>
              <td className="px-4 py-2 text-sm text-foreground">{port.service_guess ?? '-'}</td>
              <td className="px-4 py-2 text-sm text-muted-foreground truncate max-w-xs">
                {port.banner ?? '-'}
              </td>
              <td className="px-4 py-2">
                {port.rule_status ? (
                  <StatusBadge
                    label={port.rule_status}
                    variant={port.rule_status === 'accepted' ? 'success' : 'danger'}
                  />
                ) : port.alert_severity ? (
                  <SeverityBadge
                    severity={port.alert_severity as 'critical' | 'high' | 'medium' | 'info'}
                  />
                ) : (
                  <StatusBadge label="Unreviewed" variant="neutral" />
                )}
              </td>
              <td className="px-4 py-2 text-sm text-muted-foreground">
                {formatRelativeTime(port.last_seen_at)}
              </td>
            </tr>
          ))}
          {ports.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="px-4 py-8 text-center text-sm text-muted-foreground"
              >
                No open ports
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Alerts tab                                                         */
/* ------------------------------------------------------------------ */

function AlertsTab({ alerts }: { alerts: HostAlertSummary[] }) {
  return (
    <div className="rounded-lg border border-border">
      {alerts.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No active alerts</div>
      ) : (
        <div className="divide-y divide-border">
          {alerts.map((alert) => (
            <Link
              key={alert.id}
              to="/alerts/$alertId"
              params={{ alertId: String(alert.id) }}
              className="flex items-center gap-3 px-5 py-3 hover:bg-accent/50 transition-colors"
            >
              <SeverityBadge
                severity={alert.severity as 'critical' | 'high' | 'medium' | 'info'}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{alert.message}</p>
                <p className="text-xs text-muted-foreground">
                  Port {alert.port} · {alert.network_name ?? 'Unknown network'}
                </p>
              </div>
              <StatusBadge
                label={alert.resolution_status.replace('_', ' ')}
                variant={
                  alert.resolution_status === 'resolved'
                    ? 'success'
                    : alert.resolution_status === 'open'
                      ? 'danger'
                      : 'warning'
                }
              />
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(alert.created_at)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Scans tab                                                          */
/* ------------------------------------------------------------------ */

function ScansTab({ scans }: { scans: HostScanEntry[] }) {
  return (
    <div className="rounded-lg border border-border">
      {scans.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No scan history</div>
      ) : (
        <div className="divide-y divide-border">
          {scans.map((scan) => (
            <Link
              key={scan.id}
              to="/scans/$scanId"
              params={{ scanId: String(scan.id) }}
              className="flex items-center justify-between px-5 py-3 hover:bg-accent/50 transition-colors"
            >
              <div>
                <p className="text-sm text-foreground">
                  {scan.network_name ?? `Network #${scan.network_id}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {scan.port_count} ports · {scan.trigger_type}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge
                  label={scan.status}
                  variant={
                    scan.status === 'completed'
                      ? 'success'
                      : scan.status === 'running'
                        ? 'warning'
                        : scan.status === 'error'
                          ? 'danger'
                          : 'neutral'
                  }
                  dot
                />
                {scan.completed_at && (
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(scan.completed_at)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  SSH tab (Feature 4 - Export SSH Report button)                      */
/* ------------------------------------------------------------------ */

function SshTab({ ssh }: { ssh: AlertSSHSummary | null }) {
  if (!ssh) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        No SSH data available for this host
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open('/api/ssh/export/pdf', '_blank')}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export SSH Report
        </Button>
      </div>
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="font-display text-sm font-semibold text-foreground mb-4">
          SSH Security Assessment
        </h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ssh.ssh_version && (
            <div>
              <dt className="text-xs text-muted-foreground">SSH Version</dt>
              <dd className="mt-0.5 text-sm text-foreground">{ssh.ssh_version}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-foreground">Public Key Auth</dt>
            <dd className="mt-1">
              <StatusBadge
                label={ssh.publickey_enabled ? 'Enabled' : 'Disabled'}
                variant={ssh.publickey_enabled ? 'success' : 'warning'}
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Password Auth</dt>
            <dd className="mt-1">
              <StatusBadge
                label={ssh.password_enabled ? 'Enabled' : 'Disabled'}
                variant={ssh.password_enabled ? 'warning' : 'success'}
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Keyboard Interactive</dt>
            <dd className="mt-1">
              <StatusBadge
                label={ssh.keyboard_interactive_enabled ? 'Enabled' : 'Disabled'}
                variant={ssh.keyboard_interactive_enabled ? 'warning' : 'success'}
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Weak Ciphers</dt>
            <dd className="mt-1">
              <StatusBadge
                label={ssh.has_weak_ciphers ? 'Found' : 'None'}
                variant={ssh.has_weak_ciphers ? 'danger' : 'success'}
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Weak Key Exchange</dt>
            <dd className="mt-1">
              <StatusBadge
                label={ssh.has_weak_kex ? 'Found' : 'None'}
                variant={ssh.has_weak_kex ? 'danger' : 'success'}
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Last Scanned</dt>
            <dd className="mt-0.5 text-sm text-foreground">{formatDate(ssh.last_scanned)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Vulnerabilities tab                                                */
/* ------------------------------------------------------------------ */

function VulnerabilitiesTab({
  vulnerabilities,
  isLoading,
}: {
  vulnerabilities: NseResult[]
  isLoading: boolean
}) {
  if (isLoading) {
    return <LoadingState rows={4} />
  }

  if (vulnerabilities.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        No vulnerabilities detected by NSE scans
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="divide-y divide-border">
        {vulnerabilities.map((vuln) => (
          <div key={vuln.id} className="px-5 py-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <SeverityBadge severity={vuln.severity} />
                <div>
                  <p className="text-sm font-medium text-foreground">{vuln.script_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Port {vuln.port}/{vuln.protocol} · {formatRelativeTime(vuln.created_at)}
                  </p>
                </div>
              </div>
              {vuln.cve_ids.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {vuln.cve_ids.map((cve) => (
                    <span
                      key={cve}
                      className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-mono text-destructive"
                    >
                      {cve}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {vuln.script_output && (
              <pre className="mt-2 rounded bg-accent/50 p-3 text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                {vuln.script_output}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
