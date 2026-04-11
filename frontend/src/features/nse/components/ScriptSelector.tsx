import { useCallback, useMemo, useState } from "react";
import {
  Search,
  ChevronRight,
  ChevronDown,
  CheckSquare,
  Square,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useNseScripts } from "@/features/nse/hooks/useNse";
import { getProtocol } from "@/features/nse/lib/scriptProtocol";

type FilterMode = "all" | "selected" | "unselected";

interface ScriptItem {
  name: string;
  author: string;
  protocol: string;
  tags: string[];
}

/** Build ScriptItem list from API data. */
function buildScriptItems(
  scripts: { name: string; categories?: string[]; author?: string }[],
): ScriptItem[] {
  return scripts.map((s) => ({
    name: s.name,
    author: s.author || "System",
    protocol: getProtocol(s.name),
    tags: s.categories ?? [],
  }));
}

/** Group scripts by protocol, sorted by protocol name. */
function groupByProtocol(
  items: ScriptItem[],
): { protocol: string; scripts: ScriptItem[] }[] {
  const map = new Map<string, ScriptItem[]>();
  for (const item of items) {
    const list = map.get(item.protocol) ?? [];
    list.push(item);
    map.set(item.protocol, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === "*") return -1;
      if (b === "*") return 1;
      return a.localeCompare(b);
    })
    .map(([protocol, scripts]) => ({
      protocol,
      scripts: scripts.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

interface ScriptSelectorProps {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Initial expanded groups (e.g. groups containing pre-selected scripts). */
  initiallyExpanded?: Set<string>;
}

export function ScriptSelector({
  selected,
  onChange,
  initiallyExpanded,
}: ScriptSelectorProps) {
  const { data: scriptsData } = useNseScripts();

  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [groupByProto, setGroupByProto] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    initiallyExpanded ?? new Set(),
  );

  const allItems = useMemo(
    () => buildScriptItems(scriptsData?.scripts ?? []),
    [scriptsData],
  );
  const totalCount = allItems.length;

  const filteredItems = useMemo(() => {
    let items = allItems;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.author.toLowerCase().includes(q) ||
          s.protocol.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (filterMode === "selected") {
      items = items.filter((s) => selected.has(s.name));
    } else if (filterMode === "unselected") {
      items = items.filter((s) => !selected.has(s.name));
    }
    return items;
  }, [allItems, search, filterMode, selected]);

  const grouped = useMemo(
    () => groupByProtocol(filteredItems),
    [filteredItems],
  );

  const toggleScript = useCallback(
    (scriptName: string) => {
      const next = new Set(selected);
      if (next.has(scriptName)) next.delete(scriptName);
      else next.add(scriptName);
      onChange(next);
    },
    [selected, onChange],
  );

  const toggleGroup = useCallback(
    (scripts: ScriptItem[]) => {
      const next = new Set(selected);
      const allSelected = scripts.every((s) => next.has(s.name));
      if (allSelected) {
        scripts.forEach((s) => next.delete(s.name));
      } else {
        scripts.forEach((s) => next.add(s.name));
      }
      onChange(next);
    },
    [selected, onChange],
  );

  const toggleExpand = useCallback((protocol: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(protocol)) next.delete(protocol);
      else next.add(protocol);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedGroups(new Set(grouped.map((g) => g.protocol)));
  }, [grouped]);

  const collapseAll = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);

  const selectAll = useCallback(() => {
    onChange(new Set(allItems.map((s) => s.name)));
  }, [allItems, onChange]);

  const clearAll = useCallback(() => {
    onChange(new Set());
  }, [onChange]);

  return (
    <div className="flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm font-strong text-foreground">
            NSE Scripts ({selected.size} of {totalCount} selected)
          </span>
          <p className="text-xs text-muted-foreground">
            Choose which NSE scripts to include in this profile
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={selectAll}
            className="h-7 text-xs gap-1"
          >
            <CheckSquare className="h-3 w-3" />
            Select All
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearAll}
            className="h-7 text-xs gap-1"
          >
            <Square className="h-3 w-3" />
            Clear
          </Button>
        </div>
      </div>

      {/* Search + Filter Tabs */}
      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1">
          <Search
            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            aria-label="Search NSE scripts"
            placeholder="Search scripts by name, description, tags, or author..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex rounded-md border border-border overflow-hidden shrink-0">
          {(["all", "selected", "unselected"] as FilterMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilterMode(mode)}
              aria-pressed={filterMode === mode}
              className={`cursor-pointer px-3 py-1.5 text-xs font-emphasis transition-colors ${
                filterMode === mode
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground"
              } ${mode !== "all" ? "border-l border-border" : ""}`}
            >
              {mode === "all"
                ? "All"
                : mode === "selected"
                  ? `Selected (${selected.size})`
                  : "Unselected"}
            </button>
          ))}
        </div>
      </div>

      {/* Group by protocol toggle + Expand/Collapse */}
      <div className="flex items-center justify-between mb-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={groupByProto}
            onCheckedChange={(checked) => setGroupByProto(checked === true)}
          />
          <span className="text-sm text-foreground">Group by protocol</span>
        </label>
        {groupByProto && (
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={expandAll}
              className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
            >
              Collapse All
            </button>
          </div>
        )}
      </div>

      {/* Script List */}
      <div className="overflow-y-auto rounded-md border border-border bg-background max-h-[320px]">
        {filteredItems.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground text-center">
            No scripts found
          </p>
        ) : groupByProto ? (
          grouped.map(({ protocol, scripts }) => {
            const isExpanded = expandedGroups.has(protocol);
            const selectedInGroup = scripts.filter((s) =>
              selected.has(s.name),
            ).length;
            const allSelected = selectedInGroup === scripts.length;
            const someSelected = selectedInGroup > 0 && !allSelected;

            return (
              <div
                key={protocol}
                className="border-b border-border last:border-b-0"
              >
                <div className="flex items-center gap-2 px-3 py-2 hover:bg-accent/50 cursor-pointer select-none">
                  <button
                    type="button"
                    onClick={() => toggleExpand(protocol)}
                    aria-label={`${isExpanded ? "Collapse" : "Expand"} ${protocol} group`}
                    className="shrink-0 cursor-pointer"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                  <Checkbox
                    aria-label={`Toggle all ${protocol} scripts`}
                    checked={
                      allSelected
                        ? true
                        : someSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={() => toggleGroup(scripts)}
                  />
                  <button
                    type="button"
                    onClick={() => toggleExpand(protocol)}
                    className="flex items-center gap-2 flex-1 text-left cursor-pointer"
                  >
                    <span className="text-xs font-emphasis text-primary">
                      {protocol}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {scripts.length} script
                      {scripts.length !== 1 ? "s" : ""}
                    </span>
                    {selectedInGroup > 0 && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-strong text-primary">
                        {selectedInGroup} selected
                      </span>
                    )}
                  </button>
                  <span className="text-[10px] text-muted-foreground">
                    {isExpanded ? "Click to collapse" : "Click to expand"}
                  </span>
                </div>

                {isExpanded && (
                  <div className="border-t border-border/50">
                    <ScriptTable
                      scripts={scripts}
                      selected={selected}
                      onToggle={toggleScript}
                    />
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <ScriptTable
            scripts={[...filteredItems].sort((a, b) =>
              a.name.localeCompare(b.name),
            )}
            selected={selected}
            onToggle={toggleScript}
            sticky
          />
        )}
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        {selected.size} scripts selected
      </p>
    </div>
  );
}

interface ScriptTableProps {
  scripts: ScriptItem[];
  selected: Set<string>;
  onToggle: (name: string) => void;
  sticky?: boolean;
}

function ScriptTable({ scripts, selected, onToggle, sticky }: ScriptTableProps) {
  return (
    <table className="w-full">
      <thead>
        <tr
          className={`border-b border-border bg-accent/30 ${sticky ? "sticky top-0" : ""}`}
        >
          <th className="w-10 px-3 py-1.5" />
          <th className="px-3 py-1.5 text-left text-xs font-strong text-foreground">
            Name
          </th>
          <th className="px-3 py-1.5 text-left text-xs font-strong text-foreground">
            Author
          </th>
          <th className="px-3 py-1.5 text-left text-xs font-strong text-foreground">
            Protocol
          </th>
          <th className="px-3 py-1.5 text-left text-xs font-strong text-foreground">
            Tags
          </th>
        </tr>
      </thead>
      <tbody>
        {scripts.map((script) => (
          <tr
            key={script.name}
            onClick={() => onToggle(script.name)}
            className="border-b border-border/30 last:border-b-0 hover:bg-accent/40 cursor-pointer"
          >
            <td className="px-3 py-1.5">
              <Checkbox
                aria-label={`Select ${script.name}`}
                checked={selected.has(script.name)}
                onCheckedChange={() => onToggle(script.name)}
              />
            </td>
            <td className="px-3 py-1.5 text-xs text-foreground">
              {script.name}
            </td>
            <td className="px-3 py-1.5 text-xs text-muted-foreground">
              {script.author}
            </td>
            <td className="px-3 py-1.5">
              <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-emphasis text-primary">
                {script.protocol}
              </span>
            </td>
            <td className="px-3 py-1.5">
              <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-emphasis text-primary">
                {script.tags.length > 0 ? script.tags[0] : script.protocol}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

