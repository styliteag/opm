import { parseUTC } from "@/lib/utils";
import { useScanLogs } from "../hooks/useScans";

/** Raw scanner output for debugging; lives behind advanced settings. */
export function ScanEngineLogs({ scanId }: { scanId: number }) {
  const logs = useScanLogs(scanId);
  const list = logs.data?.logs ?? [];
  return (
    <div className="max-h-[40rem] overflow-y-auto rounded-lg border border-border p-4 font-mono text-xs">
      {list.length === 0 ? (
        <p className="text-muted-foreground">No logs available</p>
      ) : (
        list.map((log, i) => (
          <div key={i} className="flex gap-3 py-0.5">
            <span className="shrink-0 text-muted-foreground">
              {parseUTC(log.timestamp).toLocaleTimeString()}
            </span>
            <span
              className={
                log.level === "ERROR"
                  ? "text-red-400"
                  : log.level === "WARNING"
                    ? "text-yellow-400"
                    : "text-foreground"
              }
            >
              {log.message}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
