import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { FindingItem } from "@/features/hosts/components/FindingItem";
import {
  splitFindings,
  type HostFinding,
} from "@/features/hosts/lib/hostFindings";

/** Important findings first; informational ones folded behind a count (ADR 0013). */
export function FindingsList({ findings }: { findings: HostFinding[] }) {
  const [showInfo, setShowInfo] = useState(false);
  const { important, info } = splitFindings(findings);
  const Chevron = showInfo ? ChevronDown : ChevronRight;

  if (findings.length === 0) {
    return <p className="text-sm text-muted-foreground">No findings.</p>;
  }

  return (
    <div>
      {important.length > 0 && (
        <ul className="divide-y divide-border">
          {important.map((f) => (
            <FindingItem key={f.key} finding={f} />
          ))}
        </ul>
      )}
      {info.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showInfo}
            onClick={() => setShowInfo((v) => !v)}
            className="mt-1 inline-flex cursor-pointer items-center gap-1 rounded-sm py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Chevron className="h-3.5 w-3.5" />
            {showInfo ? "Hide" : "Show"} {info.length} informational finding
            {info.length === 1 ? "" : "s"}
          </button>
          {showInfo && (
            <ul className="divide-y divide-border">
              {info.map((f) => (
                <FindingItem key={f.key} finding={f} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
