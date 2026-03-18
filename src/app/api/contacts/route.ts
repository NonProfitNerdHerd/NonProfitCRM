import { NextResponse } from "next/server";
import { contactSchema } from "@/lib/validation/contact";
import { createContact } from "@/lib/data/contacts";
import { assignTagsToContact, resolveContactIdsForFilter } from "@/lib/data/tags";
import { logAuditEvent } from "@/lib/data/audit";
import {
  hasAnyStaffPermission,
  requireSessionContext,
  requireStaffPermission
} from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

function parseTagIds(raw: string | null) {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function resolveErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  const candidate = error as { message?: string; details?: string; hint?: string };
  const message = String(candidate?.message ?? candidate?.details ?? candidate?.hint ?? "").trim();
  return message || fallback;
}

export async function GET(request: Request) {
  try {
    const context = await requireStaffPermission("can_view_contacts");
    const supabase = await createClient();
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const requestedMode = url.searchParams.get("mode") ?? "all";
    const allowedModes = new Set([
      "all",
      "donors",
      "contacts",
      "donor_organizations",
      "organizations",
      "personal"
    ]);
    const mode = (allowedModes.has(requestedMode) ? requestedMode : "all") as
      | "all"
      | "donors"
      | "contacts"
      | "donor_organizations"
      | "organizations"
      | "personal";
    const tagMatch = (url.searchParams.get("tagMatch") as "any" | "all" | "none" | null) ?? "any";
    const includeDescendants = ["true", "1", "yes"].includes(
      (url.searchParams.get("includeDescendants") ?? "").toLowerCase()
    );
    const tagIds = parseTagIds(url.searchParams.get("tagIds"));
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 100);

    const resolved = await resolveContactIdsForFilter(
      {
        mode,
        q,
        tagFilter:
          tagIds.length > 0
            ? {
                tagIds,
                match: tagMatch,
                includeDescendants
              }
            : undefined
      },
      { limit: 50000 }
    );

    const canReadTags = await hasAnyStaffPermission(
      ["can_assign_contact_tags", "can_manage_contact_tags"],
      context
    );

    const selectedIds = resolved.contactIds.slice(offset, offset + limit);
    if (selectedIds.length === 0) {
      return NextResponse.json({
        contacts: [],
        totalCount: resolved.contactIds.length,
        offset,
        limit,
        canAssignTags: canReadTags
      });
    }

    const { data, error } = await supabase
      .from("contacts_safe_view")
      .select(
        "id, first_name, last_name, preferred_name, email, phone, organization_name, entity_type, tracking_status, city, state, created_by"
      )
      .eq("organization_id", context.organizationId)
      .in("id", selectedIds)
      .order("last_name", { ascending: true });
    if (error) throw error;

    let assignments: Array<Record<string, unknown>> = [];
    if (canReadTags) {
      const { data: assignmentData, error: assignmentsError } = await supabase
        .from("contact_tags")
        .select("contact_id,tag_id,tags(id,name,slug,path,level,color,is_active)")
        .eq("organization_id", context.organizationId)
        .in("contact_id", selectedIds);
      if (assignmentsError) throw assignmentsError;
      assignments = (assignmentData ?? []) as Array<Record<string, unknown>>;
    }

    const tagsByContact = new Map<string, Array<Record<string, unknown>>>();
    for (const assignment of assignments) {
      const contactId = String(assignment.contact_id ?? "");
      const tag = Array.isArray(assignment.tags) ? assignment.tags[0] : assignment.tags;
      if (!contactId || !tag) continue;
      if (!tagsByContact.has(contactId)) tagsByContact.set(contactId, []);
      tagsByContact.get(contactId)?.push({
        id: String((tag as { id?: string }).id ?? ""),
        name: String((tag as { name?: string }).name ?? ""),
        slug: String((tag as { slug?: string }).slug ?? ""),
        path: String((tag as { path?: string }).path ?? ""),
        level: Number((tag as { level?: number }).level ?? 1),
        color: ((tag as { color?: string | null }).color ?? null) as string | null,
        isActive: Boolean((tag as { is_active?: boolean }).is_active)
      });
    }

    const contacts = (data ?? []).map((contact) => {
      const contactId = String(contact.id ?? "");
      const assignedTags = (tagsByContact.get(contactId) ?? []).sort((a, b) =>
        String(a.path ?? "").localeCompare(String(b.path ?? ""))
      );
      return {
        ...contact,
        assigned_tags: assignedTags,
        tag_paths: assignedTags.map((tag) => String(tag.path ?? ""))
      };
    });

    return NextResponse.json({
      contacts,
      totalCount: resolved.contactIds.length,
      offset,
      limit,
      canAssignTags: canReadTags
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: resolveErrorMessage(error, "Unable to load contacts")
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const requestedTagIds = Array.isArray(payload?.tag_ids)
      ? payload.tag_ids.map((entry: unknown) => String(entry ?? "").trim()).filter(Boolean)
      : [];
    const parsed = contactSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "Validation error",
          issues: parsed.error.flatten()
        },
        { status: 400 }
      );
    }

    const context = await requireSessionContext();
    const id = await createContact(parsed.data);
    if (requestedTagIds.length > 0) {
      await assignTagsToContact({
        contactId: id,
        tagIds: requestedTagIds,
        assignmentSource: "manual",
        actionSource: "contact_create"
      });
    }
    await logAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      actionType: "contact_created",
      targetEntityType: "contacts",
      targetEntityId: id,
      metadata: { contains_pii: true }
    });

    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      {
        message: resolveErrorMessage(error, "Unable to create contact")
      },
      { status: 500 }
    );
  }
}
