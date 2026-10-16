import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MessageSquare, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { SeverityBadge } from "@/components/data-display/SeverityBadge";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import { AssignAlertDropdown } from "@/features/alerts/components/AssignAlertDropdown";
import { CommentInput } from "@/features/alerts/components/CommentInput";
import { ScanPresenceChart } from "@/features/alerts/components/ScanPresenceChart";
import { AlertActivityFeed } from "@/features/alerts/components/AlertActivityFeed";
import { AlertTriageBar } from "@/features/alerts/components/triage/AlertTriageBar";
import { useAlertComments } from "@/features/alerts/hooks/useAlerts";
import {
  alertDisplayTitle,
  alertToolLabel,
} from "@/features/alerts/lib/alertDisplayTitle";
import { fetchAlert, fetchAlertTimeline } from "@/lib/api-client-helpers";
import { useHasRole } from "@/lib/roles";
import { PORT_STATUS } from "@/lib/terminology";
import { formatDate, formatRelativeTime } from "@/lib/utils";

interface AlertDetailPanelProps {
  alertId: number;
  /** Called after a triage action took the alert out of (or back into) the queue. */
  onResolved?: () => void;
}

export function AlertDetailPanel({ alertId, onResolved }: AlertDetailPanelProps) {
  const comments = useAlertComments(alertId);
  // Assign and comments are analyst+ on the backend; hidden for viewers.
  const canTriage = useHasRole("analyst");

  const alertQuery = useQuery({
    queryKey: ["alerts", alertId],
    queryFn: () => fetchAlert(alertId),
    enabled: alertId > 0,
  });
  const alert = alertQuery.data;

  const timelineQuery = useQuery({
    queryKey: ["alerts", alertId, "timeline"],
    queryFn: () => fetchAlertTimeline(alertId),
    enabled: alertId > 0 && !alertQuery.isLoading,
  });

  if (alertQuery.isLoading) return <LoadingState rows={6} />;
  if (alertQuery.error)
    return (
      <ErrorState
        message={alertQuery.error.message}
        onRetry={alertQuery.refetch}
      />
    );
  if (!alert) return <ErrorState message={`Alert #${alertId} not found`} />;

  const commentList = comments.data ?? [];
  const expectedRule = alert.matching_rules.find(
    (rule) => rule.rule_type === "accepted",
  );
  const tool = alertToolLabel(alert);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={alert.severity_override ?? alert.severity} />
          {alert.dismissed && !expectedRule && (
            <Badge variant="outline">{PORT_STATUS.snoozed.label}</Badge>
          )}
          {expectedRule && (
            <Badge variant="outline">
              {PORT_STATUS.expected.label} ({expectedRule.scope})
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {tool.label}
            {tool.tool && <> · {tool.tool}</>}
          </span>
        </div>
        <h2 className="text-xl font-strong text-foreground">
          {alertDisplayTitle(alert)}
        </h2>
        <p className="text-sm text-muted-foreground">
          Alert #{alert.id} · Detected {formatRelativeTime(alert.created_at)}
        </p>
        <div className="flex flex-wrap gap-2">
          <AlertTriageBar alert={alert} onResolved={onResolved} />
          {canTriage && (
            <AssignAlertDropdown
              alertId={alert.id}
              currentUserId={alert.assigned_to_user_id}
              currentUserEmail={alert.assigned_to_email}
            />
          )}
        </div>
      </div>

      <Separator />

      {/* Scan Presence */}
      {timelineQuery.data && (
        <ScanPresenceChart scanGroups={timelineQuery.data.scan_groups} />
      )}

      {/* Details Grid */}
      <div className="space-y-6">
        <div className="space-y-6">
          {/* Alert Info */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-strong text-foreground mb-3">
              Details
            </h3>
            <dl className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Message</dt>
                <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-foreground">
                  {alert.message}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Target</dt>
                <dd className="mt-0.5 font-mono text-sm">
                  {alert.host_id ? (
                    <Link
                      to="/hosts/$hostId"
                      params={{ hostId: String(alert.host_id) }}
                      className="text-foreground hover:text-primary transition-colors"
                    >
                      {alert.ip}
                      {alert.port ? `:${alert.port}` : ""}
                    </Link>
                  ) : (
                    <span className="text-foreground">
                      {alert.ip}
                      {alert.port ? `:${alert.port}` : ""}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Network</dt>
                <dd className="mt-0.5 text-sm">
                  {alert.network_id && alert.network_name ? (
                    <Link
                      to="/networks/$networkId"
                      params={{ networkId: String(alert.network_id) }}
                      className="text-foreground hover:text-primary transition-colors"
                    >
                      {alert.network_name}
                    </Link>
                  ) : (
                    <span className="text-foreground">
                      {alert.network_name ?? "-"}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Hostname</dt>
                <dd className="mt-0.5 text-sm text-foreground">
                  {alert.hostname ?? "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Created</dt>
                <dd className="mt-0.5 text-sm text-foreground">
                  {formatDate(alert.created_at)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Assigned To</dt>
                <dd className="mt-0.5 text-sm text-foreground">
                  {alert.assigned_to_email ?? "Unassigned"}
                </dd>
              </div>
              {alert.dismiss_reason && (
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">
                    Why
                  </dt>
                  <dd className="mt-0.5 text-sm text-foreground">
                    {alert.dismiss_reason}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* SSH Context */}
          {alert.ssh_summary && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-strong text-foreground mb-3">
                SSH Context
              </h3>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Version</dt>
                  <dd className="mt-0.5 text-sm text-foreground">
                    {alert.ssh_summary.ssh_version ?? "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Password login
                  </dt>
                  <dd className="mt-0.5">
                    <StatusBadge
                      label={
                        alert.ssh_summary.password_enabled
                          ? "Enabled"
                          : "Disabled"
                      }
                      variant={
                        alert.ssh_summary.password_enabled
                          ? "warning"
                          : "success"
                      }
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Weak encryption
                  </dt>
                  <dd className="mt-0.5">
                    <StatusBadge
                      label={
                        alert.ssh_summary.has_weak_ciphers ? "Found" : "None"
                      }
                      variant={
                        alert.ssh_summary.has_weak_ciphers
                          ? "danger"
                          : "success"
                      }
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Weak KEX</dt>
                  <dd className="mt-0.5">
                    <StatusBadge
                      label={alert.ssh_summary.has_weak_kex ? "Found" : "None"}
                      variant={
                        alert.ssh_summary.has_weak_kex ? "danger" : "success"
                      }
                    />
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* Related SSH Alerts */}
          {alert.related_ssh_alert_count > 0 && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-strong text-foreground mb-3">
                Related SSH Alerts
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                {alert.related_ssh_alert_count} SSH security{" "}
                {alert.related_ssh_alert_count === 1 ? "alert" : "alerts"} found
                for this host
                {alert.related_ssh_alerts_dismissed
                  ? " (all handled)"
                  : " (some active)"}
                .
              </p>
              {alert.host_id && (
                <Link
                  to="/hosts/$hostId"
                  params={{ hostId: String(alert.host_id) }}
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  View SSH findings for {alert.ip}
                </Link>
              )}
            </div>
          )}

          {/* NSE Context */}
          {alert.source === "nse" && alert.host_id && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-strong text-foreground mb-3">
                Vulnerability Context
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Found by {tool.label.toLowerCase()} ({tool.tool}). The host
                page shows all findings including script output and CVE
                identifiers.
              </p>
              <Link
                to="/hosts/$hostId"
                params={{ hostId: String(alert.host_id) }}
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View findings for {alert.ip}
              </Link>
            </div>
          )}

          {/* Matching Rules */}
          {alert.matching_rules.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-strong text-foreground mb-3">
                Matching Rules ({alert.matching_rules.length})
              </h3>
              <div className="space-y-2">
                {alert.matching_rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2"
                  >
                    <div>
                      <span className="text-sm text-foreground">
                        {rule.description ?? `Port rule #${rule.id}`}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({rule.scope})
                      </span>
                    </div>
                    <StatusBadge
                      label={
                        rule.rule_type === "accepted"
                          ? PORT_STATUS.expected.label
                          : rule.rule_type
                      }
                      variant={
                        rule.rule_type === "accepted" ? "success" : "danger"
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity Feed */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-strong text-foreground mb-3">
              Activity
            </h3>
            <AlertActivityFeed alertId={alertId} />
          </div>
        </div>

        {/* Comments */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-strong text-foreground">
              Comments ({commentList.length})
            </h3>
          </div>
          {commentList.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-4">
              No comments yet.
            </p>
          ) : (
            <div className="space-y-4 mb-4">
              {commentList.map((comment) => (
                <div key={comment.id}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-emphasis text-foreground">
                      {comment.user_email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(comment.created_at)}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {comment.content}
                  </p>
                </div>
              ))}
            </div>
          )}
          {canTriage && (
            <>
              <Separator className="mb-4" />
              <CommentInput alertId={alert.id} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
