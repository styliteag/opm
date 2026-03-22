import { useQuery } from '@tanstack/react-query'

import { fetchApi } from '@/lib/api'
import type { NseResultListResponse } from '@/lib/types'

export function useHostVulnerabilities(hostIp: string) {
  return useQuery({
    queryKey: ['nse', 'results', 'host', hostIp],
    queryFn: () =>
      fetchApi<NseResultListResponse>(`/api/nse/results?ip=${encodeURIComponent(hostIp)}`),
    enabled: Boolean(hostIp),
  })
}
