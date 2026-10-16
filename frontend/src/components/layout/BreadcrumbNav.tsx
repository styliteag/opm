import { useRouterState } from "@tanstack/react-router";

import { useUser } from "@/features/admin/hooks/useAdmin";
import { useNetworks, useScanners } from "@/features/dashboard/hooks/useDashboardData";
import { useHostDetail } from "@/features/hosts/hooks/useHosts";

import { breadcrumbEntity, breadcrumbSegments } from "./breadcrumbs";

interface EntityCrumbsProps {
  pathname: string;
  id: number;
}

/** Detail pages show the entity's name from a shared query, not its id. */
export function Breadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const entity = breadcrumbEntity(pathname);
  switch (entity?.kind) {
    case "host":
      return <HostCrumbs pathname={pathname} id={entity.id} />;
    case "network":
      return <NetworkCrumbs pathname={pathname} id={entity.id} />;
    case "scanner":
      return <ScannerCrumbs pathname={pathname} id={entity.id} />;
    case "user":
      return <UserCrumbs pathname={pathname} id={entity.id} />;
    default:
      return <BreadcrumbTrail segments={breadcrumbSegments(pathname)} />;
  }
}

function HostCrumbs({ pathname, id }: EntityCrumbsProps) {
  const { data } = useHostDetail(id);
  const label = data ? (data.host.hostname ?? data.host.ip) : undefined;
  return <BreadcrumbTrail segments={breadcrumbSegments(pathname, label)} />;
}

function NetworkCrumbs({ pathname, id }: EntityCrumbsProps) {
  const { data } = useNetworks();
  const label = data?.networks.find((n) => n.id === id)?.name;
  return <BreadcrumbTrail segments={breadcrumbSegments(pathname, label)} />;
}

function ScannerCrumbs({ pathname, id }: EntityCrumbsProps) {
  const { data } = useScanners();
  const label = data?.scanners.find((s) => s.id === id)?.name;
  return <BreadcrumbTrail segments={breadcrumbSegments(pathname, label)} />;
}

function UserCrumbs({ pathname, id }: EntityCrumbsProps) {
  const { data } = useUser(id);
  return <BreadcrumbTrail segments={breadcrumbSegments(pathname, data?.email)} />;
}

function BreadcrumbTrail({ segments }: { segments: string[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      {segments.map((segment, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground">/</span>}
          <span
            className={
              i === segments.length - 1
                ? "font-emphasis text-foreground"
                : "text-muted-foreground"
            }
          >
            {segment}
          </span>
        </span>
      ))}
    </nav>
  );
}
