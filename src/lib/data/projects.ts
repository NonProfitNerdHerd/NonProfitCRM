import { createClient } from "@/lib/supabase/server";
import { requireSessionContext, requireStaffPermission } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity-log";

export async function canCreateProjects() {
  const context = await requireSessionContext();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("can_create_projects", {
    org_id: context.organizationId
  });

  if (error) throw error;
  return Boolean(data);
}

export async function listProjects() {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, description, status, owner_user_id, created_at")
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getProject(projectId: string) {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();

  const [{ data: project, error: projectError }, { data: tasks, error: tasksError }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, name, description, status, owner_user_id, created_at, updated_at")
        .eq("organization_id", context.organizationId)
        .eq("id", projectId)
        .maybeSingle(),
      supabase
        .from("tasks")
        .select(
          "id, title, description, due_date, status, priority, assigned_to, completed_at, parent_task_id, contacts(first_name,last_name)"
        )
        .eq("organization_id", context.organizationId)
        .eq("project_id", projectId)
        .order("due_date", { ascending: true })
    ]);

  if (projectError) throw projectError;
  if (tasksError) throw tasksError;

  return {
    project,
    tasks: tasks ?? []
  };
}

export async function createProject(input: {
  name: string;
  description?: string;
  status?: string;
}) {
  const context = await requireSessionContext();
  const supabase = await createClient();

  const { data: allowed } = await supabase.rpc("can_create_projects", {
    org_id: context.organizationId
  });

  if (!allowed) {
    throw new Error("You are not allowed to create projects.");
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: context.organizationId,
      name: input.name,
      description: input.description ?? null,
      status: input.status ?? "active",
      owner_user_id: context.userId,
      created_by: context.userId
    })
    .select("id")
    .single();

  if (error) throw error;

  await recordActivity({
    entityType: "project",
    entityId: data.id,
    actionType: "created",
    actionSummary: `Created project ${input.name}`
  });

  return data.id;
}
