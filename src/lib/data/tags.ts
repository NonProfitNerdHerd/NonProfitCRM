import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/data/audit";
import { requireAnyStaffPermission, requireStaffPermission } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity-log";

type ContactMode =
  | "all"
  | "donors"
  | "contacts"
  | "donor_organizations"
  | "organizations"
  | "personal";

type TagMatchMode = "any" | "all" | "none";

type TagFilterInput = {
  tagIds: string[];
  match: TagMatchMode;
  includeDescendants?: boolean;
};

type ContactSelectionFilter = {
  mode?: ContactMode;
  q?: string;
  tagFilter?: TagFilterInput;
};

type TagRow = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_tag_id: string | null;
  level: number;
  path: string;
  is_active: boolean;
  is_system: boolean;
  color: string | null;
  sort_order: number;
  external_key: string | null;
  created_at: string;
  updated_at: string;
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function isTaggingSchemaMissingError(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string; hint?: string })?.message ??
      (error as { details?: string })?.details ??
      (error as { hint?: string })?.hint ??
      ""
  ).toLowerCase();
  return (
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("tags") ||
    message.includes("contact_tags") ||
    message.includes("tag_assignment_jobs") ||
    message.includes("tag_sync_mappings") ||
    message.includes("collect_descendant_tag_ids")
  );
}

function toBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes"].includes(value.toLowerCase());
  return fallback;
}

function toInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function sanitizeTagIdList(input: unknown) {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.map((entry) => toText(entry)).filter(Boolean)));
}

async function getUserRoleKey(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("user_role_key", {
    org_id: organizationId
  });
  return toText(data).toLowerCase();
}

async function assertDataEntryCanEditContact(
  organizationId: string,
  userId: string,
  contactId: string
) {
  const roleKey = await getUserRoleKey(organizationId);
  if (roleKey !== "data_entry") return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("created_by")
    .eq("organization_id", organizationId)
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Contact was not found.");
  if (toText(data.created_by) !== userId) {
    throw new Error("Data Entry users may only tag contacts they created.");
  }
}

async function resolveDescendantMap(
  organizationId: string,
  tagIds: string[],
  includeDescendants: boolean
) {
  const supabase = await createClient();
  const normalized = sanitizeTagIdList(tagIds);
  const byRoot = new Map<string, Set<string>>();

  if (!includeDescendants) {
    for (const tagId of normalized) {
      byRoot.set(tagId, new Set([tagId]));
    }
    return byRoot;
  }

  for (const tagId of normalized) {
    const { data, error } = await supabase.rpc("collect_descendant_tag_ids", {
      org_id: organizationId,
      input_tag_ids: [tagId]
    });
    if (error) throw error;
    const ids = sanitizeTagIdList(data);
    byRoot.set(tagId, new Set(ids.length > 0 ? ids : [tagId]));
  }
  return byRoot;
}

async function filterContactIdsByTagFilter(
  organizationId: string,
  contactRows: Array<{ id: string; created_by?: string | null }>,
  filter?: TagFilterInput
) {
  if (!filter || sanitizeTagIdList(filter.tagIds).length === 0) {
    return contactRows.map((row) => row.id);
  }

  const mode: TagMatchMode = filter.match ?? "any";
  const tagIds = sanitizeTagIdList(filter.tagIds);
  const descendantMap = await resolveDescendantMap(
    organizationId,
    tagIds,
    Boolean(filter.includeDescendants)
  );
  const flattenedTagIds = Array.from(
    new Set(Array.from(descendantMap.values()).flatMap((ids) => Array.from(ids)))
  );

  if (flattenedTagIds.length === 0) return [];

  const contactIdList = contactRows.map((row) => row.id);
  if (contactIdList.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_tags")
    .select("contact_id,tag_id")
    .eq("organization_id", organizationId)
    .in("contact_id", contactIdList)
    .in("tag_id", flattenedTagIds);
  if (error) throw error;

  const tagsByContact = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const contactId = toText(row.contact_id);
    const tagId = toText(row.tag_id);
    if (!contactId || !tagId) continue;
    if (!tagsByContact.has(contactId)) {
      tagsByContact.set(contactId, new Set());
    }
    tagsByContact.get(contactId)?.add(tagId);
  }

  return contactRows
    .filter((row) => {
      const assigned = tagsByContact.get(row.id) ?? new Set<string>();
      if (mode === "none") {
        return !Array.from(descendantMap.values()).some((set) =>
          Array.from(set).some((tagId) => assigned.has(tagId))
        );
      }
      if (mode === "all") {
        return Array.from(descendantMap.values()).every((set) =>
          Array.from(set).some((tagId) => assigned.has(tagId))
        );
      }
      return Array.from(descendantMap.values()).some((set) =>
        Array.from(set).some((tagId) => assigned.has(tagId))
      );
    })
    .map((row) => row.id);
}

