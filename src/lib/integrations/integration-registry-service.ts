import { createIntegrationClient } from "@/lib/integrations/db";
import { type IntegrationDefinition } from "@/lib/integrations/types";

export class IntegrationRegistryService {
  async listDefinitions(): Promise<IntegrationDefinition[]> {
    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
      .from("integration_definitions")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as IntegrationDefinition[];
  }

  async getDefinition(providerKey: string): Promise<IntegrationDefinition | null> {
    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
      .from("integration_definitions")
      .select("*")
      .eq("provider_key", providerKey)
      .maybeSingle();
    if (error) throw error;
    return (data as IntegrationDefinition | null) ?? null;
  }
}
