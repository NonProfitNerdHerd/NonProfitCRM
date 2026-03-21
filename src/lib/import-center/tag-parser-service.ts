import { resolveImportCenterSupabaseClient } from "@/lib/import-center/execution-context";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

export function parseTagsFromCell(value: unknown, delimiter: string) {
  const raw = toText(value);
  if (!raw) return [];
  const separator = delimiter || ";";
  return raw
    .split(separator)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function countUniqueTags(values: unknown[], delimiter: string) {
  const unique = new Set<string>();
  for (const value of values) {
    for (const tag of parseTagsFromCell(value, delimiter)) {
      unique.add(tag.toLowerCase());
    }
  }
  return unique.size;
}

export async function ensureContactTags(input: {
  organizationId: string;
  userId: string;
  tagNames: string[];
  cache?: Map<string, string>;
  createdTracker?: Set<string>;
}) {
  const supabase = await resolveImportCenterSupabaseClient();
  const normalizedNames = Array.from(new Set(input.tagNames.map((name) => toText(name)).filter(Boolean)));
  if (normalizedNames.length === 0) {
    return { tagIds: [] as string[], createdCount: 0 };
  }

  const cache = input.cache ?? new Map<string, string>();
  const createdTracker = input.createdTracker ?? new Set<string>();
  const tagIds: string[] = [];
  let createdCount = 0;

  for (const name of normalizedNames) {
    const key = name.toLowerCase();
    const cached = cache.get(key);
    if (cached) {
      tagIds.push(cached);
      continue;
    }

    const { data: existing, error: existingError } = await supabase
      .from("tags")
      .select("id")
      .eq("organization_id", input.organizationId)
      .is("parent_tag_id", null)
      .ilike("name", name)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing?.id) {
      const id = String(existing.id);
      cache.set(key, id);
      tagIds.push(id);
      continue;
    }

    const { data: created, error: createdError } = await supabase
      .from("tags")
      .insert({
        organization_id: input.organizationId,
        name,
        slug: name,
        module: "contacts",
        is_active: true,
        created_by: input.userId,
        updated_by: input.userId
      })
      .select("id")
      .single();
    if (createdError) throw createdError;

    const createdId = String(created.id);
    cache.set(key, createdId);
    tagIds.push(createdId);
    if (!createdTracker.has(createdId)) {
      createdTracker.add(createdId);
      createdCount += 1;
    }
  }

  return { tagIds, createdCount };
}
