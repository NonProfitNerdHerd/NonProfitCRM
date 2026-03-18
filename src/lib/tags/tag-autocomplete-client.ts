export type TagAutocompleteOption = {
  id: string;
  name: string;
  label?: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export async function searchTagAutocompleteOptions(input: {
  query: string;
  limit?: number;
  activeOnly?: boolean;
  rootName?: string;
  module?: string;
}): Promise<TagAutocompleteOption[]> {
  const params = new URLSearchParams();
  params.set("q", normalizeText(input.query));
  params.set("limit", String(input.limit ?? 20));
  params.set("activeOnly", input.activeOnly === false ? "false" : "true");
  if (normalizeText(input.rootName)) params.set("rootName", normalizeText(input.rootName));
  if (normalizeText(input.module)) params.set("module", normalizeText(input.module));

  const response = await fetch(`/api/admin/tags/search?${params.toString()}`);
  const payload = (await response.json().catch(() => null)) as
    | { tags?: Array<Record<string, unknown>>; message?: string }
    | null;
  if (!response.ok) {
    throw new Error(normalizeText(payload?.message) || "Unable to search tags.");
  }
  return (payload?.tags ?? []).map((row) => ({
    id: normalizeText(row.id),
    name: normalizeText(row.name),
    label: normalizeText(row.path) || normalizeText(row.name)
  }));
}

export async function ensureTagAutocompleteOption(input: {
  name: string;
  parentTagId?: string | null;
  module?: string | null;
  rootName?: string;
}): Promise<TagAutocompleteOption | null> {
  const name = normalizeText(input.name);
  if (!name) return null;

  if (normalizeText(input.rootName)) {
    const response = await fetch("/api/volunteer-coordination/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rootName: normalizeText(input.rootName),
        values: [name]
      })
    });
    const payload = (await response.json().catch(() => null)) as
      | { result?: Array<Record<string, unknown>>; message?: string }
      | null;
    if (!response.ok) {
      throw new Error(normalizeText(payload?.message) || "Unable to create tag.");
    }
    const created = payload?.result?.[0];
    const id = normalizeText(created?.id);
    if (!id) return null;
    return {
      id,
      name: normalizeText(created?.name) || name,
      label: normalizeText(created?.path) || normalizeText(created?.name) || name
    };
  }

  const response = await fetch("/api/admin/tags/ensure", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      parentTagId: normalizeText(input.parentTagId) || null,
      module: normalizeText(input.module) || "contacts"
    })
  });
  const payload = (await response.json().catch(() => null)) as
    | { tag?: Record<string, unknown>; message?: string }
    | null;
  if (!response.ok) {
    throw new Error(normalizeText(payload?.message) || "Unable to create tag.");
  }
  const tag = payload?.tag;
  const id = normalizeText(tag?.id);
  if (!id) return null;
  return {
    id,
    name: normalizeText(tag?.name) || name,
    label: normalizeText(tag?.path) || normalizeText(tag?.name) || name
  };
}
