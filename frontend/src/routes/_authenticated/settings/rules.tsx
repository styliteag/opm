import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { HubTabs } from "@/components/layout/HubTabs";
import { SshAlertDefaultsPage } from "@/features/admin/components/SshAlertDefaultsPage";
import { AlertRulesPage } from "@/features/alert-rules/components/AlertRulesPage";
import {
  parseRulesTab,
  RULES_TABS,
  type RulesTab,
} from "@/features/settings/settingsTabs";
import { SeverityRulesPage } from "@/features/severity-rules/components/SeverityRulesPage";
import { useHasRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/settings/rules")({
  validateSearch: (search: Record<string, unknown>): { tab?: RulesTab } => ({
    tab: parseRulesTab(search.tab),
  }),
  component: RulesPage,
});

/**
 * Settings → Rules: Expected / Always critical port rules, finding rules
 * (accepted risks and severity changes), and the global SSH defaults.
 * SSH defaults are admin-only in the API, so the tab is hidden below admin.
 */
function RulesPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const isAdmin = useHasRole("admin");
  const tabs = isAdmin ? RULES_TABS : RULES_TABS.filter((t) => t.key !== "ssh");
  const requested: RulesTab = tab ?? "ports";
  const activeTab: RulesTab =
    requested === "ssh" && !isAdmin ? "ports" : requested;

  return (
    <div className="space-y-4">
      <HubTabs
        tabs={tabs}
        active={activeTab}
        onChange={(key) =>
          void navigate({
            search: { tab: key === "ports" ? undefined : key },
            replace: true,
          })
        }
      />

      {activeTab === "ports" && <AlertRulesPage />}
      {activeTab === "findings" && <SeverityRulesPage />}
      {activeTab === "ssh" && <SshAlertDefaultsPage />}
    </div>
  );
}
