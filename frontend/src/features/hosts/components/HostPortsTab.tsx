import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { SeverityBadge } from "@/components/data-display/SeverityBadge";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import { InlineTextCell } from "@/components/ui/inline-text-cell";
import { patchPortComment } from "@/lib/api-client-helpers";
import type { EnrichedHostPort } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
function isRecentPort(firstSeenAt: string): boolean {
  return Date.now() - new Date(firstSeenAt).getTime() < SEVEN_DAYS_MS;
}

export function HostPortsTab({
  ports,
  hostId,
}: {
  ports: EnrichedHostPort[];
  hostId: number;
}) {
  const qc = useQueryClient();
  const commentMutation = useMutation({
    mutationFn: ({ portId, comment }: { portId: number; comment: string }) =>
      patchPortComment(portId, { user_comment: comment }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hosts", hostId, "overview"] });
      toast.success("Comment saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border border-border">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-card">
            <th className="px-4 py-2 text-left text-xs font-emphasis uppercase text-muted-foreground">
              Port
            </th>
            <th className="px-4 py-2 text-left text-xs font-emphasis uppercase text-muted-foreground">
              Protocol
            </th>
            <th className="px-4 py-2 text-left text-xs font-emphasis uppercase text-muted-foreground">
              Service
            </th>
            <th className="px-4 py-2 text-left text-xs font-emphasis uppercase text-muted-foreground">
              Banner
            </th>
            <th className="px-4 py-2 text-left text-xs font-emphasis uppercase text-muted-foreground">
              Status
            </th>
            <th className="px-4 py-2 text-left text-xs font-emphasis uppercase text-muted-foreground">
              Comment
            </th>
            <th className="px-4 py-2 text-left text-xs font-emphasis uppercase text-muted-foreground">
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
              <td className="px-4 py-2 font-mono text-sm text-primary">
                <span className="flex items-center gap-1.5">
                  {port.port}
                  {isRecentPort(port.first_seen_at) && (
                    <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-emphasis text-primary">
                      New
                    </span>
                  )}
                </span>
              </td>
              <td className="px-4 py-2 text-sm text-muted-foreground uppercase">
                {port.protocol}
              </td>
              <td className="px-4 py-2 text-sm text-foreground">
                {port.service_guess ?? "-"}
              </td>
              <td className="px-4 py-2 text-sm text-muted-foreground truncate max-w-xs">
                {port.banner ?? "-"}
              </td>
              <td className="px-4 py-2">
                {port.rule_status ? (
                  <StatusBadge
                    label={port.rule_status}
                    variant={
                      port.rule_status === "accepted" ? "success" : "danger"
                    }
                  />
                ) : port.alert_severity ? (
                  <SeverityBadge
                    severity={
                      port.alert_severity as
                        | "critical"
                        | "high"
                        | "medium"
                        | "info"
                    }
                  />
                ) : (
                  <StatusBadge label="Unreviewed" variant="neutral" />
                )}
              </td>
              <td className="px-4 py-2">
                <InlineTextCell
                  value={port.user_comment}
                  onSave={(val) =>
                    commentMutation.mutate({ portId: port.id, comment: val })
                  }
                  saveLabel="Save comment"
                  placeholder="Add comment..."
                  isPending={commentMutation.isPending}
                />
              </td>
              <td className="px-4 py-2 text-sm text-muted-foreground">
                {formatRelativeTime(port.last_seen_at)}
              </td>
            </tr>
          ))}
          {ports.length === 0 && (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-8 text-center text-sm text-muted-foreground"
              >
                No open ports
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
