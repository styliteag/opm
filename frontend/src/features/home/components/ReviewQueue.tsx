import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DeleteConfirmModal } from "@/features/alerts/components/DeleteConfirmModal";
import { ExpectedReasonDialog } from "@/features/alerts/components/triage/ExpectedReasonDialog";
import { useTriage } from "@/features/alerts/hooks/useTriage";
import { ReviewRow } from "@/features/home/components/ReviewRow";
import type { HomeQueueMode } from "@/features/home/hooks/useHomeData";
import { useQueueKeyboard } from "@/features/home/hooks/useQueueKeyboard";
import type { PortGroup } from "@/features/home/lib/homeQueue";
import { useHasRole } from "@/lib/roles";
import { NAV_V4, TRIAGE_ACTIONS } from "@/lib/terminology";

interface ReviewQueueProps {
  groups: PortGroup[];
  mode: HomeQueueMode;
  /** A network or search filter is active; the empty state must not claim "all explained". */
  filtered?: boolean;
  onOpenDetails: (alertId: number) => void;
  /** Off while the slide-over or a dialog owns the keyboard. */
  keyboardEnabled: boolean;
}

const idsOf = (groups: readonly PortGroup[]) =>
  groups.flatMap((g) => g.alertIds);

function severityCounts(groups: readonly PortGroup[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const alert of groups.flatMap((g) => g.alerts)) {
    counts[alert.severity] = (counts[alert.severity] ?? 0) + 1;
  }
  return counts;
}

export function ReviewQueue({
  groups,
  mode,
  filtered = false,
  onOpenDetails,
  keyboardEnabled,
}: ReviewQueueProps) {
  const triage = useTriage();
  // Snooze/Reopen/Assign: analyst+; Expected and Delete: operator+ (hidden, not disabled).
  const canTriage = useHasRole("analyst");
  const canDecide = useHasRole("operator");
  const inbox = mode === "inbox";
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [reasonTargets, setReasonTargets] = useState<PortGroup[] | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const active = groups.length === 0 ? -1 : Math.min(cursor, groups.length - 1);
  const selectedGroups = useMemo(
    () => groups.filter((g) => selected.has(g.key)),
    [groups, selected],
  );
  const clearSelection = () => setSelected(new Set());

  const toggle = (key: string) =>
    canTriage &&
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  useQueueKeyboard({
    enabled:
      keyboardEnabled &&
      reasonTargets === null &&
      !deleteOpen &&
      groups.length > 0,
    count: groups.length,
    active,
    setCursor,
    onToggle: (i) => toggle(groups[i].key),
    onOpen: (i) => onOpenDetails(groups[i].alertIds[0]),
    onExpected:
      inbox && canDecide
        ? (i) =>
            triage.markExpected({ alertIds: groups[i].alertIds, scope: "host" })
        : undefined,
    onSnooze:
      inbox && canTriage ? (i) => triage.snooze(groups[i].alertIds) : undefined,
  });

  if (groups.length === 0 && filtered) {
    return (
      <div className="rounded-lg border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        No {mode === "inbox" ? "new" : "snoozed or handled"} open ports match these filters.
      </div>
    );
  }

  if (groups.length === 0) {
    return mode === "inbox" ? (
      <div className="flex flex-col items-center rounded-lg border border-border bg-card px-6 py-12 text-center">
        <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500" />
        <h2 className="text-base font-emphasis text-foreground">
          Every open port has a reason
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          No new open ports need a decision.{" "}
          <Link to="/ports" className="text-primary hover:underline">
            See all {NAV_V4.ports.toLowerCase()}
          </Link>
        </p>
      </div>
    ) : (
      <div className="rounded-lg border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        No snoozed or handled open ports.
      </div>
    );
  }

  return (
    <section className="space-y-2" aria-label="Review queue">
      {selectedGroups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {selectedGroups.length} selected
          </span>
          {inbox ? (
            <>
              {canDecide && (
                <>
                  <Button
                    size="sm"
                    disabled={triage.pending}
                    onClick={() =>
                      triage.markExpected(
                        { alertIds: idsOf(selectedGroups), scope: "host" },
                        clearSelection,
                      )
                    }
                  >
                    {TRIAGE_ACTIONS.expected.label} (this host)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={triage.pending}
                    onClick={() => setReasonTargets(selectedGroups)}
                  >
                    {TRIAGE_ACTIONS.expected.label} with reason…
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={triage.pending}
                onClick={() =>
                  triage.snooze(idsOf(selectedGroups), clearSelection)
                }
              >
                {TRIAGE_ACTIONS.snooze.label}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={triage.pending}
              onClick={() =>
                triage.reopen(idsOf(selectedGroups), clearSelection)
              }
            >
              {TRIAGE_ACTIONS.reopen.label}
            </Button>
          )}
          {canDecide && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-destructive"
              disabled={triage.pending}
              onClick={() => setDeleteOpen(true)}
            >
              Delete…
            </Button>
          )}
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      <ul className="rounded-lg border border-border bg-card">
        {groups.map((group, i) => (
          <ReviewRow
            key={group.key}
            group={group}
            mode={mode}
            canTriage={canTriage}
            canDecide={canDecide}
            active={i === active}
            selected={selected.has(group.key)}
            disabled={triage.pending}
            onToggleSelect={() => toggle(group.key)}
            onOpenDetails={() => {
              setCursor(i);
              onOpenDetails(group.alertIds[0]);
            }}
            onExpected={(scope) =>
              triage.markExpected({ alertIds: group.alertIds, scope })
            }
            onExpectedWithReason={() => setReasonTargets([group])}
            onSnooze={() => triage.snooze(group.alertIds)}
            onReopen={() => triage.reopen(group.alertIds)}
            onAssign={(userId) => triage.assign(group.alertIds, userId)}
          />
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Keys: <kbd>j</kbd>/<kbd>k</kbd> move ·{" "}
        {canTriage && (
          <>
            <kbd>x</kbd> select ·{" "}
          </>
        )}
        {inbox && canDecide && (
          <>
            <kbd>e</kbd> {TRIAGE_ACTIONS.expected.label} ·{" "}
          </>
        )}
        {inbox && canTriage && (
          <>
            <kbd>s</kbd> {TRIAGE_ACTIONS.snooze.label} ·{" "}
          </>
        )}
        <kbd>Enter</kbd> details
      </p>

      <ExpectedReasonDialog
        open={reasonTargets !== null}
        onOpenChange={(open) => !open && setReasonTargets(null)}
        target={
          reasonTargets?.length === 1
            ? reasonTargets[0].key
            : `${reasonTargets?.length ?? 0} ports`
        }
        pending={triage.pending}
        onConfirm={({ scope, reason }) =>
          triage.markExpected(
            { alertIds: idsOf(reasonTargets ?? []), scope, reason },
            () => {
              setReasonTargets(null);
              clearSelection();
            },
          )
        }
      />
      <DeleteConfirmModal
        alertCount={idsOf(selectedGroups).length}
        severityCounts={severityCounts(selectedGroups)}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => triage.remove(idsOf(selectedGroups), clearSelection)}
      />
    </section>
  );
}
