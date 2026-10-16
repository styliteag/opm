import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportAlerts } from "@/features/alerts/lib/exportAlerts";
import type { AlertExportScope } from "@/features/alerts/lib/exportAlerts";
import type { HomeQueueMode } from "@/features/home/hooks/useHomeData";
import { homeTitle, plural } from "@/features/home/lib/homeCopy";

const OPEN_EXPORTS: { scope: AlertExportScope; label: string }[] = [
  { scope: "open", label: "open" },
];
const HANDLED_EXPORTS: { scope: AlertExportScope; label: string }[] = [
  { scope: "snoozed", label: "snoozed" },
  { scope: "expected", label: "expected" },
];

interface HomeHeaderProps {
  mode: HomeQueueMode;
  onModeChange: (mode: HomeQueueMode) => void;
  portCount: number;
  findingCount: number;
}

export function HomeHeader({ mode, onModeChange, portCount, findingCount }: HomeHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-strong tracking-tight text-foreground">
          {homeTitle(mode, portCount)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {mode === "handled"
            ? `${portCount} open ${plural(portCount, "port", "ports")} · ${findingCount} important ${plural(findingCount, "finding", "findings")} — reopen to put them back in the queue`
            : `${findingCount} important ${plural(findingCount, "finding", "findings")}`}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Home options"
          render={<Button variant="ghost" size="icon-sm" />}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuCheckboxItem
            checked={mode === "handled"}
            onCheckedChange={(checked) => onModeChange(checked ? "handled" : "inbox")}
          >
            Show snoozed &amp; handled
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {(mode === "handled" ? HANDLED_EXPORTS : OPEN_EXPORTS).map(({ scope, label }) =>
            (["csv", "pdf"] as const).map((format) => (
              <DropdownMenuItem
                key={`${scope}-${format}`}
                onClick={() => void exportAlerts(format, scope)}
              >
                Export {label} ({format.toUpperCase()})
              </DropdownMenuItem>
            )),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
