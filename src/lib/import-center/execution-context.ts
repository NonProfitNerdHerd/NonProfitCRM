import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { requireImportCenterAccess } from "@/lib/auth/guards";

export type ImportCenterExecutionContext = {
  organizationId: string;
  userId: string;
  supabase?: SupabaseClient;
};

const importCenterExecutionStorage = new AsyncLocalStorage<ImportCenterExecutionContext>();

export function getImportCenterExecutionContext() {
  return importCenterExecutionStorage.getStore() ?? null;
}

export async function resolveImportCenterExecution() {
  const override = getImportCenterExecutionContext();
  if (override) {
    return {
      context: {
        organizationId: override.organizationId,
        userId: override.userId
      },
      supabase: override.supabase ?? (await createSessionClient())
    };
  }

  const context = await requireImportCenterAccess();
  const supabase = await createSessionClient();
  return { context, supabase };
}

export async function resolveImportCenterSupabaseClient() {
  const override = getImportCenterExecutionContext();
  if (override?.supabase) {
    return override.supabase;
  }
  return createSessionClient();
}

export async function runWithImportCenterExecutionContext<T>(
  context: ImportCenterExecutionContext,
  run: () => Promise<T>
) {
  return importCenterExecutionStorage.run(context, run);
}
