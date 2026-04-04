import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle,
  RotateCcw,
  MessageSquare,
  ShieldAlert,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { SeverityBadge } from "@/components/data-display/SeverityBadge";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import { DismissModal } from "@/features/alerts/components/DismissModal";
import { AcceptModal } from "@/features/alerts/components/AcceptModal";
import { AssignAlertDropdown } from "@/features/alerts/components/AssignAlertDropdown";
import { CommentInput } from "@/features/alerts/components/CommentInput";
import { ScanPresenceChart } from "@/features/alerts/components/ScanPresenceChart";
import { AlertActivityFeed } from "@/features/alerts/components/AlertActivityFeed";
import {
  useAlertComments,
  useAlertMutations,
} from "@/features/alerts/hooks/useAlerts";
import { fetchAlert, fetchAlertTimeline } from "@/lib/api-client-helpers";
import { formatDate, formatRelativeTime } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/alerts/$alertId")({
  component: AlertDetailPage,
});

function AlertDetailPage() {
  const { alertId } = Route.useParams();
  const id = Number(alertId);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);

  const comments = useAlertComments(id);
  const { reopen, overrideSeverity } = useAlertMutations();

  // Fetch the single alert directly by ID
  const alertQuery = useQuery({
    queryKey: ["alerts", id],
    queryFn: () => fetchAlert(id),
  });
  const alert = alertQuery.data;

  const timelineQuery = useQuery({
    queryKey: ["alerts", id, "timeline"],
    queryFn: () => fetchAlertTimeline(id),
    enabled: !alertQuery.isLoading,
  });

  if (alertQuery.isLoading) return <LoadingState rows={6} />;
  if (alertQuery.error)
    return (
      <ErrorState
        message={alertQuery.error.message}
        onRetry={alertQuery.refetch}
      />
    );
  if (!alert) return <ErrorState message={`Alert #${id} not found`} />;

  const commentList = comments.data ?? [];
  const statusVariant = {
    open: "danger" as const,
    in_progress: "warning" as const,
    resolved: "success" as const,
    fix_planned: "neutral" as const,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          to="/alerts"
          className="mt-1 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <SeverityBadge severity={alert.severity} />
            <StatusBadge
              label={alert.resolution_status.replace("_", " ")}
              variant={statusVariant[alert.resolution_status]}
            />
            {alert.dismissed && <Badge variant="outline">Dismissed</Badge>}
          </div>
          <h1 className="mt-2 text-xl font-strong text-foreground">
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
                  onSuccess: () => toast.success("Alert reopened"),
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reopen
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAcceptOpen(true)}
              >
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                Accept
              </Button>
              <Button size="sm" onClick={() => setDismissOpen(true)}>
                <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                Dismiss
              </Button>
            </>
          )}
        </div>
      </div>

      <Separator />

      {/* Scan Presence */}
      {timelineQuery.data && (
        <ScanPresenceChart scanGroups={timelineQuery.data.scan_groups} />
      )}

      {/* Details Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Alert Info */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-strong text-foreground mb-3">
              Details
            </h3>
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Type</dt>
                <dd className="mt-0.5 text-sm text-foreground">
                  {alert.type.replace(/_/g, " ")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Target</dt>
                <dd className="mt-0.5 font-mono text-sm text-foreground">
                  {alert.ip}
                  {alert.port ? `:${alert.port}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Network</dt>
                <dd className="mt-0.5 text-sm text-foreground">
                  {alert.network_name ?? "-"}
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
              <div>
                <dt className="text-xs text-muted-foreground flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  Severity Override
                </dt>
                <dd className="mt-0.5">
                  <Select
                    value={alert.severity_override ?? ""}
                    onChange={(e) => {
                      const val = e.target.value || null;
                      overrideSeverity.mutate(
                        {
                          id: alert.id,
                          severity: val as
                            | "critical"
                            | "high"
                            | "medium"
                            | "info"
                            | null,
                        },
                        {
                          onSuccess: () =>
                            toast.success(
                              val
                                ? `Severity overridden to ${val}`
                                : "Severity reset to auto",
                            ),
                          onError: (err) => toast.error(err.message),
                        },
                      );
                    }}
                    disabled={overrideSeverity.isPending}
                  >
                    <option value="">Auto (computed)</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="info">Info</option>
                  </Select>
                </dd>
              </div>
              {alert.dismiss_reason && (
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">
                    Dismiss Reason
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
                    Password Auth
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
                    Weak Ciphers
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

          {/* NSE Context */}
          {alert.source === "nse" && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-strong text-foreground mb-3">
                Vulnerability Context
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                This alert was generated by an NSE vulnerability scan. View full
                scan results for details including script output and CVE
                identifiers.
              </p>
              <Link
                to="/nse/results"
                search={{ ip: alert.ip }}
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View NSE results for {alert.ip}
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
                      label={rule.rule_type}
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
            <AlertActivityFeed alertId={id} />
          </div>
        </div>

        {/* Comments Sidebar */}
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
          <Separator className="mb-4" />
          <CommentInput alertId={alert.id} />
        </div>
      </div>

      <DismissModal
        alertIds={[alert.id]}
        port={alert.port ?? undefined}
        open={dismissOpen}
        onOpenChange={setDismissOpen}
      />

      <AcceptModal
        alertIds={[alert.id]}
        open={acceptOpen}
        onOpenChange={setAcceptOpen}
      />
    </div>
  );
}