export async function listTagDefinitions(input?: {
  search?: string;
  active?: "active" | "inactive" | "all";
}) {
  const context = await requireAnyStaffPermission([
    "can_assign_contact_tags",
    "can_manage_contact_tags",
    "can_bulk_tag_contacts"
  ]);
  const supabase = await createClient();

  let query = supabase
    .from("tags")
    .select(
      "id,organization_id,name,slug,description,parent_tag_id,level,path,is_active,is_system,color,sort_order,external_key,created_at,updated_at"
    )
    .eq("organization_id", context.organizationId)
    .order("level", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const active = input?.active ?? "active";
  if (active === "active") query = query.eq("is_active", true);
  if (active === "inactive") query = query.eq("is_active", false);

  const search = toText(input?.search);
  if (search) {
    const like = `%${search}%`;
    query = query.or(`name.ilike.${like},slug.ilike.${like},path.ilike.${like}`);
  }

  const { data, error } = await query;
  if (error) {
    if (isTaggingSchemaMissingError(error)) {
      return {
        tags: [] as Array<Record<string, unknown>>,
        tree: [] as Array<Record<string, unknown>>,
        schemaWarning:
          "Tagging schema is not available in this environment yet. Run Supabase migration 202603171000 and retry."
      };
    }
    throw error;
  }

  const tags = (data ?? []) as TagRow[];
  const tagIds = tags.map((tag) => tag.id);

  const usageMap = new Map<string, number>();
  if (tagIds.length > 0) {
    const { data: assignments, error: assignmentsError } = await supabase
      .from("contact_tags")
      .select("tag_id")
      .eq("organization_id", context.organizationId)
      .in("tag_id", tagIds);
    if (assignmentsError) {
      if (isTaggingSchemaMissingError(assignmentsError)) {
        return {
          tags: [] as Array<Record<string, unknown>>,
          tree: [] as Array<Record<string, unknown>>,
          schemaWarning:
            "Tagging schema is not available in this environment yet. Run Supabase migration 202603171000 and retry."
        };
      }
      throw assignmentsError;
    }
    for (const row of assignments ?? []) {
      const tagId = toText(row.tag_id);
      if (!tagId) continue;
      usageMap.set(tagId, (usageMap.get(tagId) ?? 0) + 1);
    }
  }

  const childrenByParent = new Map<string, TagRow[]>();
  for (const tag of tags) {
    const parent = toText(tag.parent_tag_id);
    if (!childrenByParent.has(parent)) {
      childrenByParent.set(parent, []);
    }
    childrenByParent.get(parent)?.push(tag);
  }

  function buildTree(parentId: string): Array<Record<string, unknown>> {
    const children = childrenByParent.get(parentId) ?? [];
    return children.map((tag) => ({
      ...tag,
      usageCount: usageMap.get(tag.id) ?? 0,
      childCount: (childrenByParent.get(tag.id) ?? []).length,
      children: buildTree(tag.id)
    }));
  }

  return {
    tags: tags.map((tag) => ({
      ...tag,
      usageCount: usageMap.get(tag.id) ?? 0,
      childCount: (childrenByParent.get(tag.id) ?? []).length
    })),
    tree: buildTree(""),
    schemaWarning: null
  };
}

export async function createTagDefinition(input: {
  name: string;
  slug?: string | null;
  description?: string | null;
  parentTagId?: string | null;
  module?: string | null;
  isActive?: boolean;
  isSystem?: boolean;
  color?: string | null;
  sortOrder?: number;
  externalKey?: string | null;
}) {
  const context = await requireStaffPermission("can_manage_contact_tags");
  const supabase = await createClient();

  const payload = {
    organization_id: context.organizationId,
    name: toText(input.name),
    slug: toText(input.slug) || null,
    description: toText(input.description) || null,
    parent_tag_id: toText(input.parentTagId) || null,
    module: toText(input.module) || "contacts",
    is_active: input.isActive ?? true,
    is_system: input.isSystem ?? false,
    color: toText(input.color) || null,
    sort_order: toInt(input.sortOrder, 0),
    external_key: toText(input.externalKey) || null,
    created_by: context.userId,
    updated_by: context.userId
  };

  const { data, error } = await supabase
    .from("tags")
    .insert(payload)
    .select(
      "id,organization_id,name,slug,description,parent_tag_id,module,level,path,is_active,is_system,color,sort_order,external_key,created_at,updated_at"
    )
    .single();
  if (error) throw error;

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "tag_created",
    targetEntityType: "tags",
    targetEntityId: toText(data.id),
    metadata: { after: data }
  });

  return data;
}

