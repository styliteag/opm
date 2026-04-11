import { useFormContext } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { NetworkFormData } from "./networkFormSchema";

interface NucleiSettingsProps {
  enabled: boolean;
}

export function NucleiSettings({ enabled }: NucleiSettingsProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext<NetworkFormData>();

  return (
    <div className="rounded-md border border-border/40 bg-card/40 p-3">
      <label className="flex items-center gap-2 text-sm font-emphasis">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border/50 bg-background"
          {...register("nuclei_enabled")}
        />
        Vulnerability scanning (Nuclei)
      </label>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Runs nuclei against HTTP/HTTPS services discovered by the port scan.
        Available for masscan and nmap networks.
      </p>
      {enabled && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label htmlFor="nuclei_tags">Template tags (optional)</Label>
            <Input
              id="nuclei_tags"
              {...register("nuclei_tags")}
              placeholder="cves,exposures,misconfiguration"
              className="font-mono"
            />
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Comma-separated nuclei template tags. Leave empty to run all
              default tags.
            </p>
          </div>
          <div>
            <Label htmlFor="nuclei_severity">Minimum severity</Label>
            <Select id="nuclei_severity" {...register("nuclei_severity")}>
              <option value="">Default (medium)</option>
              <option value="info">Info</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="nuclei_timeout">
              Timeout (seconds, optional)
            </Label>
            <Input
              id="nuclei_timeout"
              type="number"
              min={60}
              max={7200}
              {...register("nuclei_timeout")}
              placeholder="1800"
            />
            {errors.nuclei_timeout && (
              <p className="mt-1 text-xs text-destructive">
                {errors.nuclei_timeout.message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
