import { Button } from "@/components/ui/button";

import { useLogin } from "../hooks/useLogin";

export function DevLoginButton() {
  const loginMutation = useLogin();

  const email = import.meta.env.VITE_DEV_ADMIN_EMAIL;
  const password = import.meta.env.VITE_DEV_ADMIN_PASSWORD;

  if (import.meta.env.PROD || !email || !password) return null;

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={() => loginMutation.mutate({ email, password })}
      disabled={loginMutation.isPending}
    >
      Dev Login (admin)
    </Button>
  );
}
