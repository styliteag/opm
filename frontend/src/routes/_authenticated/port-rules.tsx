import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Globe,
  Network,
  ChevronDown,
  Power,
  PowerOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchApi, postApi, deleteApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/port-rules")({
  component: PortRulesPage,
});

interface PortRule {
  id: number;
  network_id: number | null;
  network_name?: string | null;
  rule_type: "accepted" | "critical";
  ip: string | null;
  port: string;
  source: string;
  alert_type: string | null;
  script_name: string | null;
  description: string | null;
  enabled: boolean;
  created_at: string;
}

interface PolicyResponse {
  rules: PortRule[];
}

type RuleSource = "port" | "ssh" | "nse";

const SSH_ALERT_TYPES = [
  {
    value: "ssh_insecure_auth",
    label: "Insecure Auth (password/keyboard-interactive)",
  },
  { value: "ssh_weak_cipher", label: "Weak Ciphers" },
  { value: "ssh_weak_kex", label: "Weak Key Exchange" },
  { value: "ssh_outdated_version", label: "Outdated SSH Version" },
  { value: "ssh_config_regression", label: "Configuration Regression" },
];

const NSE_ALERT_TYPES = [
  { value: "nse_vulnerability", label: "NSE Vulnerability" },
  { value: "nse_cve_detected", label: "CVE Detected" },
];

const SOURCE_BADGES: Record<string, { label: string; className: string }> = {
  port: { label: "Port", className: "bg-blue-500/10 text-blue-500" },
  ssh: { label: "SSH", className: "bg-amber-500/10 text-amber-500" },
  nse: { label: "NSE", className: "bg-purple-500/10 text-purple-500" },
};

