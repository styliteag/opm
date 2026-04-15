import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createSeverityRule,
  deleteSeverityRule,
  listSeverityRules,
  updateSeverityRule,
  type GvmSeverityRuleCreate,
  type GvmSeverityRuleUpdate,
} from "../api";

const RULES_KEY = ["gvm", "severity-rules"] as const;

export function useSeverityRules(params?: {
  network_id?: number | null;
  oid?: string;
}) {
  return useQuery({
    queryKey: [...RULES_KEY, params ?? null],
    queryFn: () => listSeverityRules(params),
    staleTime: 30_000,
  });
}

export function useSeverityRuleMutations() {
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: (payload: GvmSeverityRuleCreate) => createSeverityRule(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: RULES_KEY }),
  });

  const update = useMutation({
    mutationFn: (args: { id: number; payload: GvmSeverityRuleUpdate }) =>
      updateSeverityRule(args.id, args.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: RULES_KEY }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteSeverityRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: RULES_KEY }),
  });

  return { create, update, remove };
}
