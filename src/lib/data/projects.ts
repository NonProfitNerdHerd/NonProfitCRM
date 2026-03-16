import { createClient } from "@/lib/supabase/server";
import { requireSessionContext, requireStaffPermission } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity-log";
import { createNotification } from "@/lib/data/notifications";
import { logAuditEvent } from "@/lib/data/audit";

export async function canCreateProjects() {
  const context = await requireSessionContext();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("can_create_projects", {
    org_id: context.organizationId
  });

  if (error) throw error;
  return Boolean(data);
}

export async function listProjects(filters?: {
  status?: "active" | "on_hold" | "completed" | "cancelled" | "all";
  q?: string;
}) {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();

  let query = supabase
    .from("projects")
    .select(
      "id, name, description, status, project_start_date, expected_end_date, owner_user_id, project_manager_user_id, created_at"
    )
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false });

  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters?.q?.trim()) {
    const like = `%${filters.q.trim()}%`;
    query = query.or(`name.ilike.${like},description.ilike.${like}`);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data ?? [];
}

export async function getProject(projectId: string) {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();

  const [
    { data: project, error: projectError },
    { data: tasks, error: tasksError },
    { data: staff, error: staffError },
    { data: stakeholders, error: stakeholderError }
  ] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, name, description, status, project_start_date, expected_end_date, owner_user_id, project_manager_user_id, created_at, updated_at"
        )
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
        .order("due_date", { ascending: true }),
      supabase
        .from("project_staff")
        .select("id, user_id, role_on_project")
        .eq("organization_id", context.organizationId)
        .eq("project_id", projectId)
        .order("created_at", { ascending: true }),
      supabase
        .from("project_stakeholders")
        .select(
          "id, stakeholder_name, stakeholder_role_title, stakeholder_organization, stakeholder_type, influence_level, interest_level, support_level, engagement_strategy, communication_needs, owner_user_id, contact_info, created_at"
        )
        .eq("organization_id", context.organizationId)
        .eq("project_id", projectId)
        .order("created_at", { ascending: true })
    ]);

  if (projectError) throw projectError;
  if (tasksError) throw tasksError;
  if (staffError) throw staffError;
  if (stakeholderError) throw stakeholderError;

  const now = new Date();
  const inThirtyDays = new Date(now);
  inThirtyDays.setDate(now.getDate() + 30);
  const groupedTasks = {
    overdue: (tasks ?? []).filter(
      (task) =>
        !task.completed_at && task.status !== "cancelled" && task.due_date && new Date(task.due_date) < now
    ),
    upcoming: (tasks ?? []).filter((task) => {
      if (task.completed_at || task.status === "cancelled" || !task.due_date) return false;
      const due = new Date(task.due_date);
      return due >= now && due <= inThirtyDays;
    }),
    completed: (tasks ?? []).filter((task) => task.completed_at || task.status === "completed"),
    cancelled: (tasks ?? []).filter((task) => task.status === "cancelled"),
    all: tasks ?? []
  };

  return {
    project,
    tasks: tasks ?? [],
    groupedTasks,
    staff: staff ?? [],
    stakeholders: stakeholders ?? []
  };
}

