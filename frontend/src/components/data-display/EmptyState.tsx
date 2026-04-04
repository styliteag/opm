import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}

export function EmptyState({
  title = "No data",
  message = "Nothing to show here yet.",
  icon: Icon = Inbox,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="mb-3 h-10 w-10 text-muted-foreground" />
      <h3 className="text-sm font-emphasis text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
