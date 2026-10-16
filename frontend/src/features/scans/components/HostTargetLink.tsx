import { Link } from "@tanstack/react-router";

interface HostTargetLinkProps {
  ip: string;
  port?: number | null;
  hostId: number | undefined;
}

/** IP (and port) linking to the host page, or to a Ports search when the host is unknown. */
export function HostTargetLink({ ip, port, hostId }: HostTargetLinkProps) {
  const label = port != null ? `${ip}:${port}` : ip;
  const className =
    "font-mono text-sm text-foreground transition-colors hover:text-primary";
  if (hostId != null) {
    return (
      <Link
        to="/hosts/$hostId"
        params={{ hostId: String(hostId) }}
        className={className}
      >
        {label}
      </Link>
    );
  }
  return (
    <Link to="/ports" search={{ search: ip }} className={className}>
      {label}
    </Link>
  );
}
