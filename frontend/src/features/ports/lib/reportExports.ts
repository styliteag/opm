import { downloadAuthenticated } from "@/lib/download";
import type { UserRole } from "@/stores/auth.store";

export interface ReportExport {
  label: string;
  path: string;
  filename: string;
  /** Lowest role the backend endpoint accepts. */
  minRole: UserRole;
}

/** Whole-inventory reports offered in the Ports page options menu. */
export const REPORT_EXPORTS: readonly ReportExport[] = [
  {
    label: "Export hosts (CSV)",
    path: "/api/hosts/export/csv",
    filename: "hosts.csv",
    minRole: "analyst",
  },
  {
    label: "Export hosts (PDF)",
    path: "/api/hosts/export/pdf",
    filename: "hosts.pdf",
    minRole: "analyst",
  },
  {
    label: "Export SSH report (PDF)",
    path: "/api/ssh/export/pdf",
    filename: "ssh-report.pdf",
    minRole: "viewer",
  },
  {
    label: "Export SSH report (CSV)",
    path: "/api/ssh/export/csv",
    filename: "ssh-report.csv",
    minRole: "viewer",
  },
];

export function downloadReport(report: ReportExport): Promise<void> {
  return downloadAuthenticated(report.path, report.filename);
}
