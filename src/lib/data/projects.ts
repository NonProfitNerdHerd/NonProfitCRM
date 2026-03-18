import { createClient } from "@/lib/supabase/server";
import { requireSessionContext, requireStaffPermission } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity-log";
import { createNotification } from "@/lib/data/notifications";
import { logAuditEvent } from "@/lib/data/audit";

const LIFECYCLE_TO_STATUS: Record<string, "active" | "on_hold" | "completed" | "cancelled"> = {
  idea: "active",
  under_review: "active",
  approved: "active",
  planning: "active",
  active: "active",
  on_hold: "on_hold",
  completed: "completed",
  cancelled: "cancelled",
  archived: "completed"
};

function isProjectExpensesSchemaMissingError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = String((error as { message?: unknown }).message ?? "").toLowerCase();
  const code = String((error as { code?: unknown }).code ?? "").toLowerCase();
  return (
    code === "42p01" ||
    code === "pgrst205" ||
    message.includes("project_expenses") && message.includes("schema cache")
  );
}

function isBlank(value: string | null | undefined) {
  return !value || !value.trim();
}

function isIntakeComplete(project: Record<string, unknown> | null) {
  if (!project) return false;
  return (
    !isBlank(String(project.problem_statement ?? "")) &&
    !isBlank(String(project.business_justification ?? "")) &&
    !isBlank(String(project.expected_outcomes ?? "")) &&
    !isBlank(String(project.success_criteria ?? "")) &&
    !isBlank(String(project.requestor_name ?? "")) &&
    !isBlank(String(project.executive_sponsor_name ?? ""))
  );
}

function isScopeComplete(scope: Record<string, unknown> | null) {
  if (!scope) return false;
  return !isBlank(String(scope.in_scope ?? "")) && !isBlank(String(scope.out_of_scope ?? ""));
}

