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

export const Route = createFileRoute("/_authenticated/settings/rules")({
  validateSearch: (search: Record<string, unknown>): { tab?: RulesTab } => ({
    tab: parseRulesTab(search.tab),
  }),
  component: RulesPage,
});

/**
 * Settings → Rules: expected/always-critical port rules, per-finding
 * severity rules, and the global SSH alert defaults. Each tab renders the
 * former standalone page unchanged.
 */
function RulesPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const activeTab: RulesTab = tab ?? "ports";

  return (
    <div className="space-y-4">
      <HubTabs
        tabs={RULES_TABS}
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
