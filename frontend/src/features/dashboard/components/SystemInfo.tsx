import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import { useSystemInfo } from "@/features/dashboard/hooks/useSystemInfo";

export function SystemInfo() {
  const { data, isLoading } = useSystemInfo();

  if (isLoading || !data) return null;

  const migrationOk = data.migration_status === "up to date";

  return (
    <Card className="backdrop-blur-sm" size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">System</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Backend</span>
          <span className="font-mono text-foreground">v{data.version}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Frontend</span>
          <span className="font-mono text-foreground">v{__APP_VERSION__}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">DB Migration</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-foreground">
              {data.migration_current ?? "—"}
            </span>
            <StatusBadge
              label={migrationOk ? "ok" : data.migration_status}
              variant={migrationOk ? "success" : "warning"}
              dot
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