export async function createProject(input: {
  name: string;
  description?: string;
  status?: string;
  projectStartDate?: string;
  expectedEndDate?: string;
  projectManagerUserId?: string;
  ownerUserId?: string;
  assignedStaff?: Array<{ userId: string; roleOnProject: string }>;
  stakeholders?: Array<{
    stakeholderName: string;
    stakeholderRoleTitle?: string;
    organization?: string;
    stakeholderType?: string;
    influenceLevel?: string;
    interestLevel?: string;
    supportLevel?: string;
    engagementStrategy?: string;
    communicationNeeds?: string;
    ownerUserId?: string;
    contactInfo?: string;
  }>;
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
      project_start_date: input.projectStartDate ?? null,
      expected_end_date: input.expectedEndDate ?? null,
      owner_user_id: input.ownerUserId ?? context.userId,
      project_manager_user_id: input.projectManagerUserId ?? context.userId,
      created_by: context.userId
    })
    .select("id, project_manager_user_id")
    .single();

  if (error) throw error;

  const staffToAdd = input.assignedStaff ?? [];
  if (
    data.project_manager_user_id &&
    !staffToAdd.some((member) => member.userId === data.project_manager_user_id)
  ) {
    staffToAdd.unshift({
      userId: data.project_manager_user_id,
      roleOnProject: "Project Manager"
    });
  }

  if (staffToAdd.length > 0) {
    const { error: staffError } = await supabase.from("project_staff").insert(
      staffToAdd.map((member) => ({
        organization_id: context.organizationId,
        project_id: data.id,
        user_id: member.userId,
        role_on_project: member.roleOnProject,
        created_by: context.userId
      }))
    );
    if (staffError) throw staffError;
  }

  if ((input.stakeholders ?? []).length > 0) {
    const { error: stakeholderError } = await supabase.from("project_stakeholders").insert(
      (input.stakeholders ?? []).map((stakeholder) => ({
        organization_id: context.organizationId,
        project_id: data.id,
        stakeholder_name: stakeholder.stakeholderName,
        stakeholder_role_title: stakeholder.stakeholderRoleTitle ?? null,
        stakeholder_organization: stakeholder.organization ?? null,
        stakeholder_type: stakeholder.stakeholderType ?? "External",
        influence_level: stakeholder.influenceLevel ?? null,
        interest_level: stakeholder.interestLevel ?? null,
        support_level: stakeholder.supportLevel ?? null,
        engagement_strategy: stakeholder.engagementStrategy ?? null,
        communication_needs: stakeholder.communicationNeeds ?? null,
        owner_user_id: stakeholder.ownerUserId ?? null,
        contact_info: stakeholder.contactInfo ?? null,
        created_by: context.userId
      }))
    );
    if (stakeholderError) throw stakeholderError;
  }

  await recordActivity({
    entityType: "project",
    entityId: data.id,
    actionType: "created",
    actionSummary: `Created project ${input.name}`
  });
  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "project_created",
    targetEntityType: "projects",
    targetEntityId: data.id,
    metadata: {
      projectName: input.name,
      projectManagerUserId: data.project_manager_user_id
    }
  });

  for (const member of staffToAdd) {
    if (member.userId === context.userId) continue;
    await createNotification({
      recipientUserId: member.userId,
      type: "project_assignment",
      message: `You were added to project "${input.name}" as ${member.roleOnProject}.`,
      relatedEntityType: "project",
      relatedEntityId: data.id,
      actionUrl: `/staff/projects/${data.id}`
    });
  }

  return data.id;
}

export async function addProjectStaff(
  projectId: string,
  member: { userId: string; roleOnProject: string }
) {
  const context = await requireSessionContext();
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("organization_id", context.organizationId)
    .eq("id", projectId)
    .single();

  const { error } = await supabase.from("project_staff").upsert(
    {
      organization_id: context.organizationId,
      project_id: projectId,
      user_id: member.userId,
      role_on_project: member.roleOnProject,
      created_by: context.userId
    },
    { onConflict: "project_id,user_id" }
  );
  if (error) throw error;

  if (member.userId !== context.userId) {
    await createNotification({
      recipientUserId: member.userId,
      type: "project_assignment",
      message: `You were added to project "${project?.name ?? "project"}" as ${member.roleOnProject}.`,
      relatedEntityType: "project",
      relatedEntityId: projectId,
      actionUrl: `/staff/projects/${projectId}`
    });
  }
}

export async function upsertProjectStakeholder(
  projectId: string,
  stakeholder: {
    id?: string;
    stakeholderName: string;
    stakeholderRoleTitle?: string;
    organization?: string;
    stakeholderType?: string;
    influenceLevel?: string;
    interestLevel?: string;
    supportLevel?: string;
    engagementStrategy?: string;
    communicationNeeds?: string;
    ownerUserId?: string;
    contactInfo?: string;
  }
) {
  const context = await requireSessionContext();
  const supabase = await createClient();

  const payload = {
    id: stakeholder.id,
    organization_id: context.organizationId,
    project_id: projectId,
    stakeholder_name: stakeholder.stakeholderName,
    stakeholder_role_title: stakeholder.stakeholderRoleTitle ?? null,
    stakeholder_organization: stakeholder.organization ?? null,
    stakeholder_type: stakeholder.stakeholderType ?? "External",
    influence_level: stakeholder.influenceLevel ?? null,
    interest_level: stakeholder.interestLevel ?? null,
    support_level: stakeholder.supportLevel ?? null,
    engagement_strategy: stakeholder.engagementStrategy ?? null,
    communication_needs: stakeholder.communicationNeeds ?? null,
    owner_user_id: stakeholder.ownerUserId ?? null,
    contact_info: stakeholder.contactInfo ?? null,
    created_by: context.userId
  };

  const { data, error } = await supabase
    .from("project_stakeholders")
    .upsert(payload)
    .select("id")
    .single();
  if (error) throw error;

  await recordActivity({
    entityType: "project_stakeholder",
    entityId: data.id,
    actionType: stakeholder.id ? "updated" : "created",
    actionSummary: `${
      stakeholder.id ? "Updated" : "Added"
    } stakeholder ${stakeholder.stakeholderName} on project`,
    relatedContactId: null
  });

  return data.id;
}

export async function removeProjectStakeholder(projectId: string, stakeholderId: string) {
  const context = await requireSessionContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("project_stakeholders")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("project_id", projectId)
    .eq("id", stakeholderId);
  if (error) throw error;
}
