import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useLibraryEntries,
  useLibraryEntryReferences,
  useLibraryMutations,
} from "@/features/gvm-library/hooks/useGvmLibrary";
import { downloadLibraryXml } from "@/features/gvm-library/api";
import { formatRelativeTime } from "@/lib/utils";
import type { GvmKind, GvmLibraryEntry } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/admin/gvm-library")({
  component: GvmLibraryPage,
});

function GvmLibraryPage() {
  const [activeKind, setActiveKind] = useState<GvmKind>("scan_config");
  const [deleteTarget, setDeleteTarget] = useState<GvmLibraryEntry | null>(
    null,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-strong text-foreground">GVM Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload exported GVM scan configs and port lists so OPM can
          auto-deploy them to GVM scanners before scans run. The inner
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
            &lt;name&gt;
          </code>
          from each XML becomes the library entry name.
        </p>
      </div>

      <Tabs
        value={activeKind}
        onValueChange={(value) => setActiveKind(value as GvmKind)}
      >
        <TabsList>
          <TabsTrigger value="scan_config">Scan Configs</TabsTrigger>
          <TabsTrigger value="port_list">Port Lists</TabsTrigger>
        </TabsList>

        <TabsContent value="scan_config">
          <LibraryTabPanel kind="scan_config" onRequestDelete={setDeleteTarget} />
        </TabsContent>
        <TabsContent value="port_list">
          <LibraryTabPanel kind="port_list" onRequestDelete={setDeleteTarget} />
        </TabsContent>
      </Tabs>

      <DeleteDialog
        entry={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface LibraryTabPanelProps {
  kind: GvmKind;
  onRequestDelete: (entry: GvmLibraryEntry) => void;
}

function LibraryTabPanel({ kind, onRequestDelete }: LibraryTabPanelProps) {
  const { data, isLoading, error, refetch } = useLibraryEntries(kind);
  const { upload } = useLibraryMutations();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    upload.mutate(
      { kind, file },
      {
        onSuccess: (entry) =>
          toast.success(`Uploaded "${entry.name}" (hash ${entry.xml_hash.slice(0, 8)})`),
        onError: (err: Error) => toast.error(err.message || "Upload failed"),
      },
    );
  };

  if (isLoading) return <LoadingState rows={4} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const entries = data?.entries ?? [];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          <Upload className="h-4 w-4" />
          Upload XML
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,application/xml,text/xml"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <p className="text-xs text-muted-foreground">
          Name is read from the XML — upload an exported file from GSA (9392).
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          No {kind === "scan_config" ? "scan configs" : "port lists"} in the
          library yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-emphasis">Name</th>
                <th className="px-4 py-2 text-left font-emphasis">Hash</th>
                <th className="px-4 py-2 text-left font-emphasis">
                  Uploaded by
                </th>
                <th className="px-4 py-2 text-left font-emphasis">Updated</th>
                <th className="px-4 py-2 text-right font-emphasis">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-border/50 last:border-0"
                >
                  <td className="px-4 py-2 font-emphasis text-foreground">
                    {entry.name}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {entry.xml_hash.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {entry.uploaded_by_username ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatRelativeTime(entry.updated_at)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          downloadLibraryXml(entry).catch((err) =>
                            toast.error((err as Error).message),
                          );
                        }}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                        title="Download XML"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => onRequestDelete(entry)}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface DeleteDialogProps {
  entry: GvmLibraryEntry | null;
  onClose: () => void;
}

function DeleteDialog({ entry, onClose }: DeleteDialogProps) {
  const { remove } = useLibraryMutations();
  const { data: references } = useLibraryEntryReferences(entry?.id ?? null);

  const handleConfirm = () => {
    if (!entry) return;
    remove.mutate(entry, {
      onSuccess: () => {
        toast.success(`Deleted ${entry.name}`);
        onClose();
      },
      onError: (err: Error) => toast.error(err.message || "Delete failed"),
    });
  };

  return (
    <AlertDialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {entry?.kind === "scan_config" ? "scan config" : "port list"}{" "}
            "{entry?.name}"?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {references && references.length > 0 ? (
              <>
                <span className="text-destructive">
                  {references.length} network
                  {references.length === 1 ? "" : "s"} reference this entry.
                </span>{" "}
                Deletion proceeds — those networks will fall back to the
                scanner's native state or fail fast at scan time if the name
                is not present there.
              </>
            ) : (
              "This entry is not referenced by any network. Deletion is safe."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
