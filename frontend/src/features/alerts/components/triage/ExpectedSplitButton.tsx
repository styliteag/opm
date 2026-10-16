import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExpectedScope } from "@/features/alerts/hooks/useTriageActions";
import { EXPECTED_SCOPES, TRIAGE_ACTIONS } from "@/lib/terminology";

interface ExpectedSplitButtonProps {
  onExpected: (scope: ExpectedScope) => void;
  onExpectedWithReason: () => void;
  disabled?: boolean;
}

/** Expected = one click for "this host only"; the chevron offers wider scopes or a reason. */
export function ExpectedSplitButton({
  onExpected,
  onExpectedWithReason,
  disabled,
}: ExpectedSplitButtonProps) {
  return (
    <div className="inline-flex">
      <Button
        size="sm"
        className="rounded-r-none"
        title={TRIAGE_ACTIONS.expected.description}
        disabled={disabled}
        onClick={() => onExpected("host")}
      >
        <Check />
        {TRIAGE_ACTIONS.expected.label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          aria-label="More Expected options"
          render={
            <Button
              size="sm"
              className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
            />
          }
        >
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {(Object.keys(EXPECTED_SCOPES) as ExpectedScope[]).map(
            (scope) => (
              <DropdownMenuItem key={scope} onClick={() => onExpected(scope)}>
                {EXPECTED_SCOPES[scope]}
              </DropdownMenuItem>
            ),
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onExpectedWithReason}>
            Expected with reason…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
