import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity-log";
import { createNotification } from "@/lib/data/notifications";
import { resolveMentions } from "@/lib/data/users";
import { ensureConstituentOutreachProject } from "@/lib/data/projects";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function effectiveTaskStatus(task: {
  status: string;
  due_date: string | null;
  completed_at: string | null;
}): "Open" | "In Progress" | "Completed" | "Overdue" {
  if (task.completed_at || task.status === "completed") return "Completed";
  if (task.due_date && new Date(task.due_date) < new Date()) return "Overdue";
  if (task.status === "in_progress") return "In Progress";
  return "Open";
}

function parseMentionTokens(commentBody: string) {
  const regex = /@([a-zA-Z0-9._-]+)/g;
  const tokens = new Set<string>();
  let match: RegExpExecArray | null = regex.exec(commentBody);
  while (match) {
    tokens.add(match[1]);
    match = regex.exec(commentBody);
  }
  return Array.from(tokens);
}

export async function listTasks(filters?: {
  assignedTo?: string;
  status?: string;
  projectId?: string;
  contactId?: string;
  dueFrom?: string;
  dueTo?: string;
}) {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();

  let query = supabase
    .from("tasks")
    .select(
      "id,title,description,due_date,start_date,end_date,status,priority,assigned_to,owner_user_id,estimated_hours,actual_hours,percent_complete,milestone_id,blocking_note,completed_at,project_id,parent_task_id,contact_id,contacts(first_name,last_name),projects(name)"
    )
    .eq("organization_id", context.organizationId)
    .order("due_date", { ascending: true })
    .limit(500);

  if (filters?.assignedTo) query = query.eq("assigned_to", filters.assignedTo);
  if (filters?.projectId) query = query.eq("project_id", filters.projectId);
  if (filters?.contactId) query = query.eq("contact_id", filters.contactId);
  if (filters?.dueFrom) query = query.gte("due_date", filters.dueFrom);
  if (filters?.dueTo) query = query.lte("due_date", filters.dueTo);
  if (filters?.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((task) => ({
    ...task,
    effective_status: effectiveTaskStatus(task)
  }));
}

export async function listMyCallSheetTasks() {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id,title,description,priority,status,created_by,created_at,contact_id,contacts(first_name,last_name,preferred_name,phone)"
    )
    .eq("organization_id", context.organizationId)
    .eq("assigned_to", context.userId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;

  const rows = (data ?? []).filter((row) => {
    const status = toText(row.status).toLowerCase();
    if (status === "completed" || status === "cancelled") return false;
    const title = toText(row.title).toLowerCase();
    const description = toText(row.description).toLowerCase();
    return (
      title.includes("call") ||
      description.includes("follow-up type: call") ||
      /\bcall\b/.test(description)
    );
  });

  const creatorIds = Array.from(
    new Set(rows.map((row) => toText(row.created_by)).filter(Boolean))
  );
  const { data: creatorProfiles, error: creatorError } = creatorIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", creatorIds)
    : { data: [], error: null as null | Error };
  if (creatorError) throw creatorError;
  const creatorMap = new Map(
    (creatorProfiles ?? []).map((profile) => [
      toText(profile.id),
      toText(profile.display_name) || toText(profile.id)
    ])
  );

  return rows.map((row) => {
    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
    const preferredName = toText((contact as Record<string, unknown> | null)?.preferred_name);
    const firstName = toText((contact as Record<string, unknown> | null)?.first_name);
    const lastName = toText((contact as Record<string, unknown> | null)?.last_name);
    const contactName = preferredName || `${firstName} ${lastName}`.trim() || "Unknown Contact";
    const createdById = toText(row.created_by);
    return {
      id: toText(row.id),
      title: toText(row.title) || "Task",
      description: toText(row.description) || "",
      priority: toText(row.priority) || "medium",
      createdAt: toText(row.created_at) || null,
      createdBy: creatorMap.get(createdById) || createdById || "Unknown",
      contactName,
      contactPhone: toText((contact as Record<string, unknown> | null)?.phone) || "-"
    };
  });
}

export async function taskFilterOptions() {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();

  const [{ data: memberships }, { data: projects }, { data: contacts }] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select("user_id")
      .eq("organization_id", context.organizationId)
      .eq("is_active", true),
    supabase
      .from("projects")
      .select("id, name")
      .eq("organization_id", context.organizationId)
      .order("name", { ascending: true }),
    supabase
      .from("contacts")
      .select("id, first_name, last_name")
      .eq("organization_id", context.organizationId)
      .order("last_name", { ascending: true })
  ]);

  const userIds = (memberships ?? []).map((entry) => entry.user_id);
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", userIds)
    : { data: [] as Array<{ id: string; display_name: string | null }> };
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));

  const users = (memberships ?? []).map((entry) => ({
    user_id: entry.user_id as string,
    display_name: profileMap.get(entry.user_id as string) ?? null
  }));

  return {
    users,
    projects: projects ?? [],
    contacts: contacts ?? []
  };
}

