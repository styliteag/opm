import { useAuthStore, type UserRole } from "@/stores/auth.store";

const ROLE_LEVEL: Record<UserRole, number> = {
  viewer: 0,
  analyst: 1,
  operator: 2,
  admin: 3,
};

export function hasRole(
  userRole: UserRole | undefined,
  minRole: UserRole,
): boolean {
  if (!userRole) return false;
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[minRole];
}

/** Current user's role check, e.g. `useHasRole("operator")` for scan buttons. */
export function useHasRole(minRole: UserRole): boolean {
  return hasRole(useAuthStore((s) => s.user?.role), minRole);
}