export async function updateTagDefinition(
  tagId: string,
  input: {
    name?: string;
    slug?: string | null;
    description?: string | null;
    parentTagId?: string | null;
    isActive?: boolean;
    color?: string | null;
    sortOrder?: number;
    externalKey?: string | null;
  }
) {
  const context = await requireStaffPermission("can_manage_contact_tags");
  const supabase = await createClient();

  const { data: before, error: beforeError } = await supabase
    .from("tags")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("id", tagId)
    .single();
  if (beforeError) throw beforeError;

  const updatePayload: Record<string, unknown> = {
    updated_by: context.userId,
    updated_at: new Date().toISOString()
  };
  if (input.name !== undefined) updatePayload.name = toText(input.name);
  if (input.slug !== undefined) updatePayload.slug = toText(input.slug);
  if (input.description !== undefined) updatePayload.description = toText(input.description) || null;
  if (input.parentTagId !== undefined) updatePayload.parent_tag_id = toText(input.parentTagId) || null;
  if (input.isActive !== undefined) updatePayload.is_active = input.isActive;
  if (input.color !== undefined) updatePayload.color = toText(input.color) || null;
  if (input.sortOrder !== undefined) updatePayload.sort_order = toInt(input.sortOrder, 0);
  if (input.externalKey !== undefined) updatePayload.external_key = toText(input.externalKey) || null;

  const { data: after, error } = await supabase
    .from("tags")
    .update(updatePayload)
    .eq("organization_id", context.organizationId)
    .eq("id", tagId)
    .select("*")
    .single();
  if (error) throw error;

  const moved = toText(before.parent_tag_id) !== toText(after.parent_tag_id);
  const deactivated = Boolean(before.is_active) && !Boolean(after.is_active);
  const actionType = deactivated ? "tag_deactivated" : moved ? "tag_moved" : "tag_updated";

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType,
    targetEntityType: "tags",
    targetEntityId: tagId,
    metadata: { before, after }
  });

  return after;
}

export async function hardDeleteTagDefinition(tagId: string) {
  const context = await requireStaffPermission("can_manage_contact_tags");
  const supabase = await createClient();

  const { data: before, error: fetchError } = await supabase
    .from("tags")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("id", tagId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from("tags")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("id", tagId);
  if (error) throw error;

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "tag_hard_deleted",
    targetEntityType: "tags",
    targetEntityId: tagId,
    metadata: { before }
  });
}