export type TaskAssociationContactOption = {
  id: string;
  label: string;
  category: "Donor" | "Contact" | "Donor Organization" | "Organization";
  searchText: string;
};

function deriveTaskAssociationLabel(row: Record<string, unknown>) {
  const entityType = toText(row.entity_type).toLowerCase() === "organization" ? "organization" : "person";
  const preferredName = toText(row.preferred_name);
  const firstName = toText(row.first_name);
  const lastName = toText(row.last_name);
  const organizationName = toText(row.organization_name);
  if (entityType === "organization") {
    return organizationName || preferredName || [firstName, lastName].filter(Boolean).join(" ") || "Unnamed Organization";
  }
  return preferredName || [firstName, lastName].filter(Boolean).join(" ") || "Unnamed Contact";
}

export async function listTaskAssociationContacts(): Promise<TaskAssociationContactOption[]> {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();
  const selectColumns =
    "id,first_name,last_name,preferred_name,organization_name,entity_type,tracking_status,donor_status,email,phone";
  const [donorsResult, contactsResult, donorOrganizationsResult, organizationsResult] = await Promise.all([
    supabase
      .from("contacts_safe_view")
      .select(selectColumns)
      .eq("organization_id", context.organizationId)
      .eq("entity_type", "person")
      .eq("tracking_status", "donor")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
      .limit(600),
    supabase
      .from("contacts_safe_view")
      .select(selectColumns)
      .eq("organization_id", context.organizationId)
      .eq("entity_type", "person")
      .in("tracking_status", ["lead", "non_lead"])
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
      .limit(600),
    supabase
      .from("contacts_safe_view")
      .select(selectColumns)
      .eq("organization_id", context.organizationId)
      .eq("entity_type", "organization")
      .eq("tracking_status", "donor")
      .order("organization_name", { ascending: true })
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
      .limit(600),
    supabase
      .from("contacts_safe_view")
      .select(selectColumns)
      .eq("organization_id", context.organizationId)
      .eq("entity_type", "organization")
      .in("tracking_status", ["lead", "non_lead"])
      .order("organization_name", { ascending: true })
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
      .limit(600)
  ]);
  if (donorsResult.error) throw donorsResult.error;
  if (contactsResult.error) throw contactsResult.error;
  if (donorOrganizationsResult.error) throw donorOrganizationsResult.error;
  if (organizationsResult.error) throw organizationsResult.error;

  const groupedRows: Array<{
    category: TaskAssociationContactOption["category"];
    rows: Array<Record<string, unknown>>;
  }> = [
    {
      category: "Donor",
      rows: (donorsResult.data ?? []) as Array<Record<string, unknown>>
    },
    {
      category: "Contact",
      rows: (contactsResult.data ?? []) as Array<Record<string, unknown>>
    },
    {
      category: "Donor Organization",
      rows: (donorOrganizationsResult.data ?? []) as Array<Record<string, unknown>>
    },
    {
      category: "Organization",
      rows: (organizationsResult.data ?? []) as Array<Record<string, unknown>>
    }
  ];

  const categoryRank: Record<TaskAssociationContactOption["category"], number> = {
    Donor: 0,
    Contact: 1,
    "Donor Organization": 2,
    Organization: 3
  };
  const options: TaskAssociationContactOption[] = [];
  const seenIds = new Set<string>();
  for (const group of groupedRows) {
    for (const row of group.rows) {
      const id = toText(row.id);
      if (!id || seenIds.has(id)) continue;
      const label = deriveTaskAssociationLabel(row);
      if (!label) continue;
      const searchText = [
        label,
        toText(row.first_name),
        toText(row.last_name),
        toText(row.preferred_name),
        toText(row.organization_name),
        toText(row.email),
        toText(row.phone),
        group.category
      ]
        .join(" ")
        .toLowerCase();
      options.push({ id, label, category: group.category, searchText });
      seenIds.add(id);
    }
  }

  return options.sort((left, right) => {
    const categoryDelta = categoryRank[left.category] - categoryRank[right.category];
    if (categoryDelta !== 0) return categoryDelta;
    return left.label.localeCompare(right.label);
  });
}

