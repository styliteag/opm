import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { hasHomeFilters, type HomeFilters } from "@/features/home/lib/homeFilters";

const SEARCH_DEBOUNCE_MS = 300;

interface HomeFilterBarProps {
  value: HomeFilters;
  networks: readonly { id: number; name: string }[];
  onChange: (filters: HomeFilters) => void;
}

/** Network + text filter for the Home queue and findings (server-side alert params). */
export function HomeFilterBar({ value, networks, onChange }: HomeFilterBarProps) {
  const current = value.search ?? "";
  const [text, setText] = useState(current);
  // Last search this bar reported or received; a differing prop is an outside change.
  const [synced, setSynced] = useState(current);
  if (current !== synced) {
    setSynced(current);
    setText(current);
  }

  useEffect(() => {
    const next = text.trim();
    if (next === synced) return;
    const timer = setTimeout(() => {
      setSynced(next);
      onChange({ ...value, search: next || undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, synced, value, onChange]);

  const clear = () => {
    setText("");
    setSynced("");
    onChange({});
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          aria-label="Search the queue"
          placeholder="IP, port or hostname…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-64 rounded-md border border-border bg-background py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <Select
        aria-label="Network"
        className="w-48"
        value={value.network_id ?? ""}
        onChange={(e) =>
          onChange({
            ...value,
            network_id: e.target.value ? Number(e.target.value) : undefined,
          })
        }
      >
        <option value="">All networks</option>
        {networks.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
      </Select>
      {hasHomeFilters(value) && (
        <Button variant="ghost" size="sm" onClick={clear} aria-label="Clear filters">
          <X />
          Clear
        </Button>
      )}
    </div>
  );
}
