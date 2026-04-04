import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Copy, Trash2, FileCode, Pencil } from "lucide-react";
import { toast } from "sonner";

import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { EmptyState } from "@/components/data-display/EmptyState";
import { SeverityBadge } from "@/components/data-display/SeverityBadge";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import { useNseProfiles, useNseMutations } from "@/features/nse/hooks/useNse";
import { ProfileEditModal } from "@/features/nse/components/ProfileEditModal";

export const Route = createFileRoute("/_authenticated/nse/profiles")({
  component: NseProfilesPage,
});

const CATEGORY_LABELS: Record<string, string> = {
  scan_profiles: "Scan Profiles",
  smb: "SMB",
  web: "Web Application",
  ssl: "SSL / TLS",
  credentials: "Credentials & Access",
  network: "Network Services",
  reconnaissance: "Reconnaissance",
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

type Profile = {
  id: number;
  name: string;
  description: string | null;
  severity: string | null;
  nse_scripts: string[];
  platform: string;
  category: string | null;
  type: string;
};

function NseProfilesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<
    | {
        id: number;
        name: string;
        description: string | null;
        severity: string | null;
        nse_scripts: string[];
      }
    | undefined
  >();
  const { data, isLoading, error, refetch } = useNseProfiles();
  const { duplicateProfile, deleteProfile } = useNseMutations();

  const grouped = useMemo(() => {
    const profiles = (data?.profiles ?? []) as Profile[];
    const groups = new Map<string, Profile[]>();

    for (const profile of profiles) {
      const key = profile.category ?? "other";
      const list = groups.get(key);
      if (list) {
        list.push(profile);
      } else {
        groups.set(key, [profile]);
      }
    }

    // Sort groups by defined order, unknown categories go last
    return [...groups.entries()].sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [data?.profiles]);

  if (isLoading) return <LoadingState rows={6} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const profiles = data?.profiles ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-strong text-foreground">NSE Profiles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage Nmap Scripting Engine profiles for vulnerability scanning.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/nse/library"
            className="flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <FileCode className="h-4 w-4" />
            Script Library
          </Link>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Profile
          </button>
        </div>
      </div>

      {profiles.length === 0 ? (
        <EmptyState
          title="No profiles"
          message="Create your first NSE profile to start vulnerability scanning."
          icon={FileCode}
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(([category, categoryProfiles]) => (
            <section key={category}>
              <h2 className="mb-3 text-sm font-strong uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[category] ?? category}
              </h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {categoryProfiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="rounded-lg border border-border bg-card p-5"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-strong text-foreground">
                            {profile.name}
                          </h3>
                          <StatusBadge
                            label={profile.type}
                            variant={
                              profile.type === "builtin" ? "neutral" : "success"
                            }
                          />
                        </div>
                        {profile.description && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {profile.description}
                          </p>
                        )}
                      </div>
                      {profile.severity && (
                        <SeverityBadge
                          severity={
                            profile.severity as
                              | "critical"
                              | "high"
                              | "medium"
                              | "info"
                          }
                        />
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{profile.nse_scripts.length} scripts</span>
                      {profile.platform && <span>{profile.platform}</span>}
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      {profile.type === "custom" && (
                        <button
                          onClick={() => setEditProfile(profile)}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() =>
                          duplicateProfile.mutate(
                            {
                              id: profile.id,
                              name: `Copy of ${profile.name}`,
                            },
                            {
                              onSuccess: () =>
                                toast.success("Profile duplicated"),
                              onError: (e) => toast.error(e.message),
                            },
                          )
                        }
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                      >
                        <Copy className="h-3 w-3" />
                        Duplicate
                      </button>
                      {profile.type === "custom" && (
                        <button
                          onClick={() =>
                            deleteProfile.mutate(profile.id, {
                              onSuccess: () => toast.success("Profile deleted"),
                              onError: (e) => toast.error(e.message),
                            })
                          }
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-red-400 hover:bg-accent/50 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ProfileEditModal
        open={createOpen || Boolean(editProfile)}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditProfile(undefined);
          }
        }}
        profile={editProfile}
      />
    </div>
  );
}
