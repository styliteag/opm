import { useRef, useState } from "react";
import { Download, Eye, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useLibraryEntries,
  useLibraryEntryReferences,
  useLibraryMutations,
} from "@/features/gvm-library/hooks/useGvmLibrary";
import { downloadLibraryXml } from "@/features/gvm-library/api";
import { ScanConfigViewer } from "@/features/gvm-library/components/ScanConfigViewer";
import {
  PortListEditor,
  type PortListEditorMode,
} from "@/features/gvm-library/components/PortListEditor";
import { useHasRole } from "@/lib/roles";
import { formatRelativeTime } from "@/lib/utils";
import type { GvmKind, GvmLibraryEntry } from "@/lib/types";

export function GvmLibraryPage() {
  const [activeKind, setActiveKind] = useState<GvmKind>("scan_config");
  const [deleteTarget, setDeleteTarget] = useState<GvmLibraryEntry | null>(
    null,
  );
  const [viewScanConfig, setViewScanConfig] = useState<GvmLibraryEntry | null>(
    null,
  );
  const [portListEditor, setPortListEditor] = useState<{
    entry: GvmLibraryEntry | null;
    mode: PortListEditorMode;
  } | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-strong text-foreground">
          Deep scan library
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Scan profiles and port lists for deep vulnerability scans. OPM copies
          them to the scanner before a scan runs.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Greenbone / GVM: upload scan configs and port lists exported from GSA.
          The inner
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
            &lt;name&gt;
          </code>
          of each XML becomes the entry name.
        </p>
      </div>

      <Tabs
        value={activeKind}
        onValueChange={(value) => setActiveKind(value as GvmKind)}
      >
        <TabsList>
          <TabsTrigger value="scan_config">Scan profiles</TabsTrigger>
          <TabsTrigger value="port_list">Port lists</TabsTrigger>
        </TabsList>

        <TabsContent value="scan_config">
          <LibraryTabPanel
            kind="scan_config"
            onRequestDelete={setDeleteTarget}
            onView={(entry) => setViewScanConfig(entry)}
          />
        </TabsContent>
        <TabsContent value="port_list">
          <LibraryTabPanel
            kind="port_list"
            onRequestDelete={setDeleteTarget}
            onView={(entry) => setPortListEditor({ entry, mode: "view" })}
            onEdit={(entry) => setPortListEditor({ entry, mode: "edit" })}
            onCreateNew={() => setPortListEditor({ entry: null, mode: "new" })}
          />
        </TabsContent>
      </Tabs>

      <DeleteDialog
        entry={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />

      <ScanConfigViewer
        entry={viewScanConfig}
        onClose={() => setViewScanConfig(null)}
      />

      {portListEditor && (
        <PortListEditor
          entry={portListEditor.entry}
          mode={portListEditor.mode}
          onClose={() => setPortListEditor(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface LibraryTabPanelProps {
  kind: GvmKind;
  onRequestDelete: (entry: GvmLibraryEntry) => void;
  onView?: (entry: GvmLibraryEntry) => void;
  onEdit?: (entry: GvmLibraryEntry) => void;
  onCreateNew?: () => void;
}

function LibraryTabPanel({
  kind,
  onRequestDelete,
  onView,
  onEdit,
  onCreateNew,
}: LibraryTabPanelProps) {
  const { data, isLoading, error, refetch } = useLibraryEntries(kind);
  const { upload } = useLibraryMutations();
  const canManage = useHasRole("operator");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    upload.mutate(
      { kind, file },
      {
        onSuccess: (entry) =>
          toast.success(
            `Uploaded "${entry.name}" (hash ${entry.xml_hash.slice(0, 8)})`,
          ),
        onError: (err: Error) => toast.error(err.message || "Upload failed"),
      },
    );
  };

  if (isLoading) return <LoadingState rows={4} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const entries = data?.entries ?? [];

  return (
    <div className="space-y-4 pt-4">
      {canManage && (
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
          {kind === "port_list" && onCreateNew && (
            <button
              onClick={onCreateNew}
              disabled={upload.isPending}
              className="flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              New port list
            </button>
          )}
          <p className="text-xs text-muted-foreground">
            Name is read from the XML — upload an exported file from GSA (9392).
          </p>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          No {kind === "scan_config" ? "scan profiles" : "port lists"} in the
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
                {canManage && (
                  <th className="px-4 py-2 text-right font-emphasis">
                    Actions
                  </th>
                )}
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
                  {canManage && (
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {onView && (
                          <button
                            onClick={() => onView(entry)}
                            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                            title="View"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {onEdit && (
                          <button
                            onClick={() => onEdit(entry)}
                            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
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
                  )}
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

  const kindLabel =
    entry?.kind === "scan_config" ? "scan profile" : "port list";
  const referenceCount = references?.length ?? 0;

  return (
    <ConfirmDialog
      open={entry !== null}
      onOpenChange={(open) => !open && onClose()}
      title={`Delete ${kindLabel} "${entry?.name ?? ""}"?`}
      description={
        referenceCount > 0 ? (
          <>
            <span className="text-destructive">
              {referenceCount} network{referenceCount === 1 ? "" : "s"}{" "}
              {referenceCount === 1 ? "uses" : "use"} this entry.
            </span>{" "}
            Their deep scans fall back to the scanner's own copy, or fail at
            scan time if the scanner does not have it.
          </>
        ) : (
          "No network uses this entry."
        )
      }
      confirmLabel="Delete"
      onConfirm={handleConfirm}
      pending={remove.isPending}
    />
  );
}
