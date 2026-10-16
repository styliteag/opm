interface ScriptKindFields {
  type: string;
  cloned_from?: string | null;
}

export interface ScriptActions {
  edit: boolean;
  clone: boolean;
  restore: boolean;
  remove: boolean;
}

/** Custom scripts are identified by `type`, never by a name prefix (bug #11). */
export function isCustomScript(script: Pick<ScriptKindFields, "type">): boolean {
  return script.type === "custom";
}

/**
 * Which script actions to show. Built-ins can only be cloned; custom scripts
 * can be edited and deleted, and restored when they were cloned from a
 * built-in. All of it needs operator rights (backend `OperatorUser`).
 */
export function scriptActions(
  script: ScriptKindFields,
  canManage: boolean,
): ScriptActions {
  if (!canManage) {
    return { edit: false, clone: false, restore: false, remove: false };
  }
  const custom = isCustomScript(script);
  return {
    edit: custom,
    clone: !custom,
    restore: custom && Boolean(script.cloned_from),
    remove: custom,
  };
}
