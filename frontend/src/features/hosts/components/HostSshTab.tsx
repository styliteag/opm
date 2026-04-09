import { Download } from "lucide-react";

import { StatusBadge } from "@/components/data-display/StatusBadge";
import { Button } from "@/components/ui/button";
import type { AlertSSHSummary } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function HostSshTab({ ssh }: { ssh: AlertSSHSummary | null }) {
  if (!ssh) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        No SSH data available for this host
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open("/api/ssh/export/pdf", "_blank")}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export SSH Report
        </Button>
      </div>
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-strong text-foreground mb-4">
          SSH Security Assessment
        </h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ssh.ssh_version && (
            <div>
              <dt className="text-xs text-muted-foreground">SSH Version</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {ssh.ssh_version}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-foreground">Public Key Auth</dt>
            <dd className="mt-1">
              <StatusBadge
                label={ssh.publickey_enabled ? "Enabled" : "Disabled"}
                variant={ssh.publickey_enabled ? "success" : "warning"}
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Password Auth</dt>
            <dd className="mt-1">
              <StatusBadge
                label={ssh.password_enabled ? "Enabled" : "Disabled"}
                variant={ssh.password_enabled ? "warning" : "success"}
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Keyboard Interactive
            </dt>
            <dd className="mt-1">
              <StatusBadge
                label={
                  ssh.keyboard_interactive_enabled ? "Enabled" : "Disabled"
                }
                variant={
                  ssh.keyboard_interactive_enabled ? "warning" : "success"
                }
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Weak Ciphers</dt>
            <dd className="mt-1">
              <StatusBadge
                label={ssh.has_weak_ciphers ? "Found" : "None"}
                variant={ssh.has_weak_ciphers ? "danger" : "success"}
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Weak Key Exchange</dt>
            <dd className="mt-1">
              <StatusBadge
                label={ssh.has_weak_kex ? "Found" : "None"}
                variant={ssh.has_weak_kex ? "danger" : "success"}
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Last Scanned</dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {formatDate(ssh.last_scanned)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
