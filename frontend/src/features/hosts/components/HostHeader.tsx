import { Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { HostComment } from "@/features/hosts/components/HostComment";
import { InlineHostname } from "@/features/hosts/components/InlineHostname";
import { useRescanHost } from "@/features/hosts/hooks/useHosts";
import type { Host, HostOverviewResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

interface HostHeaderProps {
  host: Host;
  networks: HostOverviewResponse["networks"];
  toReview: number;
  importantFindings: number;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function HostHeader({
  host,
  networks,
  toReview,
  importantFindings,
}: HostHeaderProps) {
  const rescan = useRescanHost();

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <Link
          to="/ports"
          search={{ tab: "hosts" }}
          aria-label="Back to hosts"
          className="mt-1 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 space-y-1">
          <InlineHostname
            hostId={host.id}
            hostname={host.hostname}
            ip={host.ip}
          />
          <p className="font-mono text-sm text-muted-foreground">
            {host.ip}
            {networks.map((n) => (
              <span key={n.id}>
                {" · "}
                <Link
                  to="/networks/$networkId"
                  params={{ networkId: String(n.id) }}
                  className="transition-colors hover:text-primary"
                >
                  {n.name}
                </Link>
              </span>
            ))}
          </p>
          <p className="text-sm">
            <span
              className={toReview > 0 ? "text-orange-400" : "text-emerald-400"}
            >
              {toReview > 0
                ? `${plural(toReview, "port")} to review`
                : "All ports explained"}
            </span>
            <span className="text-muted-foreground"> · </span>
            <span
              className={cn(
                importantFindings > 0
                  ? "text-red-400"
                  : "text-muted-foreground",
              )}
            >
              {plural(importantFindings, "important finding")}
            </span>
          </p>
          <HostComment hostId={host.id} comment={host.user_comment} />
        </div>
      </div>
      <Button
        disabled={rescan.isPending}
        onClick={() =>
          rescan.mutate(host.ip, {
            onSuccess: (resp) => toast.success(resp.message ?? "Scan started"),
            onError: (err) =>
              toast.error(err.message ?? "Failed to start scan"),
          })
        }
      >
        <RefreshCw className={cn(rescan.isPending && "animate-spin")} />
        {rescan.isPending ? "Starting…" : "Scan again"}
      </Button>
    </div>
  );
}
