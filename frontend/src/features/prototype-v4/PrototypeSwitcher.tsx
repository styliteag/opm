// PROTOTYPE (UI v4) — throwaway. Delete once a variant wins; see NOTES.md.
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PrototypeVariant {
  key: string;
  label: string;
}

interface PrototypeSwitcherProps {
  variants: PrototypeVariant[];
  current: string;
}

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}

export function PrototypeSwitcher({ variants, current }: PrototypeSwitcherProps) {
  const navigate = useNavigate();
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );

  const go = (delta: number) => {
    const next = variants[(index + delta + variants.length) % variants.length];
    void navigate({
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        variant: next.key,
      })) as never,
      replace: true,
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(document.activeElement)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  const active = variants[index];
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border-2 border-fuchsia-500 bg-black px-2 py-1.5 text-sm text-white shadow-2xl">
      <button
        type="button"
        onClick={() => go(-1)}
        className="rounded-full p-1 hover:bg-white/10"
        aria-label="Previous variant"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-56 text-center font-emphasis">
        PROTOTYPE · {active.key} — {active.label}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        className="rounded-full p-1 hover:bg-white/10"
        aria-label="Next variant"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