function isReviewComplete(review: Record<string, unknown> | null) {
  if (!review) return false;
  return (
    !isBlank(String(review.final_outcome_summary ?? "")) &&
    typeof review.met_success_criteria === "boolean" &&
    !isBlank(String(review.budget_variance_explanation ?? "")) &&
    !isBlank(String(review.lessons_learned ?? "")) &&
    !isBlank(String(review.would_do_again ?? ""))
  );
}

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
  status?:
    | "idea"
    | "under_review"
    | "approved"
    | "planning"
    | "active"
    | "on_hold"
    | "completed"
    | "cancelled"
    | "archived"
    | "all";
  q?: string;
}) {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();

  let query = supabase
    .from("projects")
    .select(
      "id, name, description, status, lifecycle_status, project_start_date, expected_end_date, owner_user_id, project_manager_user_id, created_at"
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
    { data: stakeholders, error: stakeholderError },
    { data: scope, error: scopeError },
    { data: scopeChanges, error: scopeChangesError },
    { data: milestones, error: milestonesError },
    { data: risks, error: risksError },
    { data: budget, error: budgetError },
    { data: resources, error: resourcesError },
    { data: decisions, error: decisionsError },
    { data: updates, error: updatesError },
    { data: review, error: reviewError },
    { data: projectExpenses, error: projectExpensesError }
  ] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, name, description, status, lifecycle_status, project_start_date, expected_end_date, owner_user_id, project_manager_user_id, problem_statement, business_justification, expected_outcomes, success_criteria, rough_cost_estimate, rough_time_estimate_weeks, strategic_alignment, requestor_name, executive_sponsor_name, score_impact, score_effort, score_risk, guardrail_bypass_acknowledged, guardrail_bypass_note, created_at, updated_at"
        )
        .eq("organization_id", context.organizationId)
        .eq("id", projectId)
        .maybeSingle(),
      supabase
        .from("tasks")
        .select(
          "id, title, description, due_date, start_date, end_date, status, priority, assigned_to, owner_user_id, estimated_hours, actual_hours, percent_complete, blocking_note, milestone_id, completed_at, parent_task_id, contacts(first_name,last_name)"
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
        .order("created_at", { ascending: true }),
      supabase
        .from("project_scopes")
        .select("id, in_scope, out_of_scope, assumptions, constraints, dependencies, updated_at")
        .eq("organization_id", context.organizationId)
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase
        .from("project_scope_change_log")
        .select(
          "id, change_summary, change_reason, impact_summary, requested_by, approved_by, effective_date, created_at"
        )
        .eq("organization_id", context.organizationId)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("project_milestones")
        .select("id, milestone_name, description, due_date, owner_user_id, status, percent_complete")
        .eq("organization_id", context.organizationId)
        .eq("project_id", projectId)
        .order("due_date", { ascending: true }),
      supabase
        .from("project_risks")
        .select(
          "id, risk_title, risk_description, likelihood, impact, mitigation_plan, owner_user_id, status, target_resolution_date, updated_at"
        )
        .eq("organization_id", context.organizationId)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("project_budget")
        .select("id, approved_budget, forecasted_spend, actual_spend, variance, notes, updated_at")
        .eq("organization_id", context.organizationId)
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase
        .from("project_resources")
        .select(
          "id, resource_name, role_name, allocation_percent, planned_hours, actual_hours, cost_rate, notes"
        )
        .eq("organization_id", context.organizationId)
        .eq("project_id", projectId)
        .order("created_at", { ascending: true }),
      supabase
        .from("project_decision_log")
        .select("id, decision_summary, decision_details, decided_at, decided_by_user_id")
        .eq("organization_id", context.organizationId)
        .eq("project_id", projectId)
        .order("decided_at", { ascending: false }),
      supabase
        .from("project_updates")
        .select("id, update_title, update_body, health_status, published_at")
        .eq("organization_id", context.organizationId)
        .eq("project_id", projectId)
        .order("published_at", { ascending: false }),
      supabase
        .from("project_reviews")
        .select(
          "id, final_outcome_summary, met_success_criteria, budget_variance_explanation, lessons_learned, would_do_again, review_completed_at, updated_at"
        )
        .eq("organization_id", context.organizationId)
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase
        .from("project_expenses")
        .select("id, expense_type, amount, entry_date, description, campaign_id")
        .eq("organization_id", context.organizationId)
        .eq("project_id", projectId)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
    ]);

  const taskIds = (tasks ?? []).map((task) => String(task.id));
  const { data: taskDependencies, error: taskDependenciesError } = taskIds.length
    ? await supabase
        .from("task_dependencies")
        .select("id, task_id, prerequisite_task_id, dependency_type, note")
        .eq("organization_id", context.organizationId)
        .in("task_id", taskIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null as null | Error };

  if (taskDependenciesError) throw taskDependenciesError;

  if (projectError) throw projectError;
  if (tasksError) throw tasksError;
  if (staffError) throw staffError;
  if (stakeholderError) throw stakeholderError;
  if (scopeError) throw scopeError;
  if (scopeChangesError) throw scopeChangesError;
  if (milestonesError) throw milestonesError;
  if (risksError) throw risksError;
  if (budgetError) throw budgetError;
  if (resourcesError) throw resourcesError;
  if (decisionsError) throw decisionsError;
  if (updatesError) throw updatesError;
  if (reviewError) throw reviewError;
  if (projectExpensesError && !isProjectExpensesSchemaMissingError(projectExpensesError)) {
    throw projectExpensesError;
  }

  const now = new Date();
  const inThirtyDays = new Date(now);
  inThirtyDays.setDate(now.getDate() + 30);
  const completedTaskIds = new Set(
    (tasks ?? [])
      .filter((task) => task.completed_at || task.status === "completed")
      .map((task) => String(task.id))
  );
  const blockingDependencies = (taskDependencies ?? []).filter(
    (dependency) => !completedTaskIds.has(String(dependency.prerequisite_task_id))
  );
  const blockedWithoutDependencies = (tasks ?? []).filter(
    (task) =>
      task.status === "blocked" &&
      !(taskDependencies ?? []).some((dependency) => String(dependency.task_id) === String(task.id))
  );
  const ownershipWarnings = (tasks ?? []).filter((task) => !task.owner_user_id).length;

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

  const taskProgressValues = (tasks ?? []).map((task) => {
    if (typeof task.percent_complete === "number") return task.percent_complete;
    if (task.completed_at || task.status === "completed") return 100;
    if (task.status === "in_progress") return 50;
    return 0;
  });
  const milestoneProgressValues = (milestones ?? []).map((milestone) =>
    typeof milestone.percent_complete === "number" ? milestone.percent_complete : 0
  );
  const percentCompleteSource =
    taskProgressValues.length > 0 ? taskProgressValues : milestoneProgressValues;
  const percentComplete =
    percentCompleteSource.length > 0
      ? Math.round(
          percentCompleteSource.reduce((sum, current) => sum + Number(current || 0), 0) /
            percentCompleteSource.length
        )
      : 0;

  const openRisks = (risks ?? []).filter((risk) => {
    const status = String(risk.status ?? "open").toLowerCase();
    return !["closed", "mitigated", "accepted"].includes(status);
  }).length;
  const upcomingMilestones = (milestones ?? []).filter((milestone) => {
    if (!milestone.due_date) return false;
    const dueDate = new Date(String(milestone.due_date));
    return dueDate >= now && dueDate <= inThirtyDays;
  }).length;
  const budgetRow = budget ?? null;
  const approvedBudget = Number(budgetRow?.approved_budget ?? 0);
  const forecastedSpend = Number(budgetRow?.forecasted_spend ?? 0);
  const actualSpend = Number(budgetRow?.actual_spend ?? 0);
  const budgetVariance = Number(
    budgetRow?.variance ?? Number((actualSpend - forecastedSpend).toFixed(2))
  );
  const budgetStatus =
    approvedBudget === 0 && forecastedSpend === 0 && actualSpend === 0
      ? "No budget entered"
      : budgetVariance > 0
        ? "Over forecast"
        : budgetVariance < 0
          ? "Under forecast"
          : "On forecast";

  const lifecycleWarnings: string[] = [];
  if (!project?.owner_user_id || !project?.project_manager_user_id) {
    lifecycleWarnings.push("Missing project ownership. Set both an owner and a project manager.");
  }
  if (ownershipWarnings > 0) {
    lifecycleWarnings.push(
      `${ownershipWarnings} task(s) are missing a task owner. Every task should have clear ownership.`
    );
  }
  if (blockedWithoutDependencies.length > 0) {
    lifecycleWarnings.push(
      `${blockedWithoutDependencies.length} blocked task(s) do not list a prerequisite dependency.`
    );
  }

  const guardrails = {
    intakeComplete: isIntakeComplete(project),
    scopeComplete: isScopeComplete(scope),
    reviewComplete: isReviewComplete(review),
    missingOwnershipCount: ownershipWarnings,
    blockedWithoutDependencyCount: blockedWithoutDependencies.length
  };

  return {
    project,
    tasks: tasks ?? [],
    groupedTasks,
    staff: staff ?? [],
    stakeholders: stakeholders ?? [],
    scope: scope ?? null,
    scopeChanges: scopeChanges ?? [],
    milestones: milestones ?? [],
    risks: risks ?? [],
    budget: budgetRow,
    resources: resources ?? [],
    decisionLog: decisions ?? [],
    updates: updates ?? [],
    review: review ?? null,
    projectExpenses:
      projectExpensesError && isProjectExpensesSchemaMissingError(projectExpensesError)
        ? []
        : (projectExpenses ?? []),
    taskDependencies: taskDependencies ?? [],
    dashboard: {
      lifecycleStatus: String(project?.lifecycle_status ?? project?.status ?? "idea"),
      percentComplete,
      budgetStatus,
      openRisks,
      upcomingMilestones,
      overdueTasks: groupedTasks.overdue.length,
      blockingDependencies: blockingDependencies.length
    },
    guardrails,
    warnings: lifecycleWarnings
  };
}

