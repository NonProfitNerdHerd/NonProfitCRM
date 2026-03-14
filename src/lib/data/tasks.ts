import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity-log";

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
      "id,title,description,due_date,status,priority,assigned_to,completed_at,project_id,parent_task_id,contact_id,contacts(first_name,last_name),projects(name)"
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

export async function taskFilterOptions() {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();

  const [{ data: profiles }, { data: projects }, { data: contacts }] = await Promise.all([
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

  return {
    users: profiles ?? [],
    projects: projects ?? [],
    contacts: contacts ?? []
  };
}

export async function createTask(input: {
  title: string;
  description?: string;
  suspenseDate?: string;
  priority?: string;
  assignedToUserId?: string;
  contactId?: string;
  crmOrganizationId?: string;
  projectId?: string;
  parentTaskId?: string;
}) {
  const context = await requireStaffPermission("can_create_tasks");
  const supabase = await createClient();

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
      organization_id: context.organizationId,
      title: input.title,
      description: input.description ?? null,
      due_date: input.suspenseDate ?? null,
      priority: normalizedPriority,
      status: "todo",
      assigned_to: input.assignedToUserId ?? context.userId,
      contact_id: input.contactId ?? null,
      crm_organization_id: input.crmOrganizationId ?? null,
      project_id: input.projectId ?? null,
      parent_task_id: input.parentTaskId ?? null,
      created_by: context.userId
    })
    .select("id, contact_id")
    .single();

  if (error) throw error;

  await recordActivity({
    entityType: input.parentTaskId ? "subtask" : "task",
    entityId: data.id,
    actionType: "created",
    actionSummary: `Created ${input.parentTaskId ? "subtask" : "task"} ${input.title}`,
    relatedContactId: data.contact_id
  });

  return data.id;
}

export async function updateTaskStatus(input: {
  taskId: string;
  status: "todo" | "in_progress" | "completed" | "blocked" | "cancelled";
}) {
  const context = await requireStaffPermission("can_edit_tasks");
  const supabase = await createClient();

  const updates = {
    status: input.status,
    completed_at: input.status === "completed" ? new Date().toISOString() : null
  };

  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("organization_id", context.organizationId)
    .eq("id", input.taskId)
    .select("id, title, contact_id")
    .single();

  if (error) throw error;

  await recordActivity({
    entityType: "task",
    entityId: data.id,
    actionType: "status_changed",
    actionSummary: `Updated task "${data.title}" to ${input.status}`,
    relatedContactId: data.contact_id
  });
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
      "id,title,description,due_date,status,priority,assigned_to,created_by,completed_at,project_id,parent_task_id,contact_id,crm_organization_id,contacts(first_name,last_name,email),projects(name),crm_organizations(name)"
    )
    .eq("organization_id", context.organizationId)
    .eq("id", taskId)
    .maybeSingle();

  if (error) throw error;

  const { data: subtasks, error: subtasksError } = await supabase
    .from("tasks")
    .select("id,title,status,priority,due_date,assigned_to,completed_at")
    .eq("organization_id", context.organizationId)
    .eq("parent_task_id", taskId)
    .order("due_date", { ascending: true });

  if (subtasksError) throw subtasksError;

  return {
    task: data,
    subtasks: subtasks ?? []
  };
}
