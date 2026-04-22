import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod/v4";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck, ShieldOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { useUser, useUserMutations } from "@/features/admin/hooks/useAdmin";
import { useAuthStore } from "@/stores/auth.store";
import type { UserRole } from "@/stores/auth.store";

export const Route = createFileRoute("/_authenticated/admin/users/$userId")({
  component: UserEditPage,
});

const schema = z.object({
  email: z.email("Valid email required"),
  role: z.enum(["admin", "operator", "analyst", "viewer"]),
  password: z
    .string()
    .refine((v) => v === "" || v.length >= 8, { message: "Min 8 characters" }),
  is_active: z.boolean(),
});

type FormData = z.infer<typeof schema>;

const roleVariant: Record<UserRole, "danger" | "warning" | "success" | "neutral"> = {
  admin: "danger",
  operator: "warning",
  analyst: "success",
  viewer: "neutral",
};

function UserEditPage() {
  const { userId } = Route.useParams();
  const id = Number(userId);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isSelf = id === currentUserId;

  const { data: user, isLoading, error, refetch } = useUser(id);
  const { update, reset2fa } = useUserMutations();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", role: "viewer", password: "", is_active: true },
  });

  useEffect(() => {
    if (user) {
      reset({ email: user.email, role: user.role, password: "", is_active: user.is_active });
    }
  }, [user, reset]);

  if (isLoading) return <LoadingState rows={6} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!user) return null;

  const onSubmit = (data: FormData) => {
    const payload: { id: number; email?: string; role?: UserRole; password?: string; is_active?: boolean } = {
      id,
      email: data.email,
      role: data.role as UserRole,
      is_active: data.is_active,
    };
    if (data.password) payload.password = data.password;

    update.mutate(payload, {
      onSuccess: () => {
        toast.success("User updated");
        reset({ ...data, password: "" });
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const handleReset2fa = () => {
    reset2fa.mutate(id, {
      onSuccess: () => toast.success("2FA reset — user will need to re-enrol"),
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/admin/users"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Users
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <h1 className="text-xl font-strong text-foreground truncate">{user.email}</h1>
        <StatusBadge label={user.role} variant={roleVariant[user.role]} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && (
                <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="role">Role</Label>
              <Select id="role" {...register("role")}>
                <option value="viewer">Viewer</option>
                <option value="analyst">Analyst</option>
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
              </Select>
            </div>

            <div>
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Leave blank to keep current"
                {...register("password")}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Controller
                name="is_active"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="is_active"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={isSelf}
                  />
                )}
              />
              <Label htmlFor="is_active">Active account</Label>
              {isSelf && (
                <span className="text-xs text-muted-foreground">
                  (cannot deactivate yourself)
                </span>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={!isDirty || update.isPending}>
                {update.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            {user.totp_enabled ? (
              <>
                <ShieldCheck className="h-4 w-4 text-green-500" />
                <span className="text-sm text-foreground">Enabled</span>
              </>
            ) : (
              <>
                <ShieldOff className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Not enrolled</span>
              </>
            )}
          </div>

          {user.totp_enabled && (
            isSelf ? (
              <p className="text-sm text-muted-foreground">
                Manage your own 2FA at{" "}
                <Link
                  to="/settings/security"
                  className="text-primary hover:underline"
                >
                  Security Settings
                </Link>
                .
              </p>
            ) : (
              <div className="space-y-1">
                <Button
                  variant="outline"
                  onClick={handleReset2fa}
                  disabled={reset2fa.isPending}
                  className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  {reset2fa.isPending ? "Resetting…" : "Reset 2FA"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Disables 2FA and invalidates all backup codes. The user will need to re-enrol.
                </p>
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
