import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, CheckCircle, RotateCcw, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { LoadingState } from '@/components/data-display/LoadingState'
import { ErrorState } from '@/components/data-display/ErrorState'
import { SeverityBadge } from '@/components/data-display/SeverityBadge'
import { StatusBadge } from '@/components/data-display/StatusBadge'
import { DismissModal } from '@/features/alerts/components/DismissModal'
import { AssignAlertDropdown } from '@/features/alerts/components/AssignAlertDropdown'
import { CommentInput } from '@/features/alerts/components/CommentInput'
import { useAlerts, useAlertComments, useAlertMutations } from '@/features/alerts/hooks/useAlerts'
import { formatDate, formatRelativeTime } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/alerts/$alertId')({
  component: AlertDetailPage,
})

function AlertDetailPage() {
  const { alertId } = Route.useParams()
  const id = Number(alertId)
  const [dismissOpen, setDismissOpen] = useState(false)

  const alerts = useAlerts({ limit: 1, offset: 0 })
  const comments = useAlertComments(id)
  const { reopen } = useAlertMutations()

  // Fetch the single alert by querying and finding it
  // (the backend GET /api/alerts/:id returns the full alert)
  const alertQuery = useAlerts({ limit: 200 })
  const alert = alertQuery.data?.alerts.find((a) => a.id === id)

  if (alertQuery.isLoading) return <LoadingState rows={6} />
  if (alertQuery.error) return <ErrorState message={alertQuery.error.message} onRetry={alertQuery.refetch} />
  if (!alert) return <ErrorState message={`Alert #${id} not found`} />

  const commentList = comments.data ?? []
  const statusVariant = {
    open: 'danger' as const,
    in_progress: 'warning' as const,
    resolved: 'success' as const,
    fix_planned: 'neutral' as const,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link to="/alerts" className="mt-1 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <SeverityBadge severity={alert.severity} />
            <StatusBadge
              label={alert.resolution_status.replace('_', ' ')}
              variant={statusVariant[alert.resolution_status]}
            />
            {alert.dismissed && <Badge variant="outline">Dismissed</Badge>}
          </div>
          <h1 className="mt-2 font-display text-xl font-bold text-foreground">
            {alert.message}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Alert #{alert.id} · Detected {formatRelativeTime(alert.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <AssignAlertDropdown
            alertId={alert.id}
            currentUserId={alert.assigned_to_user_id}
            currentUserEmail={alert.assigned_to_email}
          />
          {alert.dismissed ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                reopen.mutate(alert.id, {
                  onSuccess: () => toast.success('Alert reopened'),
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reopen
            </Button>
          ) : (
            <Button size="sm" onClick={() => setDismissOpen(true)}>
              <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
              Dismiss
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* Details Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Alert Info */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="font-display text-sm font-semibold text-foreground mb-3">Details</h3>
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Type</dt>
                <dd className="mt-0.5 text-sm text-foreground">{alert.type.replace(/_/g, ' ')}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Target</dt>
                <dd className="mt-0.5 font-mono text-sm text-foreground">
                  {alert.ip}{alert.port ? `:${alert.port}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Network</dt>
                <dd className="mt-0.5 text-sm text-foreground">{alert.network_name ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Hostname</dt>
                <dd className="mt-0.5 text-sm text-foreground">{alert.hostname ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Created</dt>
                <dd className="mt-0.5 text-sm text-foreground">{formatDate(alert.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Assigned To</dt>
                <dd className="mt-0.5 text-sm text-foreground">{alert.assigned_to_email ?? 'Unassigned'}</dd>
              </div>
              {alert.dismiss_reason && (
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Dismiss Reason</dt>
                  <dd className="mt-0.5 text-sm text-foreground">{alert.dismiss_reason}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* SSH Context */}
          {alert.ssh_summary && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-display text-sm font-semibold text-foreground mb-3">SSH Context</h3>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Version</dt>
                  <dd className="mt-0.5 text-sm text-foreground">{alert.ssh_summary.ssh_version ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Password Auth</dt>
                  <dd className="mt-0.5">
                    <StatusBadge
                      label={alert.ssh_summary.password_enabled ? 'Enabled' : 'Disabled'}
                      variant={alert.ssh_summary.password_enabled ? 'warning' : 'success'}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Weak Ciphers</dt>
                  <dd className="mt-0.5">
                    <StatusBadge
                      label={alert.ssh_summary.has_weak_ciphers ? 'Found' : 'None'}
                      variant={alert.ssh_summary.has_weak_ciphers ? 'danger' : 'success'}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Weak KEX</dt>
                  <dd className="mt-0.5">
                    <StatusBadge
                      label={alert.ssh_summary.has_weak_kex ? 'Found' : 'None'}
                      variant={alert.ssh_summary.has_weak_kex ? 'danger' : 'success'}
                    />
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* Matching Rules */}
          {alert.matching_rules.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-display text-sm font-semibold text-foreground mb-3">
                Matching Rules ({alert.matching_rules.length})
              </h3>
              <div className="space-y-2">
                {alert.matching_rules.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2">
                    <div>
                      <span className="text-sm text-foreground">{rule.description ?? `Port rule #${rule.id}`}</span>
                      <span className="ml-2 text-xs text-muted-foreground">({rule.scope})</span>
                    </div>
                    <StatusBadge
                      label={rule.rule_type}
                      variant={rule.rule_type === 'accepted' ? 'success' : 'danger'}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Comments Sidebar */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-display text-sm font-semibold text-foreground">
              Comments ({commentList.length})
            </h3>
          </div>
          {commentList.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-4">No comments yet.</p>
          ) : (
            <div className="space-y-4 mb-4">
              {commentList.map((comment) => (
                <div key={comment.id}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-foreground">{comment.user_email}</p>
                    <p className="text-xs text-muted-foreground">{formatRelativeTime(comment.created_at)}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{comment.content}</p>
                </div>
              ))}
            </div>
          )}
          <Separator className="mb-4" />
          <CommentInput alertId={alert.id} />
        </div>
      </div>

      <DismissModal
        alertId={alert.id}
        port={alert.port ?? undefined}
        open={dismissOpen}
        onOpenChange={setDismissOpen}
      />
    </div>
  )
}
