import { NextResponse } from "next/server";
import { z } from "zod";
import { getProject } from "@/lib/data/projects";
import { requireStaffPermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/data/audit";

type RouteProps = {
  params: Promise<{ id: string }>;
};

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z
    .enum([
      "idea",
      "under_review",
      "approved",
      "planning",
      "active",
      "on_hold",
      "completed",
      "cancelled",
      "archived"
    ])
    .optional(),
  lifecycleStatus: z
    .enum([
      "idea",
      "under_review",
      "approved",
      "planning",
      "active",
      "on_hold",
      "completed",
      "cancelled",
      "archived"
    ])
    .optional(),
  projectStartDate: z.string().optional(),
  expectedEndDate: z.string().optional(),
  projectManagerUserId: z.string().uuid().optional(),
  ownerUserId: z.string().uuid().optional(),
  bypassGuardrails: z.boolean().optional(),
  bypassNote: z.string().optional(),
  assignedStaff: z
    .array(
      z.object({
        userId: z.string().uuid(),
        roleOnProject: z.string().min(1)
      })
    )
    .optional()
});

const lifecycleStatusSchema = z.enum([
  "idea",
  "under_review",
  "approved",
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
  "archived"
]);

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("transition_status"),
    lifecycleStatus: lifecycleStatusSchema,
    bypassGuardrails: z.boolean().optional(),
    bypassNote: z.string().optional()
  }),
  z.object({
    action: z.literal("update_intake"),
    problemStatement: z.string().optional(),
    businessJustification: z.string().optional(),
    expectedOutcomes: z.string().optional(),
    successCriteria: z.string().optional(),
    roughCostEstimate: z.coerce.number().nonnegative().nullable().optional(),
    roughTimeEstimateWeeks: z.coerce.number().nonnegative().nullable().optional(),
    strategicAlignment: z.string().optional(),
    requestorName: z.string().optional(),
    executiveSponsorName: z.string().optional(),
    scoreImpact: z.coerce.number().int().min(1).max(5).nullable().optional(),
    scoreEffort: z.coerce.number().int().min(1).max(5).nullable().optional(),
    scoreRisk: z.coerce.number().int().min(1).max(5).nullable().optional()
  }),
  z.object({
    action: z.literal("update_scope"),
    inScope: z.string().optional(),
    outOfScope: z.string().min(1),
    assumptions: z.string().optional(),
    constraints: z.string().optional(),
    dependencies: z.string().optional()
  }),
  z.object({
    action: z.literal("add_scope_change"),
    changeSummary: z.string().min(1),
    changeReason: z.string().optional(),
    impactSummary: z.string().optional(),
    requestedBy: z.string().optional(),
    approvedBy: z.string().optional(),
    effectiveDate: z.string().optional()
  }),
  z.object({
    action: z.literal("upsert_milestone"),
    id: z.string().uuid().optional(),
    milestoneName: z.string().min(1),
    description: z.string().optional(),
    dueDate: z.string().optional(),
    ownerUserId: z.string().uuid().optional(),
    status: z.string().optional(),
    percentComplete: z.coerce.number().int().min(0).max(100).optional()
  }),
  z.object({
    action: z.literal("upsert_risk"),
    id: z.string().uuid().optional(),
    riskTitle: z.string().min(1),
    riskDescription: z.string().optional(),
    likelihood: z.coerce.number().int().min(1).max(5).optional(),
    impact: z.coerce.number().int().min(1).max(5).optional(),
    mitigationPlan: z.string().optional(),
    ownerUserId: z.string().uuid().optional(),
    status: z.string().optional(),
    targetResolutionDate: z.string().optional()
  }),
  z.object({
    action: z.literal("update_budget"),
    approvedBudget: z.coerce.number().nonnegative(),
    forecastedSpend: z.coerce.number().nonnegative(),
    actualSpend: z.coerce.number().nonnegative(),
    notes: z.string().optional()
  }),
  z.object({
    action: z.literal("upsert_project_expense"),
    id: z.string().uuid().optional(),
    expenseType: z.enum(["debit", "credit"]),
    amount: z.coerce.number().positive(),
    entryDate: z.string().optional(),
    description: z.string().optional(),
    campaignId: z.string().uuid().nullable().optional()
  }),
  z.object({
    action: z.literal("upsert_resource"),
    id: z.string().uuid().optional(),
    resourceName: z.string().min(1),
    roleName: z.string().optional(),
    allocationPercent: z.coerce.number().min(0).max(100).nullable().optional(),
    plannedHours: z.coerce.number().nonnegative().nullable().optional(),
    actualHours: z.coerce.number().nonnegative().nullable().optional(),
    costRate: z.coerce.number().nonnegative().nullable().optional(),
    notes: z.string().optional()
  }),
  z.object({
    action: z.literal("add_decision"),
    decisionSummary: z.string().min(1),
    decisionDetails: z.string().optional(),
    decidedAt: z.string().optional()
  }),
  z.object({
    action: z.literal("add_update"),
    updateTitle: z.string().min(1),
    updateBody: z.string().min(1),
    healthStatus: z.string().optional()
  }),
  z.object({
    action: z.literal("update_review"),
    finalOutcomeSummary: z.string().optional(),
    metSuccessCriteria: z.boolean().optional(),
    budgetVarianceExplanation: z.string().optional(),
    lessonsLearned: z.string().optional(),
    wouldDoAgain: z.string().optional()
  }),
  z.object({
    action: z.literal("upsert_task"),
    id: z.string().uuid().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    ownerUserId: z.string().uuid(),
    assignedToUserId: z.string().uuid().optional(),
    estimatedHours: z.coerce.number().nonnegative().nullable().optional(),
    actualHours: z.coerce.number().nonnegative().nullable().optional(),
    startDate: z.string().optional(),
    dueDate: z.string().optional(),
    status: z.enum(["todo", "in_progress", "completed", "blocked", "cancelled"]).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    percentComplete: z.coerce.number().int().min(0).max(100).optional(),
    milestoneId: z.string().uuid().nullable().optional(),
    relatedMilestoneId: z.string().uuid().nullable().optional(),
    blockingNote: z.string().optional()
  }),
  z.object({
    action: z.literal("add_task_dependency"),
    taskId: z.string().uuid(),
    prerequisiteTaskId: z.string().uuid(),
    dependencyType: z.string().optional(),
    note: z.string().optional()
  })
]);

