import { Button } from "@/components/ui/button";

import { useFinalizeLogin, useLogin } from "../hooks/useLogin";

export function DevLoginButton() {
  const loginMutation = useLogin();
  const finalize = useFinalizeLogin();

  const email = import.meta.env.VITE_DEV_ADMIN_EMAIL;
  const password = import.meta.env.VITE_DEV_ADMIN_PASSWORD;

  if (import.meta.env.PROD || !email || !password) return null;

  const handleClick = () => {
    loginMutation.mutate(
      { email, password },
      {
        onSuccess: async (resp) => {
          if (resp.access_token) {
            await finalize(resp.access_token);
          }
        },
      },
    );
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={handleClick}
      disabled={loginMutation.isPending}
    >
      Dev Login (admin)
    </Button>
  );
}
