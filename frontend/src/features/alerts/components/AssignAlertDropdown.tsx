import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchApi, patchApi } from "@/lib/api";

interface User {
  id: number;
  email: string;
  role: string;
}

interface AssignAlertDropdownProps {
  alertId: number;
  currentUserId: number | null;
  currentUserEmail: string | null;
}

export function AssignAlertDropdown({
  alertId,
  currentUserId,
  currentUserEmail,
}: AssignAlertDropdownProps) {
  const qc = useQueryClient();

  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => fetchApi<{ users: User[] }>("/api/users"),
  });

  const assign = useMutation({
    // Backend contract is AlertAssignRequest.user_id — the previous
    // assigned_to_user_id key was silently dropped and always unassigned.
    mutationFn: (userId: number | null) =>
      patchApi(`/api/alerts/${alertId}/assign`, {
        user_id: userId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      toast.success(currentUserId ? "Alert reassigned" : "Alert assigned");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <UserCircle className="h-3.5 w-3.5 mr-1.5" />
        {currentUserEmail ?? "Assign"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {currentUserId && (
          <>
            <DropdownMenuItem onClick={() => assign.mutate(null)}>
              Unassign
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {(users.data?.users ?? []).map((user) => (
          <DropdownMenuItem
            key={user.id}
            onClick={() => assign.mutate(user.id)}
            className={user.id === currentUserId ? "font-emphasis" : ""}
          >
            {user.email}
            <span className="ml-auto text-xs text-muted-foreground capitalize">
              {user.role}
            </span>
          </DropdownMenuItem>
        ))}
        {users.isLoading && (
          <DropdownMenuItem disabled>Loading users...</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
