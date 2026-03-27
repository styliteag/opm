import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import type { PolicyResponse } from "../types";

export function usePortRules() {
  return useQuery({
    queryKey: ["policy", "rules"],
    queryFn: () => fetchApi<PolicyResponse>("/api/port-rules"),
  });
}
