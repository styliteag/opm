import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  downloadReport,
  REPORT_EXPORTS,
} from "@/features/ports/lib/reportExports";
import { hasRole } from "@/lib/roles";
import { useAuthStore } from "@/stores/auth.store";

/** Ports page title with the whole-inventory export menu. */
export function PortsHeader() {
  const role = useAuthStore((s) => s.user?.role);
  const reports = REPORT_EXPORTS.filter((r) => hasRole(role, r.minRole));

  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-strong text-foreground">Ports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Which ports are open, which are new, and why.
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Ports options"
          render={<Button variant="ghost" size="icon-sm" />}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {reports.map((report) => (
            <DropdownMenuItem
              key={report.path}
              onClick={() => void downloadReport(report)}
            >
              {report.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
