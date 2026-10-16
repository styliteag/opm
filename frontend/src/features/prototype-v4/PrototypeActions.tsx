// PROTOTYPE (UI v4) — stub action buttons reused by the Host variants (phase 3 input).
import { useState } from "react";
import { Check, ChevronDown, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { WHY_QUICK_PICKS, stubAction } from "./protoData";

export function ExpectedButton({
  target,
  size = "sm",
}: {
  target: string;
  size?: "sm" | "default" | "lg";
}) {
  return (
    <div className="inline-flex">
      <Button
        size={size}
        className="rounded-r-none"
        onClick={() => stubAction(`Expected (this host): ${target}`)}
      >
        <Check className="h-4 w-4" />
        Expected
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size={size} className="rounded-l-none border-l border-white/20 px-2">
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => stubAction(`Expected (this host): ${target}`)}>
            This host only
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => stubAction(`Expected (network): ${target}`)}>
            All hosts in this network
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => stubAction(`Expected (everywhere): ${target}`)}>
            Everywhere
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function SnoozeButton({ target, size = "sm" }: { target: string; size?: "sm" | "default" | "lg" }) {
  return (
    <Button variant="outline" size={size} onClick={() => stubAction(`Snooze: ${target}`)}>
      <Clock className="h-4 w-4" />
      Snooze
    </Button>
  );
}

export function WhyPicker({ onPick }: { onPick?: (why: string) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap gap-1.5">
      {WHY_QUICK_PICKS.map((w) => (
        <button
          key={w}
          type="button"
          onClick={() => {
            setPicked(w);
            onPick?.(w);
          }}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
            picked === w
              ? "border-primary bg-primary/15 text-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {w}
        </button>
      ))}
    </div>
  );
}