export async function createProject(input: {
  name: string;
  description?: string;
  status?: string;
  lifecycleStatus?: string;
  projectStartDate?: string;
  expectedEndDate?: string;
  projectManagerUserId?: string;
  ownerUserId?: string;
  problemStatement?: string;
  businessJustification?: string;
  expectedOutcomes?: string;
  successCriteria?: string;
  roughCostEstimate?: number;
  roughTimeEstimateWeeks?: number;
  strategicAlignment?: string;
  requestorName?: string;
  executiveSponsorName?: string;
  scoreImpact?: number;
  scoreEffort?: number;
  scoreRisk?: number;
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

  const lifecycleStatus = input.lifecycleStatus ?? input.status ?? "idea";
  const legacyStatus = LIFECYCLE_TO_STATUS[lifecycleStatus] ?? "active";

  const { data, error } = await supabase
    .from("projects")
    .insert({
      tenant_id: context.organizationId,
      organization_id: context.organizationId,
      name: input.name,
      description: input.description ?? null,
      status: legacyStatus,
      lifecycle_status: lifecycleStatus,
      project_start_date: input.projectStartDate ?? null,
      expected_end_date: input.expectedEndDate ?? null,
      owner_user_id: input.ownerUserId ?? context.userId,
      project_manager_user_id: input.projectManagerUserId ?? context.userId,
      problem_statement: input.problemStatement ?? null,
      business_justification: input.businessJustification ?? null,
      expected_outcomes: input.expectedOutcomes ?? null,
      success_criteria: input.successCriteria ?? null,
      rough_cost_estimate:
        typeof input.roughCostEstimate === "number" ? input.roughCostEstimate : null,
      rough_time_estimate_weeks:
        typeof input.roughTimeEstimateWeeks === "number" ? input.roughTimeEstimateWeeks : null,
      strategic_alignment: input.strategicAlignment ?? null,
      requestor_name: input.requestorName ?? null,
      executive_sponsor_name: input.executiveSponsorName ?? null,
      score_impact: typeof input.scoreImpact === "number" ? input.scoreImpact : null,
      score_effort: typeof input.scoreEffort === "number" ? input.scoreEffort : null,
      score_risk: typeof input.scoreRisk === "number" ? input.scoreRisk : null,
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
        tenant_id: context.organizationId,
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
        tenant_id: context.organizationId,
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
      tenant_id: context.organizationId,
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
    tenant_id: context.organizationId,
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
