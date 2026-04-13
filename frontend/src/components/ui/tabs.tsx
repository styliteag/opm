import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className,
      )}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center text-text-quaternary group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default:
          "gap-0.5 rounded-lg border border-border-subtle bg-surface-2/50 p-[3px]",
        line: "gap-3 border-b border-border-subtle bg-transparent rounded-none pb-px",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        // Base layout & text
        "relative inline-flex h-[calc(100%-1px)] flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap px-2.5 py-1 text-sm font-emphasis transition-colors group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // Focus ring
        "focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        // ── Default (segmented) variant ──
        "rounded-md border border-transparent text-text-quaternary hover:text-text-secondary",
        "group-data-[variant=default]/tabs-list:data-active:border-border-standard group-data-[variant=default]/tabs-list:data-active:bg-surface-3 group-data-[variant=default]/tabs-list:data-active:text-text-primary group-data-[variant=default]/tabs-list:data-active:shadow-sm",
        // ── Line variant ──
        "group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:border-none group-data-[variant=line]/tabs-list:px-0.5 group-data-[variant=line]/tabs-list:pb-2",
        "group-data-[variant=line]/tabs-list:data-active:text-text-primary",
        // Line indicator — brand accent, not white
        "after:pointer-events-none after:absolute after:opacity-0 after:transition-opacity",
        "group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-1px] group-data-horizontal/tabs:after:h-0.5 group-data-horizontal/tabs:after:rounded-full group-data-horizontal/tabs:after:bg-brand-accent",
        "group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-vertical/tabs:after:rounded-full group-data-vertical/tabs:after:bg-brand-accent",
        "group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
