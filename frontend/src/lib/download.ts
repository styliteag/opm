import { toast } from "sonner";

import { useAuthStore } from "@/stores/auth.store";

/**
 * Downloads a file from an authenticated endpoint (raw fetch: the payload is
 * a file, not JSON). A plain href would go out without the bearer token.
 */
export async function downloadAuthenticated(
  path: string,
  filename: string,
): Promise<void> {
  const token = useAuthStore.getState().token;
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    toast.error(`Export failed: ${res.statusText}`);
    return;
  }
  const blob = await res.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