const lifecycleToLegacyStatus: Record<
  z.infer<typeof lifecycleStatusSchema>,
  "active" | "on_hold" | "completed" | "cancelled"
> = {
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

function isBlank(value: string | null | undefined) {
  return !value || !value.trim();
}

async function evaluateGuardrails(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  projectId: string,
  lifecycleStatus: z.infer<typeof lifecycleStatusSchema>
) {
  const [{ data: project }, { data: scope }, { data: review }] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "problem_statement,business_justification,expected_outcomes,success_criteria,requestor_name,executive_sponsor_name"
      )
      .eq("organization_id", organizationId)
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("project_scopes")
      .select("in_scope,out_of_scope")
      .eq("organization_id", organizationId)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("project_reviews")
      .select(
        "final_outcome_summary,met_success_criteria,budget_variance_explanation,lessons_learned,would_do_again"
      )
      .eq("organization_id", organizationId)
      .eq("project_id", projectId)
      .maybeSingle()
  ]);

  const issues: string[] = [];
  const intakeComplete =
    !isBlank(project?.problem_statement) &&
    !isBlank(project?.business_justification) &&
    !isBlank(project?.expected_outcomes) &&
    !isBlank(project?.success_criteria) &&
    !isBlank(project?.requestor_name) &&
    !isBlank(project?.executive_sponsor_name);
  const scopeComplete = !isBlank(scope?.in_scope) && !isBlank(scope?.out_of_scope);
  const reviewComplete =
    !isBlank(review?.final_outcome_summary) &&
    typeof review?.met_success_criteria === "boolean" &&
    !isBlank(review?.budget_variance_explanation) &&
    !isBlank(review?.lessons_learned) &&
    !isBlank(review?.would_do_again);

  if (["planning", "active", "on_hold", "completed", "archived"].includes(lifecycleStatus) && !intakeComplete) {
    issues.push("Idea/Intake is incomplete. Define the problem, outcomes, success criteria, requestor, and sponsor.");
  }
  if (["active", "on_hold", "completed", "archived"].includes(lifecycleStatus) && !scopeComplete) {
    issues.push("Project scope is incomplete. In Scope and Out of Scope are both required.");
  }
  if (["completed", "archived"].includes(lifecycleStatus) && !reviewComplete) {
    issues.push("Project closure review is incomplete. Fill final outcome, success check, budget variance, and lessons learned.");
  }

  return issues;
}

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const result = await getProject(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load project" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const context = await requireStaffPermission("can_create_projects");
    const supabase = await createClient();

    if (payload?.action) {
      const parsedAction = actionSchema.safeParse(payload);
      if (!parsedAction.success) {
        return NextResponse.json(
          { message: "Validation error", issues: parsedAction.error.flatten() },
          { status: 400 }
        );
      }

      const action = parsedAction.data;
      if (action.action === "transition_status") {
        const issues = await evaluateGuardrails(
          supabase,
          context.organizationId,
          id,
          action.lifecycleStatus
        );
        if (issues.length > 0 && !action.bypassGuardrails) {
          return NextResponse.json(
            {
              message:
                "You are moving this project forward without required planning details. Review guardrail warnings or explicitly bypass.",
              guardrailIssues: issues
            },
            { status: 400 }
          );
        }

        const { error } = await supabase
          .from("projects")
          .update({
            lifecycle_status: action.lifecycleStatus,
            status: lifecycleToLegacyStatus[action.lifecycleStatus],
            guardrail_bypass_acknowledged: Boolean(action.bypassGuardrails),
            guardrail_bypass_note: action.bypassNote ?? null
          })
          .eq("organization_id", context.organizationId)
          .eq("id", id);
        if (error) throw error;

        await logAuditEvent({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          actionType: "project_lifecycle_transition",
          targetEntityType: "projects",
          targetEntityId: id,
          metadata: {
            lifecycleStatus: action.lifecycleStatus,
            guardrailBypassed: Boolean(action.bypassGuardrails),
            issues
          }
        });

        return NextResponse.json({ ok: true, guardrailIssues: issues });
      }

      if (action.action === "update_intake") {
        const { error } = await supabase
          .from("projects")
          .update({
            problem_statement: action.problemStatement ?? null,
            business_justification: action.businessJustification ?? null,
            expected_outcomes: action.expectedOutcomes ?? null,
            success_criteria: action.successCriteria ?? null,
            rough_cost_estimate:
              typeof action.roughCostEstimate === "number" ? action.roughCostEstimate : null,
            rough_time_estimate_weeks:
              typeof action.roughTimeEstimateWeeks === "number" ? action.roughTimeEstimateWeeks : null,
            strategic_alignment: action.strategicAlignment ?? null,
            requestor_name: action.requestorName ?? null,
            executive_sponsor_name: action.executiveSponsorName ?? null,
            score_impact: typeof action.scoreImpact === "number" ? action.scoreImpact : null,
            score_effort: typeof action.scoreEffort === "number" ? action.scoreEffort : null,
            score_risk: typeof action.scoreRisk === "number" ? action.scoreRisk : null
          })
          .eq("organization_id", context.organizationId)
          .eq("id", id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action.action === "update_scope") {
        const { error } = await supabase.from("project_scopes").upsert(
          {
            tenant_id: context.organizationId,
            organization_id: context.organizationId,
            project_id: id,
            in_scope: action.inScope ?? null,
            out_of_scope: action.outOfScope,
            assumptions: action.assumptions ?? null,
            constraints: action.constraints ?? null,
            dependencies: action.dependencies ?? null,
            created_by: context.userId,
            updated_by: context.userId
          },
          { onConflict: "project_id" }
        );
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action.action === "add_scope_change") {
        const { error } = await supabase.from("project_scope_change_log").insert({
          tenant_id: context.organizationId,
          organization_id: context.organizationId,
          project_id: id,
          change_summary: action.changeSummary,
          change_reason: action.changeReason ?? null,
          impact_summary: action.impactSummary ?? null,
          requested_by: action.requestedBy ?? null,
          approved_by: action.approvedBy ?? null,
          effective_date: action.effectiveDate ?? null,
          created_by: context.userId
        });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action.action === "upsert_milestone") {
        const payloadMilestone = {
          id: action.id,
          tenant_id: context.organizationId,
          organization_id: context.organizationId,
          project_id: id,
          milestone_name: action.milestoneName,
          description: action.description ?? null,
          due_date: action.dueDate ?? null,
          owner_user_id: action.ownerUserId ?? null,
          status: action.status ?? "pending",
          percent_complete: action.percentComplete ?? 0,
          created_by: context.userId,
          updated_by: context.userId
        };
        const query = action.id
          ? supabase
              .from("project_milestones")
              .update(payloadMilestone)
              .eq("organization_id", context.organizationId)
              .eq("project_id", id)
              .eq("id", action.id)
          : supabase.from("project_milestones").insert(payloadMilestone);
        const { error } = await query;
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action.action === "upsert_risk") {
        const payloadRisk = {
          id: action.id,
          tenant_id: context.organizationId,
          organization_id: context.organizationId,
          project_id: id,
          risk_title: action.riskTitle,
          risk_description: action.riskDescription ?? null,
          likelihood: action.likelihood ?? null,
          impact: action.impact ?? null,
          mitigation_plan: action.mitigationPlan ?? null,
          owner_user_id: action.ownerUserId ?? null,
          status: action.status ?? "open",
          target_resolution_date: action.targetResolutionDate ?? null,
          created_by: context.userId,
          updated_by: context.userId
        };
        const query = action.id
          ? supabase
              .from("project_risks")
              .update(payloadRisk)
              .eq("organization_id", context.organizationId)
              .eq("project_id", id)
              .eq("id", action.id)
          : supabase.from("project_risks").insert(payloadRisk);
        const { error } = await query;
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action.action === "update_budget") {
        const variance = Number((action.actualSpend - action.forecastedSpend).toFixed(2));
        const { error } = await supabase.from("project_budget").upsert(
          {
            tenant_id: context.organizationId,
            organization_id: context.organizationId,
            project_id: id,
            approved_budget: action.approvedBudget,
            forecasted_spend: action.forecastedSpend,
            actual_spend: action.actualSpend,
            variance,
            notes: action.notes ?? null,
            created_by: context.userId,
            updated_by: context.userId
          },
          { onConflict: "project_id" }
        );
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action.action === "upsert_project_expense") {
        if (action.expenseType === "credit" && !action.campaignId) {
          return NextResponse.json(
            { message: "Credits must be tied to a campaign." },
            { status: 400 }
          );
        }
        if (action.expenseType === "debit" && action.campaignId) {
          return NextResponse.json(
            { message: "Debits cannot be tied to a campaign." },
            { status: 400 }
          );
        }

        const entryDate = action.entryDate || new Date().toISOString().slice(0, 10);
        const expensePayload = {
          tenant_id: context.organizationId,
          organization_id: context.organizationId,
          project_id: id,
          expense_type: action.expenseType,
          amount: action.amount,
          entry_date: entryDate,
          description: action.description ?? null,
          campaign_id: action.expenseType === "credit" ? action.campaignId ?? null : null,
          updated_by: context.userId
        };

        const query = action.id
          ? supabase
              .from("project_expenses")
              .update(expensePayload)
              .eq("organization_id", context.organizationId)
              .eq("project_id", id)
              .eq("id", action.id)
          : supabase.from("project_expenses").insert({
              ...expensePayload,
              created_by: context.userId
            });

        const { error } = await query;
        if (error) {
          const errorCode = String((error as { code?: unknown }).code ?? "").toLowerCase();
          const errorMessage = String((error as { message?: unknown }).message ?? "").toLowerCase();
          if (errorCode === "42p01" || (errorCode === "pgrst205" && errorMessage.includes("project_expenses"))) {
            return NextResponse.json(
              {
                message:
                  "Project expenses schema is not available in this environment yet. Run Supabase migration 202603201330 and retry."
              },
              { status: 400 }
            );
          }
          throw error;
        }

        await logAuditEvent({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          actionType: "project_expense_saved",
          targetEntityType: "project_expenses",
          targetEntityId: action.id ?? id,
          metadata: {
            projectId: id,
            expenseType: action.expenseType,
            amount: action.amount,
            campaignId: action.campaignId ?? null
          }
        });

        return NextResponse.json({ ok: true });
      }

      if (action.action === "upsert_resource") {
        const payloadResource = {
          id: action.id,
          tenant_id: context.organizationId,
          organization_id: context.organizationId,
          project_id: id,
          resource_name: action.resourceName,
          role_name: action.roleName ?? null,
          allocation_percent:
            typeof action.allocationPercent === "number" ? action.allocationPercent : null,
          planned_hours: typeof action.plannedHours === "number" ? action.plannedHours : null,
          actual_hours: typeof action.actualHours === "number" ? action.actualHours : null,
          cost_rate: typeof action.costRate === "number" ? action.costRate : null,
          notes: action.notes ?? null,
          created_by: context.userId,
          updated_by: context.userId
        };
        const query = action.id
          ? supabase
              .from("project_resources")
              .update(payloadResource)
              .eq("organization_id", context.organizationId)
              .eq("project_id", id)
              .eq("id", action.id)
          : supabase.from("project_resources").insert(payloadResource);
        const { error } = await query;
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action.action === "add_decision") {
        const { error } = await supabase.from("project_decision_log").insert({
          tenant_id: context.organizationId,
          organization_id: context.organizationId,
          project_id: id,
          decision_summary: action.decisionSummary,
          decision_details: action.decisionDetails ?? null,
          decided_at: action.decidedAt ?? new Date().toISOString(),
          decided_by_user_id: context.userId,
          created_by: context.userId
        });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action.action === "add_update") {
        const { error } = await supabase.from("project_updates").insert({
          tenant_id: context.organizationId,
          organization_id: context.organizationId,
          project_id: id,
          update_title: action.updateTitle,
          update_body: action.updateBody,
          health_status: action.healthStatus ?? "on_track",
          created_by: context.userId
        });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action.action === "update_review") {
        const { error } = await supabase.from("project_reviews").upsert(
          {
            tenant_id: context.organizationId,
            organization_id: context.organizationId,
            project_id: id,
            final_outcome_summary: action.finalOutcomeSummary ?? null,
            met_success_criteria:
              typeof action.metSuccessCriteria === "boolean" ? action.metSuccessCriteria : null,
            budget_variance_explanation: action.budgetVarianceExplanation ?? null,
            lessons_learned: action.lessonsLearned ?? null,
            would_do_again: action.wouldDoAgain ?? null,
            review_completed_at: new Date().toISOString(),
            created_by: context.userId,
            updated_by: context.userId
          },
          { onConflict: "project_id" }
        );
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action.action === "upsert_task") {
        const milestoneId = action.relatedMilestoneId ?? action.milestoneId ?? null;
        const taskPayload = {
          id: action.id,
          tenant_id: context.organizationId,
          organization_id: context.organizationId,
          project_id: id,
          title: action.title,
          description: action.description ?? null,
          owner_user_id: action.ownerUserId,
          assigned_to: action.assignedToUserId ?? action.ownerUserId,
          estimated_hours: typeof action.estimatedHours === "number" ? action.estimatedHours : null,
          actual_hours: typeof action.actualHours === "number" ? action.actualHours : null,
          start_date: action.startDate ?? null,
          due_date: action.dueDate ?? null,
          status: action.status ?? "todo",
          priority: action.priority ?? "medium",
          percent_complete: action.percentComplete ?? 0,
          milestone_id: milestoneId,
          blocking_note: action.blockingNote ?? null,
          completed_at:
            action.status === "completed"
              ? new Date().toISOString()
              : null,
          created_by: context.userId
        };
        const query = action.id
          ? supabase
              .from("tasks")
              .update(taskPayload)
              .eq("organization_id", context.organizationId)
              .eq("project_id", id)
              .eq("id", action.id)
          : supabase.from("tasks").insert(taskPayload);
        const { error } = await query;
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action.action === "add_task_dependency") {
        const { data: taskRows, error: tasksError } = await supabase
          .from("tasks")
          .select("id, project_id")
          .eq("organization_id", context.organizationId)
          .in("id", [action.taskId, action.prerequisiteTaskId]);
        if (tasksError) throw tasksError;
        if ((taskRows ?? []).length !== 2 || (taskRows ?? []).some((row) => row.project_id !== id)) {
          return NextResponse.json(
            { message: "Both dependency tasks must belong to this project." },
            { status: 400 }
          );
        }

        const { error } = await supabase.from("task_dependencies").upsert(
          {
            tenant_id: context.organizationId,
            organization_id: context.organizationId,
            task_id: action.taskId,
            prerequisite_task_id: action.prerequisiteTaskId,
            dependency_type: action.dependencyType ?? "blocks",
            note: action.note ?? null,
            created_by: context.userId
          },
          { onConflict: "task_id,prerequisite_task_id" }
        );
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
    }

    const parsed = updateProjectSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description ?? null;
    if (parsed.data.status !== undefined) {
      updates.lifecycle_status = parsed.data.status;
      updates.status =
        lifecycleToLegacyStatus[
          parsed.data.status as z.infer<typeof lifecycleStatusSchema>
        ];
    }
    if (parsed.data.lifecycleStatus !== undefined) {
      updates.lifecycle_status = parsed.data.lifecycleStatus;
      updates.status =
        lifecycleToLegacyStatus[
          parsed.data.lifecycleStatus as z.infer<typeof lifecycleStatusSchema>
        ];
    }
    if (parsed.data.projectStartDate !== undefined) updates.project_start_date = parsed.data.projectStartDate || null;
    if (parsed.data.expectedEndDate !== undefined) updates.expected_end_date = parsed.data.expectedEndDate || null;
    if (parsed.data.projectManagerUserId !== undefined) updates.project_manager_user_id = parsed.data.projectManagerUserId;
    if (parsed.data.ownerUserId !== undefined) updates.owner_user_id = parsed.data.ownerUserId;

    const targetLifecycle =
      (updates.lifecycle_status as z.infer<typeof lifecycleStatusSchema> | undefined) ?? undefined;
    if (targetLifecycle) {
      const issues = await evaluateGuardrails(supabase, context.organizationId, id, targetLifecycle);
      if (issues.length > 0 && !parsed.data.bypassGuardrails) {
        return NextResponse.json(
          {
            message:
              "You are choosing to proceed without completing recommended planning steps. This increases risk to time, budget, and team wellbeing.",
            guardrailIssues: issues
          },
          { status: 400 }
        );
      }
      updates.guardrail_bypass_acknowledged = Boolean(parsed.data.bypassGuardrails);
      updates.guardrail_bypass_note = parsed.data.bypassNote ?? null;
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("projects")
        .update(updates)
        .eq("organization_id", context.organizationId)
        .eq("id", id);
      if (error) throw error;
    }

    if (parsed.data.assignedStaff !== undefined) {
      const normalizedStaffMap = new Map<string, { userId: string; roleOnProject: string }>();
      for (const member of parsed.data.assignedStaff) {
        normalizedStaffMap.set(member.userId, member);
      }
      const normalizedStaff = Array.from(normalizedStaffMap.values());

      const { error: clearError } = await supabase
        .from("project_staff")
        .delete()
        .eq("organization_id", context.organizationId)
        .eq("project_id", id);
      if (clearError) throw clearError;

      if (normalizedStaff.length > 0) {
        const { error: insertError } = await supabase.from("project_staff").insert(
          normalizedStaff.map((member) => ({
            tenant_id: context.organizationId,
            organization_id: context.organizationId,
            project_id: id,
            user_id: member.userId,
            role_on_project: member.roleOnProject,
            created_by: context.userId
          }))
        );
        if (insertError) throw insertError;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update project" },
      { status: 500 }
    );
  }
}