export async function createTask(input: {
  title: string;
  description?: string;
  suspenseDate?: string;
  startDate?: string;
  endDate?: string;
  priority?: string;
  assignedToUserId?: string;
  ownerUserId?: string;
  contactId?: string;
  crmOrganizationId?: string;
  projectId?: string;
  parentTaskId?: string;
  estimatedHours?: number;
  actualHours?: number;
  percentComplete?: number;
  milestoneId?: string;
  blockingNote?: string;
}) {
  const context = await requireStaffPermission("can_create_tasks");
  const supabase = await createClient();
  const projectId =
    input.projectId ??
    (await ensureConstituentOutreachProject({
      organizationId: context.organizationId,
      userId: context.userId
    }));

  const normalizedPriority: "low" | "medium" | "high" | "urgent" =
    input.priority === "low" ||
    input.priority === "medium" ||
    input.priority === "high" ||
    input.priority === "urgent"
      ? input.priority
      : "medium";

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      tenant_id: context.organizationId,
      organization_id: context.organizationId,
      title: input.title,
      description: input.description ?? null,
      due_date: input.suspenseDate ?? null,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      priority: normalizedPriority,
      status: "todo",
      assigned_to: input.assignedToUserId ?? context.userId,
      owner_user_id: input.ownerUserId ?? input.assignedToUserId ?? context.userId,
      contact_id: input.contactId ?? null,
      crm_organization_id: input.crmOrganizationId ?? null,
      project_id: projectId,
      parent_task_id: input.parentTaskId ?? null,
      estimated_hours: typeof input.estimatedHours === "number" ? input.estimatedHours : null,
      actual_hours: typeof input.actualHours === "number" ? input.actualHours : null,
      percent_complete: typeof input.percentComplete === "number" ? input.percentComplete : 0,
      milestone_id: input.milestoneId ?? null,
      blocking_note: input.blockingNote ?? null,
      created_by: context.userId
    })
    .select("id, contact_id, assigned_to")
    .single();

  if (error) throw error;

  await recordActivity({
    entityType: input.parentTaskId ? "subtask" : "task",
    entityId: data.id,
    actionType: "created",
    actionSummary: `Created ${input.parentTaskId ? "subtask" : "task"} ${input.title}`,
    relatedContactId: data.contact_id
  });

  if (data.assigned_to && data.assigned_to !== context.userId) {
    await createNotification({
      recipientUserId: data.assigned_to as string,
      type: "task_assignment",
      message: `A new task "${input.title}" was assigned to you.`,
      relatedEntityType: "task",
      relatedEntityId: data.id,
      actionUrl: `/staff/tasks/${data.id}`
    });
  }

  return data.id;
}

export async function updateTask(input: {
  taskId: string;
  title?: string;
  description?: string;
  status?: "todo" | "in_progress" | "completed" | "blocked" | "cancelled";
  priority?: "low" | "medium" | "high" | "urgent";
  suspenseDate?: string;
  startDate?: string;
  endDate?: string;
  assignedToUserId?: string | null;
  ownerUserId?: string | null;
  estimatedHours?: number;
  actualHours?: number;
  percentComplete?: number;
  milestoneId?: string | null;
  blockingNote?: string;
}) {
  const context = await requireStaffPermission("can_edit_tasks");
  const supabase = await createClient();

  const { data: previous, error: previousError } = await supabase
    .from("tasks")
    .select("id, title, assigned_to, contact_id")
    .eq("organization_id", context.organizationId)
    .eq("id", input.taskId)
    .single();
  if (previousError) throw previousError;

  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description || null;
  if (input.status !== undefined) {
    updates.status = input.status;
    updates.completed_at = input.status === "completed" ? new Date().toISOString() : null;
  }
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.suspenseDate !== undefined) updates.due_date = input.suspenseDate || null;
  if (input.startDate !== undefined) updates.start_date = input.startDate || null;
  if (input.endDate !== undefined) updates.end_date = input.endDate || null;
  if (input.assignedToUserId !== undefined) updates.assigned_to = input.assignedToUserId;
  if (input.ownerUserId !== undefined) updates.owner_user_id = input.ownerUserId;
  if (input.estimatedHours !== undefined) updates.estimated_hours = input.estimatedHours;
  if (input.actualHours !== undefined) updates.actual_hours = input.actualHours;
  if (input.percentComplete !== undefined) updates.percent_complete = input.percentComplete;
  if (input.milestoneId !== undefined) updates.milestone_id = input.milestoneId;
  if (input.blockingNote !== undefined) updates.blocking_note = input.blockingNote || null;

  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("organization_id", context.organizationId)
    .eq("id", input.taskId)
    .select("id, title, assigned_to, contact_id")
    .single();
  if (error) throw error;

  await recordActivity({
    entityType: "task",
    entityId: data.id,
    actionType: "updated",
    actionSummary: `Updated task "${data.title}"`,
    relatedContactId: data.contact_id
  });

  if (
    data.assigned_to &&
    data.assigned_to !== context.userId &&
    data.assigned_to !== previous.assigned_to
  ) {
    await createNotification({
      recipientUserId: data.assigned_to as string,
      type: "task_assignment",
      message: `Task "${data.title}" was assigned to you.`,
      relatedEntityType: "task",
      relatedEntityId: data.id,
      actionUrl: `/staff/tasks/${data.id}`
    });
  }
}

