import { createIntegrationClient } from "@/lib/integrations/db";
import { type IntegrationDefinition } from "@/lib/integrations/types";
import {
  GIVINGFUEL_DONATIONS_INTEGRATION_KEY,
  GIVINGFUEL_INTEGRATION_KEY
} from "@/lib/integrations/givingfuel-contacts-config";

const SUPPORTED_PROVIDER_KEYS = new Set([
  GIVINGFUEL_INTEGRATION_KEY,
  GIVINGFUEL_DONATIONS_INTEGRATION_KEY
]);

export class IntegrationRegistryService {
  async listDefinitions(): Promise<IntegrationDefinition[]> {
    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
      .from("integration_definitions")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as IntegrationDefinition[]).filter((definition) =>
      SUPPORTED_PROVIDER_KEYS.has(String(definition.provider_key ?? ""))
    );
  }

  async getDefinition(providerKey: string): Promise<IntegrationDefinition | null> {
    if (!SUPPORTED_PROVIDER_KEYS.has(providerKey)) return null;
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
