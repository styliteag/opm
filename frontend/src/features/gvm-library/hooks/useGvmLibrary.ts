import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { GvmKind, GvmLibraryEntry } from "@/lib/types";
import {
  deleteLibraryEntry,
  getLibraryEntryReferences,
  getScannerMirror,
  listLibraryEntries,
  requestScannerRefresh,
  uploadLibraryEntry,
} from "../api";

const LIBRARY_KEY = ["gvm", "library"] as const;
const MIRROR_KEY = (scannerId: number) =>
  ["gvm", "scanners", scannerId, "mirror"] as const;

export function useLibraryEntries(kind?: GvmKind) {
  return useQuery({
    queryKey: [...LIBRARY_KEY, kind ?? "all"],
    queryFn: () => listLibraryEntries(kind),
    staleTime: 60_000,
  });
}

export function useLibraryMutations() {
  const qc = useQueryClient();

  const upload = useMutation({
    mutationFn: ({ kind, file }: { kind: GvmKind; file: File }) =>
      uploadLibraryEntry(kind, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIBRARY_KEY }),
  });

  const remove = useMutation({
    mutationFn: (entry: GvmLibraryEntry) => deleteLibraryEntry(entry.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIBRARY_KEY }),
  });

  return { upload, remove };
}

export function useLibraryEntryReferences(entryId: number | null) {
  return useQuery({
    queryKey: ["gvm", "library", entryId, "references"],
    queryFn: () => getLibraryEntryReferences(entryId as number),
    enabled: entryId !== null,
  });
}

export function useScannerMirror(
  scannerId: number,
  kind?: GvmKind,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...MIRROR_KEY(scannerId), kind ?? "all"],
    queryFn: () => getScannerMirror(scannerId, kind),
    enabled: (options?.enabled ?? true) && scannerId > 0,
    refetchInterval: 15_000,
  });
}

export function useScannerRefreshMutation(scannerId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => requestScannerRefresh(scannerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: MIRROR_KEY(scannerId) }),
  });
}