export async function updateTaskStatus(input: {
  taskId: string;
  status: "todo" | "in_progress" | "completed" | "blocked" | "cancelled";
}) {
  return updateTask({ taskId: input.taskId, status: input.status });
}

export async function dashboardTaskBuckets(projectId?: string) {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();

  let query = supabase
    .from("tasks")
    .select(
      "id,title,description,due_date,status,priority,assigned_to,completed_at,project_id,contact_id,contacts(first_name,last_name),projects(name)"
    )
    .eq("organization_id", context.organizationId)
    .eq("assigned_to", context.userId)
    .order("due_date", { ascending: true })
    .limit(500);

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const now = new Date();
  const inThirtyDays = new Date(now);
  inThirtyDays.setDate(inThirtyDays.getDate() + 30);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const tasks = data ?? [];

  const overdue = tasks.filter((task) => effectiveTaskStatus(task) === "Overdue");
  const upcoming = tasks.filter((task) => {
    if (!task.due_date || effectiveTaskStatus(task) === "Completed") return false;
    const due = new Date(task.due_date);
    return due >= now && due <= inThirtyDays;
  });
  const allTasks = tasks.filter((task) => effectiveTaskStatus(task) !== "Completed");
  const recentlyCompleted = tasks.filter((task) => {
    if (!task.completed_at) return false;
    const completedAt = new Date(task.completed_at);
    return completedAt >= thirtyDaysAgo;
  });

  return {
    overdue,
    upcoming,
    allTasks,
    recentlyCompleted
  };
}

export async function getTask(taskId: string) {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id,title,description,due_date,start_date,end_date,status,priority,assigned_to,owner_user_id,estimated_hours,actual_hours,percent_complete,milestone_id,blocking_note,created_by,completed_at,project_id,parent_task_id,contact_id,crm_organization_id,contacts(first_name,last_name,email),projects(name),crm_organizations(name)"
    )
    .eq("organization_id", context.organizationId)
    .eq("id", taskId)
    .maybeSingle();

  if (error) throw error;

  const [{ data: subtasks, error: subtasksError }, { data: comments, error: commentsError }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id,title,status,priority,due_date,assigned_to,owner_user_id,percent_complete,completed_at")
        .eq("organization_id", context.organizationId)
        .eq("parent_task_id", taskId)
        .order("due_date", { ascending: true }),
      supabase
        .from("task_comments")
        .select("id, author_user_id, comment_body, created_at, updated_at")
        .eq("organization_id", context.organizationId)
        .eq("task_id", taskId)
        .order("created_at", { ascending: true })
    ]);

  if (subtasksError) throw subtasksError;
  if (commentsError) throw commentsError;

  return {
    task: data,
    subtasks: subtasks ?? [],
    comments: comments ?? []
  };
}

export async function addTaskComment(input: { taskId: string; commentBody: string }) {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, title, contact_id, assigned_to")
    .eq("organization_id", context.organizationId)
    .eq("id", input.taskId)
    .single();
  if (taskError) throw taskError;

  const { data, error } = await supabase
    .from("task_comments")
    .insert({
      organization_id: context.organizationId,
      task_id: input.taskId,
      author_user_id: context.userId,
      comment_body: input.commentBody
    })
    .select("id")
    .single();
  if (error) throw error;

  await recordActivity({
    entityType: "task_comment",
    entityId: data.id,
    actionType: "created",
    actionSummary: `Comment added to task "${task.title}"`,
    relatedContactId: task.contact_id
  });

  if (task.assigned_to && task.assigned_to !== context.userId) {
    await createNotification({
      recipientUserId: task.assigned_to as string,
      type: "task_comment",
      message: `A comment was added on task "${task.title}".`,
      relatedEntityType: "task",
      relatedEntityId: task.id,
      actionUrl: `/staff/tasks/${task.id}`
    });
  }

  const mentions = parseMentionTokens(input.commentBody);
  const mentionedUserIds = await resolveMentions(mentions);
  for (const userId of mentionedUserIds) {
    if (userId === context.userId) continue;
    await createNotification({
      recipientUserId: userId,
      type: "task_mention",
      message: `You were mentioned in a comment on "${task.title}".`,
      relatedEntityType: "task",
      relatedEntityId: task.id,
      actionUrl: `/staff/tasks/${task.id}`
    });
  }
}
