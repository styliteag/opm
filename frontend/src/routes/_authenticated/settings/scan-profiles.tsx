import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { HubTabs } from "@/components/layout/HubTabs";
import { GvmLibraryPage } from "@/features/gvm-library/components/GvmLibraryPage";
import { NseLibraryPage } from "@/features/nse/components/NseLibraryPage";
import { NseProfilesPage } from "@/features/nse/components/NseProfilesPage";
import {
  parseScanProfileTab,
  SCAN_PROFILE_TABS,
  type ScanProfileTab,
} from "@/features/settings/settingsTabs";

export const Route = createFileRoute("/_authenticated/settings/scan-profiles")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: ScanProfileTab } => ({
    tab: parseScanProfileTab(search.tab),
  }),
  component: ScanProfilesPage,
});

/**
 * Settings → Scan profiles: everything that defines WHAT a scan checks —
 * vulnerability script (NSE) profiles, the script library with its editor,
 * and the deep scan (GVM) library.
 */
function ScanProfilesPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const activeTab: ScanProfileTab = tab ?? "nse";

  return (
    <div className="space-y-4">
      <HubTabs
        tabs={SCAN_PROFILE_TABS}
        active={activeTab}
        onChange={(key) =>
          void navigate({
            search: { tab: key === "nse" ? undefined : key },
            replace: true,
          })
        }
      />

      {activeTab === "nse" && <NseProfilesPage />}
      {activeTab === "scripts" && <NseLibraryPage />}
      {activeTab === "gvm" && <GvmLibraryPage />}
    </div>
  );
}
