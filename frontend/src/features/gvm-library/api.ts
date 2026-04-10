import { deleteApi, fetchApi, postApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import type {
  GvmKind,
  GvmLibraryEntry,
  GvmLibraryListResponse,
  GvmScannerMirrorResponse,
  GvmScannerRefreshResponse,
} from '@/lib/types'

export async function listLibraryEntries(
  kind?: GvmKind,
): Promise<GvmLibraryListResponse> {
  const qs = kind ? `?kind=${kind}` : ''
  return fetchApi<GvmLibraryListResponse>(`/api/gvm/library${qs}`)
}

export async function uploadLibraryEntry(
  kind: GvmKind,
  file: File,
): Promise<GvmLibraryEntry> {
  const token = useAuthStore.getState().token
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`/api/gvm/library?kind=${kind}`, {
    method: 'POST',
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (res.status === 401) {
    useAuthStore.getState().logout()
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const msg =
      typeof body?.detail === 'string' ? body.detail : res.statusText
    throw new Error(msg)
  }
  return res.json() as Promise<GvmLibraryEntry>
}

export function deleteLibraryEntry(entryId: number): Promise<void> {
  return deleteApi(`/api/gvm/library/${entryId}`)
}

export function libraryXmlDownloadUrl(entryId: number): string {
  return `/api/gvm/library/${entryId}/xml`
}

export async function downloadLibraryXml(entry: GvmLibraryEntry): Promise<void> {
  const token = useAuthStore.getState().token
  const res = await fetch(libraryXmlDownloadUrl(entry.id), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const safeName = entry.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const link = document.createElement('a')
  link.href = url
  link.download = `${entry.kind}_${safeName}_${entry.xml_hash.slice(0, 8)}.xml`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function getLibraryEntryReferences(entryId: number): Promise<number[]> {
  return fetchApi<number[]>(`/api/gvm/library/${entryId}/references`)
}

export function getScannerMirror(
  scannerId: number,
  kind?: GvmKind,
): Promise<GvmScannerMirrorResponse> {
  const qs = kind ? `?kind=${kind}` : ''
  return fetchApi<GvmScannerMirrorResponse>(
    `/api/gvm/scanners/${scannerId}/mirror${qs}`,
  )
}

export function requestScannerRefresh(
  scannerId: number,
): Promise<GvmScannerRefreshResponse> {
  return postApi<GvmScannerRefreshResponse>(
    `/api/gvm/scanners/${scannerId}/refresh`,
    {},
  )
}
