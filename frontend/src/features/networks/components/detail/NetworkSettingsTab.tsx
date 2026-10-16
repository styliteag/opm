import { Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { useNseProfiles } from "@/features/nse/hooks/useNse";
import type { Network } from "@/lib/types";
import { cn } from "@/lib/utils";
import { networkSettingsSections } from "../../lib/networkSettings";

interface NetworkSettingsTabProps {
  network: Network;
  scannerName: string;
  canOperate: boolean;
}

/** Read-only plain-language configuration + Edit (replaces Overview/Configuration tabs). */
export function NetworkSettingsTab({
  network,
  scannerName,
  canOperate,
}: NetworkSettingsTabProps) {
  const profiles = useNseProfiles();
  const nseProfile = profiles.data?.profiles.find(
    (p) => p.id === network.nse_profile_id,
  )?.name;
  const sections = networkSettingsSections(network, {
    scanner: scannerName,
    nseProfile,
  });

  return (
    <div className="space-y-4">
      {canOperate && (
        <div className="flex justify-end">
          <Link
            to="/networks/$networkId/edit"
            params={{ networkId: String(network.id) }}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Pencil />
            Edit settings
          </Link>
        </div>
      )}
      {sections.map((section) => (
        <section
          key={section.title}
          className="rounded-lg border border-border bg-card p-4"
        >
          <h3 className="mb-3 text-sm font-strong text-foreground">
            {section.title}
          </h3>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.rows.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd
                  className={cn(
                    "mt-0.5 break-words text-sm text-foreground",
                    row.mono && "font-mono",
                  )}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
