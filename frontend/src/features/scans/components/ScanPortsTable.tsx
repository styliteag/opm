import type { ScanDetail } from "../hooks/useScans";
import { HostTargetLink } from "./HostTargetLink";

interface ScanPortsTableProps {
  ports: ScanDetail["open_ports"];
  hostIds: Map<string, number>;
}

/** Open ports this scan found; IPs link to the host page when it exists. */
export function ScanPortsTable({ ports, hostIds }: ScanPortsTableProps) {
  if (ports.length === 0) return null;
  return (
    <section className="rounded-lg border border-border">
      <div className="border-b border-border bg-card px-4 py-3">
        <h3 className="text-sm font-strong text-foreground">
          Open ports found ({ports.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-4 py-2 font-emphasis">Host</th>
              <th className="px-4 py-2 font-emphasis">Port</th>
              <th className="px-4 py-2 font-emphasis">Protocol</th>
              <th className="px-4 py-2 font-emphasis">Service</th>
              <th className="px-4 py-2 font-emphasis">Banner</th>
            </tr>
          </thead>
          <tbody>
            {ports.map((port) => (
              <tr
                key={`${port.ip}:${port.port}/${port.protocol}`}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-2">
                  <HostTargetLink ip={port.ip} hostId={hostIds.get(port.ip)} />
                </td>
                <td className="px-4 py-2 font-mono text-sm text-primary">
                  {port.port}
                </td>
                <td className="px-4 py-2 text-sm uppercase text-muted-foreground">
                  {port.protocol}
                </td>
                <td className="px-4 py-2 text-sm text-foreground">
                  {port.service_guess ?? "—"}
                </td>
                <td className="max-w-xs truncate px-4 py-2 text-sm text-muted-foreground">
                  {port.banner ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