export async function getTagUsage(tagId: string) {
  const context = await requireAnyStaffPermission([
    "can_assign_contact_tags",
    "can_manage_contact_tags",
    "can_bulk_tag_contacts"
  ]);
  const supabase = await createClient();

  const [{ data: tag, error: tagError }, { data: mappings, error: mappingsError }] = await Promise.all([
    supabase
      .from("tags")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("id", tagId)
      .single(),
    supabase
      .from("tag_sync_mappings")
      .select(
        "id,external_system,external_tag_identifier,sync_direction,is_active,mapping_status,last_synced_at,updated_at"
      )
      .eq("organization_id", context.organizationId)
      .eq("internal_tag_id", tagId)
      .order("external_system", { ascending: true })
  ]);
  if (tagError) throw tagError;
  if (mappingsError) throw mappingsError;

  const { data: children, error: childrenError } = await supabase
    .from("tags")
    .select(
      "id,name,slug,path,level,is_active,color,sort_order,parent_tag_id,description,external_key,created_at,updated_at"
    )
    .eq("organization_id", context.organizationId)
    .eq("parent_tag_id", tagId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (childrenError) throw childrenError;

  const { data: rollups, error: rollupError } = await supabase.rpc("contact_tag_rollup_counts", {
    org_id: context.organizationId
  });
  if (rollupError) throw rollupError;
  const rollup = (rollups ?? []).find(
    (entry: Record<string, unknown>) => toText(entry.tag_id) === tagId
  );

  return {
    tag,
    childTags: children ?? [],
    directAssignedContacts: Number(rollup?.direct_contact_count ?? 0),
    rollupAssignedContacts: Number(rollup?.rollup_contact_count ?? 0),
    mappings: mappings ?? []
  };
}

export async function searchTags(input?: {
  q?: string;
  activeOnly?: boolean;
  limit?: number;
  rootName?: string;
  module?: string;
}) {
  const context = await requireAnyStaffPermission([
    "can_assign_contact_tags",
    "can_manage_contact_tags",
    "can_bulk_tag_contacts"
  ]);
  const supabase = await createClient();
  const limit = Math.min(Math.max(toInt(input?.limit, 25), 1), 100);

  let query = supabase
    .from("tags")
    .select("id,name,slug,path,level,color,is_active,parent_tag_id")
    .eq("organization_id", context.organizationId)
    .order("level", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .limit(limit);

  if (toBool(input?.activeOnly, true)) {
    query = query.eq("is_active", true);
  }
  const moduleKey = toText(input?.module);
  if (moduleKey) {
    query = query.eq("module", moduleKey);
  }
  const rootName = toText(input?.rootName);
  if (rootName) {
    const escapedRoot = rootName.replace(/[%_]/g, "");
    query = query.ilike("path", `${escapedRoot}%`);
  }
  const q = toText(input?.q);
  if (q) {
    const like = `%${q}%`;
    query = query.or(`name.ilike.${like},path.ilike.${like},slug.ilike.${like}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listContactTags(contactId: string) {
  const context = await requireAnyStaffPermission([
    "can_assign_contact_tags",
    "can_manage_contact_tags",
    "can_bulk_tag_contacts"
  ]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contact_tags")
    .select(
      "id,tag_id,assigned_at,assignment_source,notes,tags(id,name,slug,path,level,color,is_active,parent_tag_id)"
    )
    .eq("organization_id", context.organizationId)
    .eq("contact_id", contactId);
  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const tagValue = Array.isArray(row.tags) ? row.tags[0] : row.tags;
      return {
        id: toText(row.id),
        tagId: toText(row.tag_id),
        assignedAt: toText(row.assigned_at),
        assignmentSource: toText(row.assignment_source),
        notes: toText(row.notes) || null,
        tag: {
          id: toText((tagValue as Record<string, unknown> | null)?.id),
          name: toText((tagValue as Record<string, unknown> | null)?.name),
          slug: toText((tagValue as Record<string, unknown> | null)?.slug),
          path: toText((tagValue as Record<string, unknown> | null)?.path),
          level: toInt((tagValue as Record<string, unknown> | null)?.level, 1),
          color: toText((tagValue as Record<string, unknown> | null)?.color) || null,
          isActive: toBool((tagValue as Record<string, unknown> | null)?.is_active, true)
        }
      };
    })
    .filter((row) => row.tag.id)
    .sort((a, b) => a.tag.path.localeCompare(b.tag.path));
}

export async function assignTagsToContact(input: {
  contactId: string;
  tagIds: string[];
  assignmentSource?: "manual" | "bulk" | "donation_rule" | "api" | "import" | "integration";
  notes?: string;
  actionSource?: string;
}) {
  const context = await requireAnyStaffPermission([
    "can_assign_contact_tags",
    "can_manage_contact_tags"
  ]);
  const supabase = await createClient();
  const tagIds = sanitizeTagIdList(input.tagIds);
  if (tagIds.length === 0) {
    return listContactTags(input.contactId);
  }

  await assertDataEntryCanEditContact(context.organizationId, context.userId, input.contactId);

  const payload = tagIds.map((tagId) => ({
    organization_id: context.organizationId,
    contact_id: input.contactId,
    tag_id: tagId,
    assigned_by: context.userId,
    assigned_at: new Date().toISOString(),
    assignment_source: input.assignmentSource ?? "manual",
    notes: toText(input.notes) || null
  }));

  const { error } = await supabase.from("contact_tags").upsert(payload, {
    onConflict: "organization_id,contact_id,tag_id",
    ignoreDuplicates: true
  });
  if (error) throw error;

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "tag_assignment",
    targetEntityType: "contacts",
    targetEntityId: input.contactId,
    metadata: {
      source: input.actionSource ?? "contact_profile",
      tagIds
    }
  });

  await recordActivity({
    entityType: "tag",
    entityId: input.contactId,
    actionType: "tag_assignment",
    actionSummary: `Assigned ${tagIds.length} tag(s) to contact`,
    relatedContactId: input.contactId
  });

  return listContactTags(input.contactId);
}

export async function removeTagsFromContact(input: {
  contactId: string;
  tagIds: string[];
  actionSource?: string;
}) {
  const context = await requireAnyStaffPermission([
    "can_assign_contact_tags",
    "can_manage_contact_tags"
  ]);
  const supabase = await createClient();
  const tagIds = sanitizeTagIdList(input.tagIds);
  if (tagIds.length === 0) {
    return listContactTags(input.contactId);
  }

  await assertDataEntryCanEditContact(context.organizationId, context.userId, input.contactId);

  const { error } = await supabase
    .from("contact_tags")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("contact_id", input.contactId)
    .in("tag_id", tagIds);
  if (error) throw error;

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "tag_removal",
    targetEntityType: "contacts",
    targetEntityId: input.contactId,
    metadata: {
      source: input.actionSource ?? "contact_profile",
      tagIds
    }
  });

  await recordActivity({
    entityType: "tag",
    entityId: input.contactId,
    actionType: "tag_removal",
    actionSummary: `Removed ${tagIds.length} tag(s) from contact`,
    relatedContactId: input.contactId
  });

  return listContactTags(input.contactId);
}

export async function bulkAssignTagsToContacts(input: {
  contactIds: string[];
  tagIds: string[];
  action: "add" | "remove";
  actionSource?: string;
}) {
  const context = await requireAnyStaffPermission([
    "can_assign_contact_tags",
    "can_manage_contact_tags"
  ]);
  const supabase = await createClient();
  const contactIds = sanitizeTagIdList(input.contactIds);
  const tagIds = sanitizeTagIdList(input.tagIds);
  if (contactIds.length === 0 || tagIds.length === 0) {
    return { processedContacts: 0 };
  }

  const roleKey = await getUserRoleKey(context.organizationId);
  if (roleKey === "data_entry") {
    const { data, error } = await supabase
      .from("contacts")
      .select("id,created_by")
      .eq("organization_id", context.organizationId)
      .in("id", contactIds);
    if (error) throw error;
    const disallowed = (data ?? []).some((row) => toText(row.created_by) !== context.userId);
    if (disallowed) {
      throw new Error("Data Entry users may only tag contacts they created.");
    }
  }

  if (input.action === "add") {
    const rows = contactIds.flatMap((contactId) =>
      tagIds.map((tagId) => ({
        organization_id: context.organizationId,
        contact_id: contactId,
        tag_id: tagId,
        assigned_by: context.userId,
        assigned_at: new Date().toISOString(),
        assignment_source: "bulk" as const
      }))
    );
    const { error } = await supabase.from("contact_tags").upsert(rows, {
      onConflict: "organization_id,contact_id,tag_id",
      ignoreDuplicates: true
    });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("contact_tags")
      .delete()
      .eq("organization_id", context.organizationId)
      .in("contact_id", contactIds)
      .in("tag_id", tagIds);
    if (error) throw error;
  }

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: input.action === "add" ? "tag_bulk_assignment" : "tag_bulk_removal",
    targetEntityType: "contacts",
    targetEntityId: null,
    metadata: {
      source: input.actionSource ?? "contacts_list",
      contactCount: contactIds.length,
      tagCount: tagIds.length
    }
  });

  return { processedContacts: contactIds.length };
}

export async function resolveContactIdsForFilter(
  filter: ContactSelectionFilter,
  options?: { enforceDataEntryOwnership?: boolean; limit?: number }
) {
  const context = await requireAnyStaffPermission(["can_view_contacts", "can_assign_contact_tags"]);
  const supabase = await createClient();

  const mode = filter.mode ?? "all";
  const q = toText(filter.q);
  const limit = Math.min(Math.max(toInt(options?.limit, 50000), 1), 100000);

  let query = supabase
    .from("contacts_safe_view")
    .select("id,created_by")
    .eq("organization_id", context.organizationId)
    .order("last_name", { ascending: true })
    .limit(limit);

  if (mode === "donors") {
    query = query.eq("entity_type", "person").eq("tracking_status", "donor");
  }
  if (mode === "contacts" || mode === "personal") {
    query = query.eq("entity_type", "person").in("tracking_status", ["lead", "non_lead"]);
  }
  if (mode === "donor_organizations") {
    query = query.eq("entity_type", "organization").eq("tracking_status", "donor");
  }
  if (mode === "organizations") {
    query = query.eq("entity_type", "organization").in("tracking_status", ["lead", "non_lead"]);
  }

  if (q) {
    const like = `%${q}%`;
    query = query.or(
      `first_name.ilike.${like},last_name.ilike.${like},preferred_name.ilike.${like},email.ilike.${like},phone.ilike.${like},organization_name.ilike.${like}`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  const contactRows = (data ?? []).map((row) => ({
    id: toText(row.id),
    created_by: toText(row.created_by) || null
  }));

  let filteredIds = await filterContactIdsByTagFilter(
    context.organizationId,
    contactRows,
    filter.tagFilter
  );

  const roleKey = await getUserRoleKey(context.organizationId);
  if (options?.enforceDataEntryOwnership !== false && roleKey === "data_entry") {
    const ownershipMap = new Map(contactRows.map((row) => [row.id, row.created_by]));
    filteredIds = filteredIds.filter((contactId) => ownershipMap.get(contactId) === context.userId);
  }

  return {
    organizationId: context.organizationId,
    userId: context.userId,
    contactIds: filteredIds
  };
}

export async function previewBulkTagAssignment(input: {
  jobType: "add" | "remove";
  tagIds: string[];
  sourceFilterDefinition: ContactSelectionFilter;
}) {
  await requireStaffPermission("can_bulk_tag_contacts");
  const tagIds = sanitizeTagIdList(input.tagIds);
  if (tagIds.length === 0) {
    return { totalContacts: 0, sampleContactIds: [] as string[] };
  }

  const resolved = await resolveContactIdsForFilter(input.sourceFilterDefinition, {
    enforceDataEntryOwnership: true
  });
  return {
    totalContacts: resolved.contactIds.length,
    sampleContactIds: resolved.contactIds.slice(0, 100)
  };
}

export async function executeBulkTagAssignment(input: {
  jobType: "add" | "remove";
  tagIds: string[];
  sourceFilterDefinition: ContactSelectionFilter;
  batchSize?: number;
}) {
  const context = await requireStaffPermission("can_bulk_tag_contacts");
  const supabase = await createClient();
  const tagIds = sanitizeTagIdList(input.tagIds);
  if (tagIds.length === 0) {
    throw new Error("At least one tag is required.");
  }

  const resolved = await resolveContactIdsForFilter(input.sourceFilterDefinition, {
    enforceDataEntryOwnership: true
  });
  const contactIds = resolved.contactIds;
  const batchSize = Math.min(Math.max(toInt(input.batchSize, 250), 50), 1000);

  const { data: createdJob, error: createJobError } = await supabase
    .from("tag_assignment_jobs")
    .insert({
      organization_id: context.organizationId,
      initiated_by: context.userId,
      job_type: input.jobType,
      tag_ids: tagIds,
      source_filter_definition: input.sourceFilterDefinition,
      total_contacts: contactIds.length,
      status: "running"
    })
    .select("id")
    .single();
  if (createJobError) throw createJobError;
  const jobId = toText(createdJob.id);

  let processedCount = 0;
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < contactIds.length; i += batchSize) {
    const batch = contactIds.slice(i, i + batchSize);
    try {
      if (input.jobType === "add") {
        const assignments = batch.flatMap((contactId) =>
          tagIds.map((tagId) => ({
            organization_id: context.organizationId,
            contact_id: contactId,
            tag_id: tagId,
            assigned_by: context.userId,
            assigned_at: new Date().toISOString(),
            assignment_source: "bulk" as const
          }))
        );
        if (assignments.length > 0) {
          const { error } = await supabase.from("contact_tags").upsert(assignments, {
            onConflict: "organization_id,contact_id,tag_id",
            ignoreDuplicates: true
          });
          if (error) throw error;
        }
      } else {
        const { error } = await supabase
          .from("contact_tags")
          .delete()
          .eq("organization_id", context.organizationId)
          .in("contact_id", batch)
          .in("tag_id", tagIds);
        if (error) throw error;
      }

      processedCount += batch.length;
      successCount += batch.length;

      const resultRows = batch.map((contactId) => ({
        organization_id: context.organizationId,
        job_id: jobId,
        contact_id: contactId,
        tag_id: null,
        action_taken: input.jobType,
        status: "success",
        message: `${input.jobType === "add" ? "Applied" : "Removed"} ${tagIds.length} tag(s)`
      }));
      const { error: jobResultError } = await supabase
        .from("tag_assignment_job_results")
        .insert(resultRows);
      if (jobResultError) throw jobResultError;
    } catch (error) {
      processedCount += batch.length;
      failureCount += batch.length;

      const errorMessage =
        error instanceof Error ? error.message : "Unknown bulk tagging batch failure";
      const resultRows = batch.map((contactId) => ({
        organization_id: context.organizationId,
        job_id: jobId,
        contact_id: contactId,
        tag_id: null,
        action_taken: input.jobType,
        status: "failed",
        message: errorMessage
      }));
      await supabase.from("tag_assignment_job_results").insert(resultRows);
    }

    await supabase
      .from("tag_assignment_jobs")
      .update({
        processed_count: processedCount,
        success_count: successCount,
        failure_count: failureCount,
        updated_at: new Date().toISOString()
      })
      .eq("organization_id", context.organizationId)
      .eq("id", jobId);
  }

  const status = failureCount > 0 ? "completed" : "completed";
  const { error: finalizeError } = await supabase
    .from("tag_assignment_jobs")
    .update({
      status,
      processed_count: processedCount,
      success_count: successCount,
      failure_count: failureCount,
      completed_at: new Date().toISOString(),
      result_summary: {
        tag_ids: tagIds,
        mode: input.sourceFilterDefinition.mode ?? "all",
        tag_filter: input.sourceFilterDefinition.tagFilter ?? null
      }
    })
    .eq("organization_id", context.organizationId)
    .eq("id", jobId);
  if (finalizeError) throw finalizeError;

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "tag_bulk_job_executed",
    targetEntityType: "tag_assignment_jobs",
    targetEntityId: jobId,
    metadata: {
      jobType: input.jobType,
      tagIds,
      totalContacts: contactIds.length,
      processedCount,
      successCount,
      failureCount
    }
  });

  return {
    jobId,
    totalContacts: contactIds.length,
    processedCount,
    successCount,
    failureCount
  };
}

export async function listTagAssignmentJobs(input?: { status?: string; limit?: number }) {
  const context = await requireAnyStaffPermission([
    "can_assign_contact_tags",
    "can_bulk_tag_contacts"
  ]);
  const supabase = await createClient();
  const limit = Math.min(Math.max(toInt(input?.limit, 25), 1), 100);

  let query = supabase
    .from("tag_assignment_jobs")
    .select("*")
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const status = toText(input?.status);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getTagAssignmentJob(jobId: string) {
  const context = await requireAnyStaffPermission([
    "can_assign_contact_tags",
    "can_bulk_tag_contacts"
  ]);
  const supabase = await createClient();

  const [{ data: job, error: jobError }, { data: results, error: resultsError }] = await Promise.all([
    supabase
      .from("tag_assignment_jobs")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("id", jobId)
      .single(),
    supabase
      .from("tag_assignment_job_results")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(500)
  ]);
  if (jobError) throw jobError;
  if (resultsError) throw resultsError;

  return {
    job,
    results: results ?? []
  };
}

export async function listTagSyncMappings(input?: {
  externalSystem?: string;
  internalTagId?: string;
}) {
  const context = await requireAnyStaffPermission([
    "can_manage_integrations",
    "can_manage_contact_tags"
  ]);
  const supabase = await createClient();

  let query = supabase
    .from("tag_sync_mappings")
    .select(
      "id,internal_tag_id,external_system,external_tag_identifier,sync_direction,is_active,mapping_status,last_synced_at,updated_at,tags(id,name,path)"
    )
    .eq("organization_id", context.organizationId)
    .order("external_system", { ascending: true })
    .order("external_tag_identifier", { ascending: true });

  const externalSystem = toText(input?.externalSystem);
  const internalTagId = toText(input?.internalTagId);
  if (externalSystem) query = query.eq("external_system", externalSystem);
  if (internalTagId) query = query.eq("internal_tag_id", internalTagId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function upsertTagSyncMapping(input: {
  id?: string;
  internalTagId: string;
  externalSystem: string;
  externalTagIdentifier: string;
  syncDirection: "inbound" | "outbound" | "bidirectional";
  isActive?: boolean;
  mappingStatus?: "mapped" | "pending" | "error";
}) {
  const context = await requireStaffPermission("can_manage_integrations");
  const supabase = await createClient();

  const payload = {
    organization_id: context.organizationId,
    internal_tag_id: toText(input.internalTagId),
    external_system: toText(input.externalSystem),
    external_tag_identifier: toText(input.externalTagIdentifier),
    sync_direction: input.syncDirection,
    is_active: input.isActive ?? true,
    mapping_status: input.mappingStatus ?? "mapped",
    updated_by: context.userId,
    created_by: context.userId,
    updated_at: new Date().toISOString()
  };

  let mapping: Record<string, unknown> | null = null;
  if (toText(input.id)) {
    const { data, error } = await supabase
      .from("tag_sync_mappings")
      .update(payload)
      .eq("organization_id", context.organizationId)
      .eq("id", toText(input.id))
      .select("*")
      .single();
    if (error) throw error;
    mapping = data as Record<string, unknown>;
  } else {
    const { data, error } = await supabase
      .from("tag_sync_mappings")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;
    mapping = data as Record<string, unknown>;
  }

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "tag_mapping_changed",
    targetEntityType: "tag_sync_mappings",
    targetEntityId: toText(mapping?.id),
    metadata: { mapping }
  });

  return mapping;
}

export async function deleteTagSyncMapping(mappingId: string) {
  const context = await requireStaffPermission("can_manage_integrations");
  const supabase = await createClient();

  const { error } = await supabase
    .from("tag_sync_mappings")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("id", mappingId);
  if (error) throw error;

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "tag_mapping_deleted",
    targetEntityType: "tag_sync_mappings",
    targetEntityId: mappingId
  });
}

export async function flattenTagsForContacts(contactIds: string[]) {
  const context = await requireAnyStaffPermission([
    "can_view_contacts",
    "can_manage_integrations",
    "can_assign_contact_tags"
  ]);
  const supabase = await createClient();
  const ids = sanitizeTagIdList(contactIds);
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from("contact_tags")
    .select("contact_id,tags(path,name,slug)")
    .eq("organization_id", context.organizationId)
    .in("contact_id", ids);
  if (error) throw error;

  const flattened: Record<string, Array<{ path: string; name: string; slug: string }>> = {};
  for (const row of data ?? []) {
    const contactId = toText(row.contact_id);
    if (!contactId) continue;
    const tagValue = Array.isArray(row.tags) ? row.tags[0] : row.tags;
    const path = toText((tagValue as Record<string, unknown> | null)?.path);
    const name = toText((tagValue as Record<string, unknown> | null)?.name);
    const slug = toText((tagValue as Record<string, unknown> | null)?.slug);
    if (!path) continue;
    if (!flattened[contactId]) flattened[contactId] = [];
    flattened[contactId].push({ path, name, slug });
  }

  for (const key of Object.keys(flattened)) {
    flattened[key] = flattened[key].sort((a, b) => a.path.localeCompare(b.path));
  }

  return flattened;
}

