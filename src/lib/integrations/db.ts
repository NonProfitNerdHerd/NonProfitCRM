import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createIntegrationClient() {
  try {
    return createAdminClient();
  } catch {
    return createClient();
  }
}