function SourceBadge({ source }: { source: string }) {
  const badge = SOURCE_BADGES[source] ?? SOURCE_BADGES.port;
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

function usePortRules() {
  return useQuery({
    queryKey: ["policy", "rules"],
    queryFn: () => fetchApi<PolicyResponse>("/api/port-rules"),
  });
}

function GlobalRuleAddForm({ onAdded }: { onAdded: () => void }) {
  const [source, setSource] = useState<RuleSource>("port");
  const [port, setPort] = useState("");
  const [ip, setIp] = useState("");
  const [ruleType, setRuleType] = useState<"accepted" | "critical">("accepted");
  const [alertType, setAlertType] = useState("");
  const [scriptName, setScriptName] = useState("");
  const [description, setDescription] = useState("");

  const addRule = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      postApi("/api/port-rules", data),
    onSuccess: () => {
      toast.success("Rule added");
      setPort("");
      setIp("");
      setAlertType("");
      setScriptName("");
      setDescription("");
      onAdded();
    },
    onError: (e) => toast.error(e.message),
  });

  const selectClass =
    "rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  const canSubmit = source === "port" ? Boolean(port) : true; // SSH/NSE rules don't require port

  return (
    <div className="border-b border-border bg-accent/30 px-5 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Source
          </label>
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value as RuleSource);
              setAlertType("");
              setScriptName("");
            }}
            className={selectClass}
          >
            <option value="port">Port</option>
            <option value="ssh">SSH</option>
            <option value="nse">NSE</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Port{source !== "port" ? " (optional)" : ""}
          </label>
          <Input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder={source === "ssh" ? "22" : "80"}
            className="w-24 font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            IP (optional)
          </label>
          <Input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="192.168.1.1"
            className="w-36 font-mono"
          />
        </div>

        {source === "ssh" && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Alert Type (optional)
            </label>
            <select
              value={alertType}
              onChange={(e) => setAlertType(e.target.value)}
              className={selectClass}
            >
              <option value="">Any SSH alert</option>
              {SSH_ALERT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {source === "nse" && (
          <>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Alert Type (optional)
              </label>
              <select
                value={alertType}
                onChange={(e) => setAlertType(e.target.value)}
                className={selectClass}
              >
                <option value="">Any NSE alert</option>
                {NSE_ALERT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Script Name (optional)
              </label>
              <Input
                value={scriptName}
                onChange={(e) => setScriptName(e.target.value)}
                placeholder="http-vuln-cve2017-5638"
                className="w-52 font-mono"
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Type
          </label>
          <select
            value={ruleType}
            onChange={(e) =>
              setRuleType(e.target.value as "accepted" | "critical")
            }
            className={selectClass}
          >
            <option value="accepted">Accepted</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs text-muted-foreground mb-1">
            Description
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Why this rule exists"
          />
        </div>
        <Button
          size="sm"
          onClick={() =>
            addRule.mutate({
              port: port || undefined,
              ip: ip || undefined,
              rule_type: ruleType,
              description: description || undefined,
              source,
              alert_type: alertType || undefined,
              script_name: scriptName || undefined,
            })
          }
          disabled={!canSubmit || addRule.isPending}
        >
          {addRule.isPending ? "Adding..." : "Add"}
        </Button>
      </div>
    </div>
  );
}

function RuleRow({
  rule,
  onDelete,
  isDeleting,
  selected,
  onSelect,
}: {
  rule: PortRule;
  onDelete: () => void;
  isDeleting: boolean;
  selected: boolean;
  onSelect: (checked: boolean) => void;
}) {
  // Build extra criteria display
  const extraParts: string[] = [];
  if (rule.alert_type) {
    const label =
      SSH_ALERT_TYPES.find((t) => t.value === rule.alert_type)?.label ??
      NSE_ALERT_TYPES.find((t) => t.value === rule.alert_type)?.label ??
      rule.alert_type;
    extraParts.push(label);
  }
  if (rule.script_name) {
    extraParts.push(rule.script_name);
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-5 py-3 group transition-colors",
        selected && "bg-primary/5",
        !rule.enabled && "opacity-50",
      )}
    >
      <Checkbox checked={selected} onCheckedChange={(v) => onSelect(!!v)} />
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <SourceBadge source={rule.source} />
        <span className="font-mono text-sm text-foreground">
          {rule.ip ? `${rule.ip}:` : ""}
          {rule.port || "*"}
        </span>
        {extraParts.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {extraParts.join(" · ")}
          </span>
        )}
        <StatusBadge
          label={rule.rule_type}
          variant={rule.rule_type === "accepted" ? "success" : "danger"}
        />
        {!rule.enabled && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            disabled
          </span>
        )}
        {rule.description && (
          <span className="text-sm text-muted-foreground truncate">
            — {rule.description}
          </span>
        )}
      </div>
      <button
        onClick={onDelete}
        disabled={isDeleting}
        className="rounded p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50 cursor-pointer"
        title="Remove rule"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function RuleSection({
  title,
  icon,
  rules,
  scope,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onDelete,
  isDeleting,
  headerRight,
}: {
  title: string;
  icon: React.ReactNode;
  rules: PortRule[];
  scope: "global" | "network";
  selectedIds: Set<number>;
  onToggleSelect: (id: number, selected: boolean) => void;
  onToggleAll: (ids: number[], selected: boolean) => void;
  onDelete: (rule: PortRule, scope: "global" | "network") => void;
  isDeleting: boolean;
  headerRight?: React.ReactNode;
}) {
  const allSelected =
    rules.length > 0 && rules.every((r) => selectedIds.has(r.id));
  const someSelected = rules.some((r) => selectedIds.has(r.id));

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected && !allSelected}
            onCheckedChange={(v) =>
              onToggleAll(
                rules.map((r) => r.id),
                !!v,
              )
            }
          />
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="font-display text-sm font-semibold text-foreground">
              {title} ({rules.length})
            </h3>
          </div>
        </div>
        {headerRight}
      </div>
      {rules.length === 0 ? (
        <div className="p-5 text-sm text-muted-foreground">
          No rules configured.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              onDelete={() => onDelete(rule, scope)}
              isDeleting={isDeleting}
              selected={selectedIds.has(rule.id)}
              onSelect={(checked) => onToggleSelect(rule.id, checked)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PortRulesPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const { data, isLoading, error, refetch } = usePortRules();
  const qc = useQueryClient();

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["policy", "rules"] });

  const deleteRule = useMutation({
    mutationFn: ({ scope, id }: { scope: "global" | "network"; id: number }) =>
      deleteApi(`/api/port-rules/${scope}/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Rule removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkDelete = useMutation({
    mutationFn: (rule_ids: number[]) =>
      postApi("/api/port-rules/bulk-delete", { rule_ids }),
    onSuccess: (_, ids) => {
      invalidate();
      setSelectedIds(new Set());
      toast.success(`${ids.length} rule(s) deleted`);
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkEnable = useMutation({
    mutationFn: (rule_ids: number[]) =>
      postApi("/api/port-rules/bulk-enable", { rule_ids }),
    onSuccess: () => {
      invalidate();
      setSelectedIds(new Set());
      toast.success("Rules enabled");
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkDisable = useMutation({
    mutationFn: (rule_ids: number[]) =>
      postApi("/api/port-rules/bulk-disable", { rule_ids }),
    onSuccess: () => {
      invalidate();
      setSelectedIds(new Set());
      toast.success("Rules disabled");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (error)
    return <ErrorState message={error.message} onRetry={() => refetch()} />;

  const allRules = data?.rules ?? [];
  const globalRules = allRules.filter((r) => r.network_id === null);
  const networkRules = allRules.filter((r) => r.network_id !== null);

  const networkGroups = networkRules.reduce<Record<string, PortRule[]>>(
    (acc, rule) => {
      const key = rule.network_name ?? `Network #${rule.network_id}`;
      return {
        ...acc,
        [key]: [...(acc[key] ?? []), rule],
      };
    },
    {},
  );

  const handleDeleteConfirm = (rule: PortRule, scope: "global" | "network") => {
    if (
      window.confirm(`Remove this ${rule.source} rule? This cannot be undone.`)
    ) {
      deleteRule.mutate({ scope, id: rule.id });
    }
  };

  const toggleSelect = (id: number, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const toggleAll = (ids: number[], selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  };

  const selectedArray = Array.from(selectedIds);
  const isBulkPending =
    bulkDelete.isPending || bulkEnable.isPending || bulkDisable.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Alert Rules
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage global and per-network alert acceptance and criticality rules
            for port, SSH, and NSE alerts.
          </p>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-2">
          <span className="text-sm text-primary">
            {selectedIds.size} selected
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer">
              Bulk Actions
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                disabled={isBulkPending}
                onClick={() => bulkEnable.mutate(selectedArray)}
              >
                <Power className="h-3.5 w-3.5 mr-1.5" />
                Enable
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isBulkPending}
                onClick={() => bulkDisable.mutate(selectedArray)}
              >
                <PowerOff className="h-3.5 w-3.5 mr-1.5" />
                Disable
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                disabled={isBulkPending}
                onClick={() => {
                  if (
                    confirm(`Delete ${selectedIds.size} rule(s) permanently?`)
                  ) {
                    bulkDelete.mutate(selectedArray);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      {/* Global Rules */}
      <div>
        <RuleSection
          title="Global Rules"
          icon={<Globe className="h-4 w-4 text-muted-foreground" />}
          rules={globalRules}
          scope="global"
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          onDelete={handleDeleteConfirm}
          isDeleting={deleteRule.isPending}
          headerRight={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdd(!showAdd)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Rule
            </Button>
          }
        />
        {showAdd && (
          <GlobalRuleAddForm
            onAdded={() => {
              setShowAdd(false);
              invalidate();
            }}
          />
        )}
      </div>

      {/* Per-Network Rules */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-display text-lg font-semibold text-foreground">
            Per-Network Rules
          </h2>
        </div>

        {Object.keys(networkGroups).length === 0 ? (
          <div className="rounded-lg border border-border p-5 text-sm text-muted-foreground">
            No per-network rules configured.
          </div>
        ) : (
          Object.entries(networkGroups).map(([networkName, rules]) => (
            <RuleSection
              key={networkName}
              title={networkName}
              icon={null}
              rules={rules}
              scope="network"
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleAll={toggleAll}
              onDelete={handleDeleteConfirm}
              isDeleting={deleteRule.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}
