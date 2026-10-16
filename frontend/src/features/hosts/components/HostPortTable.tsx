import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { FindingsList } from "@/features/hosts/components/FindingsList";
import {
  splitFindings,
  sshSummaryBullets,
  type HostFinding,
  type HostPortRow,
} from "@/features/hosts/lib/hostFindings";
import { PortStatusPill } from "@/features/ports/components/PortStatusPill";
import { PortTriageActions } from "@/features/ports/components/PortTriageActions";
import { WhyCell } from "@/features/ports/components/WhyCell";
import { usePortComment } from "@/features/ports/hooks/usePorts";
import { formatRelativeTime } from "@/lib/utils";

interface HostPortTableProps {
  rows: HostPortRow[];
  findingsByPort: Map<number | null, HostFinding[]>;
}

const TH =
  "px-3 py-2 text-left text-xs font-emphasis uppercase tracking-wider text-muted-foreground";

function FindingsSummary({ findings }: { findings: HostFinding[] }) {
  const { important, info } = splitFindings(findings);
  if (important.length > 0)
    return (
      <span className="text-orange-400">{important.length} important</span>
    );
  if (info.length > 0)
    return <span className="text-muted-foreground">{info.length} info</span>;
  return <span className="text-muted-foreground">—</span>;
}

function PortDetails({
  row,
  findings,
}: {
  row: HostPortRow;
  findings: HostFinding[];
}) {
  const { port } = row;
  const ssh = port.ssh_summary ? sshSummaryBullets(port.ssh_summary) : [];
  return (
    <div className="space-y-3 py-1">
      <FindingsList findings={findings} />
      {ssh.length > 0 && (
        <div>
          <p className="text-xs uppercase text-muted-foreground">SSH check</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-secondary-foreground">
            {ssh.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {port.banner && (
          <>
            Banner: <span className="font-mono">{port.banner}</span> ·{" "}
          </>
        )}
        First seen {formatRelativeTime(port.first_seen_at)} · last seen{" "}
        {formatRelativeTime(port.last_seen_at)}
        {port.is_stale && " · not seen in the latest scan"}
      </p>
    </div>
  );
}

/** Host ports (prototype A): status, Why, findings summary, expand for evidence. */
export function HostPortTable({ rows, findingsByPort }: HostPortTableProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const comment = usePortComment();

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        No open ports
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-card">
          <tr className="border-b border-border">
            <th className="w-8" />
            <th className={TH}>Port</th>
            <th className={TH}>Service</th>
            <th className={TH}>Status</th>
            <th className={TH}>Why</th>
            <th className={TH}>Findings</th>
            <th className={TH}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { port } = row;
            const findings = findingsByPort.get(port.port) ?? [];
            const isOpen = expanded.has(port.id);
            const needsDecision =
              row.status === "new" || row.status === "review";
            return (
              <Fragment key={port.id}>
                <tr
                  data-testid="host-port-row"
                  className="border-b border-border last:border-b-0 hover:bg-accent/40"
                >
                  <td className="pl-2">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Collapse" : "Expand"} port ${port.port}`}
                      onClick={() => toggle(port.id)}
                      className="cursor-pointer rounded-sm p-1 text-muted-foreground hover:text-foreground"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {port.port}
                    <span className="text-muted-foreground">
                      /{port.protocol}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {port.service_guess ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <PortStatusPill status={row.status} />
                  </td>
                  <td className="max-w-64 px-3 py-2">
                    <WhyCell
                      value={row.why}
                      editing={editingId === port.id}
                      onEdit={() => setEditingId(port.id)}
                      onCancel={() => setEditingId(null)}
                      onSave={(value) => saveWhy(port.id, value)}
                      pending={comment.isPending}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    <FindingsSummary findings={findings} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {needsDecision && row.openAlertIds.length > 0 && (
                      <PortTriageActions
                        alertIds={row.openAlertIds}
                        target={`${port.ip}:${port.port}`}
                      />
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-border bg-card/50 last:border-b-0">
                    <td />
                    <td colSpan={6} className="px-3 py-2">
                      <PortDetails row={row} findings={findings} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
