import { useFormContext } from "react-hook-form";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  useLibraryEntries,
  useScannerMirror,
} from "@/features/gvm-library/hooks/useGvmLibrary";
import type { GvmKind } from "@/lib/types";
import type { NetworkFormData } from "./networkFormSchema";

interface GvmDropdownOptions {
  library: string[];
  scanner: string[];
}

function buildGvmDropdownOptions(
  _kind: GvmKind,
  libraryEntries: ReadonlyArray<{ name: string }>,
  mirrorEntries: ReadonlyArray<{ name: string }>,
): GvmDropdownOptions {
  const library = [...libraryEntries].map((e) => e.name).sort();
  const librarySet = new Set(library);
  const scanner = [...mirrorEntries]
    .map((e) => e.name)
    .filter((name) => !librarySet.has(name))
    .sort();
  return { library, scanner };
}

interface GvmConfigSectionProps {
  scannerId: number;
  scanConfig: string;
  onScanConfigChange: (value: string) => void;
  portList: string;
  onPortListChange: (value: string) => void;
}

export function GvmConfigSection({
  scannerId,
  scanConfig,
  onScanConfigChange,
  portList,
  onPortListChange,
}: GvmConfigSectionProps) {
  const { register } = useFormContext<NetworkFormData>();

  const libraryScanConfigs = useLibraryEntries("scan_config");
  const libraryPortLists = useLibraryEntries("port_list");
  const scannerMirrorConfigs = useScannerMirror(scannerId, "scan_config", {
    enabled: scannerId > 0,
  });
  const scannerMirrorPortLists = useScannerMirror(scannerId, "port_list", {
    enabled: scannerId > 0,
  });

  const scanConfigOptions = buildGvmDropdownOptions(
    "scan_config",
    libraryScanConfigs.data?.entries ?? [],
    scannerMirrorConfigs.data?.entries ?? [],
  );
  const portListOptions = buildGvmDropdownOptions(
    "port_list",
    libraryPortLists.data?.entries ?? [],
    scannerMirrorPortLists.data?.entries ?? [],
  );

  const noOptions =
    scanConfigOptions.library.length === 0 &&
    scanConfigOptions.scanner.length === 0;

  return (
    <>
      <div>
        <Label htmlFor="gvm_scan_config">GVM Scan Config</Label>
        <Select
          id="gvm_scan_config"
          value={scanConfig}
          onChange={(e) => onScanConfigChange(e.target.value)}
        >
          {scanConfigOptions.library.length > 0 && (
            <optgroup label="Library">
              {scanConfigOptions.library.map((name) => (
                <option key={`lib-${name}`} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
          {scanConfigOptions.scanner.length > 0 && (
            <optgroup label="Scanner Built-in / Live">
              {scanConfigOptions.scanner.map((name) => (
                <option key={`scn-${name}`} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
          {noOptions && (
            <>
              <option value="Full and fast">Full and fast</option>
              <option value="Full and deep">Full and deep</option>
              <option value="Discovery">Discovery</option>
              <option value="System Discovery">System Discovery</option>
            </>
          )}
        </Select>
      </div>

      <div>
        <Label htmlFor="gvm_port_list">GVM Port List (optional)</Label>
        <Select
          id="gvm_port_list"
          value={portList}
          onChange={(e) => onPortListChange(e.target.value)}
        >
          <option value="">(use custom port range from field above)</option>
          {portListOptions.library.length > 0 && (
            <optgroup label="Library">
              {portListOptions.library.map((name) => (
                <option key={`lib-${name}`} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
          {portListOptions.scanner.length > 0 && (
            <optgroup label="Scanner Built-in / Live">
              {portListOptions.scanner.map((name) => (
                <option key={`scn-${name}`} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {portList ? (
            <>
              <span className="text-foreground/80 font-emphasis">Active:</span>{" "}
              scanner will pass <code>port_list_id</code> to GVM. The Port
              Specification above is ignored.
            </>
          ) : (
            <>
              Leave empty to use the raw Port Specification field at the top of
              the form. Pick a GVM port list to override.
            </>
          )}
        </p>
      </div>

      <div className="rounded-md border border-border/40 bg-card/40 p-3">
        <label className="flex items-center gap-2 text-sm font-emphasis">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border/50 bg-background"
            {...register("gvm_keep_reports")}
          />
          Keep GVM reports after scan
        </label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          When enabled (default), the scanner leaves task, target, and report
          in the Greenbone instance so you can inspect them in the GSA web UI.
          Uncheck to have the scanner delete them after each run.
        </p>
      </div>
    </>
  );
}
