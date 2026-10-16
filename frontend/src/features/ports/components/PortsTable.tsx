import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { PortStatusPill } from "@/features/ports/components/PortStatusPill";
import { PortTriageActions } from "@/features/ports/components/PortTriageActions";
import { WhyCell } from "@/features/ports/components/WhyCell";
import { usePortComment } from "@/features/ports/hooks/usePorts";
import type { GlobalOpenPort } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

interface PortsTableProps {
  ports: GlobalOpenPort[];
  networkNames: Map<number, string>;
}

const TH =
  "px-3 py-2 text-left text-xs font-emphasis uppercase tracking-wider text-muted-foreground";

/** Every open port with its v4 status, Why and inline triage. */
export function PortsTable({ ports, networkNames }: PortsTableProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const comment = usePortComment();

  const saveWhy = (portId: number, value: string) =>
    comment.mutate(
      { portId, comment: value },
      {
        onSuccess: () => {
          setEditingId(null);
          toast.success("Why saved");
        },
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-card">
          <tr className="border-b border-border">
            <th className={TH}>Status</th>
            <th className={TH}>Host</th>
            <th className={TH}>Port</th>
            <th className={TH}>Service</th>
            <th className={TH}>Why</th>
            <th className={TH}>Network</th>
            <th className={TH}>Last seen</th>
            <th className={TH}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ports.map((p) => {
            const status = p.status ?? "review";
            const target = `${p.ip}:${p.port}`;
            const networks = p.seen_by_networks
              .map((id) => networkNames.get(id))
              .filter(Boolean)
              .join(", ");
            return (
              <tr
                key={p.id}
                data-testid="port-row"
                className="border-b border-border last:border-b-0 hover:bg-accent/40"
              >
                <td className="px-3 py-2">
                  <PortStatusPill status={status} />
                </td>
                <td className="px-3 py-2">
                  {p.host_id ? (
                    <Link
                      to="/hosts/$hostId"
                      params={{ hostId: String(p.host_id) }}
                      className="font-mono text-primary hover:text-primary/80"
                    >
                      {p.ip}
                    </Link>
                  ) : (
                    <span className="font-mono">{p.ip}</span>
                  )}
                  {p.hostname && (
                    <p className="max-w-48 truncate text-xs text-muted-foreground">
                      {p.hostname}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2 font-mono">
                  {p.port}
                  <span className="text-muted-foreground">/{p.protocol}</span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {p.service_guess ?? "—"}
                </td>
                <td className="max-w-64 px-3 py-2">
                  <WhyCell
                    value={p.why}
                    editing={editingId === p.id}
                    onEdit={() => setEditingId(p.id)}
                    onCancel={() => setEditingId(null)}
                    onSave={(value) => saveWhy(p.id, value)}
                    pending={comment.isPending}
                  />
                </td>
                <td className="max-w-40 truncate px-3 py-2 text-muted-foreground">
                  {networks || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {formatRelativeTime(p.last_seen_at)}
                  {p.is_stale && (
                    <span
                      title="Not seen in the latest scan of its networks"
                      className="ml-1.5 rounded-md border border-border px-1.5 py-0.5 text-xs"
                    >
                      Stale
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {/* "To review" ports have no alert to decide on; the Why cell is their action. */}
                  {status === "new" && p.alert_id != null && (
                    <PortTriageActions
                      alertIds={[p.alert_id]}
                      target={target}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
