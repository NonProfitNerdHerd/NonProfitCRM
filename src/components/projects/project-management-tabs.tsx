"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type UserOption = { user_id: string; display_name: string | null };

type StakeholderForm = {
  stakeholderName: string;
  stakeholderRoleTitle: string;
  organization: string;
  stakeholderType: "Internal" | "External";
  influenceLevel: string;
  interestLevel: string;
  supportLevel: string;
  engagementStrategy: string;
  communicationNeeds: string;
  ownerUserId: string;
  contactInfo: string;
};

type LifecyclePhase =
  | "idea"
  | "evaluation"
  | "planning"
  | "execution"
  | "monitoring";

type CloseoutNoteType = "improve" | "sustain";
type ClosureSubTab = "improves" | "sustains" | "analysis";

type LifecycleStatus =
  | "idea"
  | "under_review"
  | "approved"
  | "planning"
  | "active"
  | "on_hold"
  | "completed"
  | "cancelled"
  | "archived";

type ProjectWorkspaceTab =
  | "dashboard"
  | "project_approval"
  | "planning"
  | "closure"
  | "post_project_review"
  | "tasks"
  | "stakeholder_matrix"
  | "risk_register"
  | "decision_log"
  | "project_updates"
  | "expenses";

const PHASE_DETAILS: Array<{
  key: LifecyclePhase;
  label: string;
  why: string;
  skip: string;
  good: string;
}> = [
  {
    key: "idea",
    label: "1. Idea / Intake",
    why: "This stage makes sure everyone understands the real problem before work begins.",
    skip: "If skipped, teams chase activity instead of mission impact and projects drift.",
    good: "A clear problem statement, measurable success criteria, and rough cost/time expectations."
  },
  {
    key: "planning",
    label: "2. Planning",
    why: "Planning sets boundaries so the team knows what is in scope and what is not.",
    skip: "If skipped, scope creep grows quietly and burnout follows.",
    good: "Documented in-scope, out-of-scope, milestones, assumptions, and dependencies."
  },
  {
    key: "evaluation",
    label: "3. Evaluation",
    why: "Evaluation helps leaders prioritize limited nonprofit time, money, and people.",
    skip: "If skipped, lower-impact work can crowd out urgent mission priorities.",
    good: "Impact, effort, and risk scoring used to make transparent decisions."
  },
  {
    key: "execution",
    label: "4. Execution",
    why: "Execution converts plans into owned tasks with fair workload expectations.",
    skip: "If skipped, accountability blurs and delivery slows down.",
    good: "Every task has an owner, effort estimate, due date, and dependency clarity."
  },
  {
    key: "monitoring",
    label: "5. Budget",
    why: "Monitoring keeps leadership informed without micromanaging staff.",
    skip: "If skipped, risks and budget issues appear late when fixes are expensive.",
    good: "Open risks, budget variance, and progress updates are current and visible."
  }
];

const STATUS_OPTIONS: Array<{ value: LifecycleStatus; label: string }> = [
  { value: "idea", label: "Idea" },
  { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Approved" },
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "archived", label: "Archived" }
];

const TRANSITION_EXPLANATIONS: Record<LifecycleStatus, string> = {
  idea: "Idea status captures the problem first so you do not spend money solving the wrong thing.",
  under_review:
    "Under Review lets leadership compare this effort against other mission priorities before committing staff time.",
  approved:
    "Approved means this is worth doing, but still needs planning discipline to protect people and budget.",
  planning:
    "Planning prevents avoidable chaos by defining scope, assumptions, ownership, and key dates before execution.",
  active:
    "You are moving this project into Active status. At this stage, unclear scope or missing ownership typically leads to burnout and budget overruns.",
  on_hold:
    "On Hold is appropriate when constraints change. Documenting this pause protects trust and planning transparency.",
  completed:
    "Completed should only happen when outcomes and closure review are documented to protect institutional learning.",
  cancelled:
    "Cancelled is a stewardship decision when mission value no longer justifies spend.",
  archived:
    "Archived keeps records available for learning while signaling that operational work has ended."
};

function effectiveStatus(task: Record<string, unknown>) {
  const status = String(task.status ?? "todo");
  const completedAt = task.completed_at as string | null | undefined;
  const dueDate = task.due_date as string | null | undefined;
  if (completedAt || status === "completed") return "Completed";
  if (status === "cancelled") return "Canceled";
  if (dueDate && new Date(dueDate) < new Date()) return "Overdue";
  if (status === "in_progress") return "In Progress";
  if (status === "blocked") return "Blocked";
  return "Open";
}

export function ProjectManagementTabs({
  project,
  tasks,
  groupedTasks,
  staff,
  stakeholders,
  users,
  scope,
  scopeChanges,
  milestones,
  risks,
  budget,
  resources,
  decisionLog,
  updates,
  review,
  closeoutNotes,
  projectExpenses,
  taskDependencies,
  dashboard,
  guardrails,
  warnings,
  initialWorkspaceTab
}: {
  project: Record<string, unknown>;
  tasks: Array<Record<string, unknown>>;
  groupedTasks: Record<string, Array<Record<string, unknown>>>;
  staff: Array<Record<string, unknown>>;
  stakeholders: Array<Record<string, unknown>>;
  users: UserOption[];
  scope?: Record<string, unknown> | null;
  scopeChanges?: Array<Record<string, unknown>>;
  milestones?: Array<Record<string, unknown>>;
  risks?: Array<Record<string, unknown>>;
  budget?: Record<string, unknown> | null;
  resources?: Array<Record<string, unknown>>;
  decisionLog?: Array<Record<string, unknown>>;
  updates?: Array<Record<string, unknown>>;
  review?: Record<string, unknown> | null;
  closeoutNotes?: Array<Record<string, unknown>>;
  projectExpenses?: Array<Record<string, unknown>>;
  taskDependencies?: Array<Record<string, unknown>>;
  dashboard?: {
    lifecycleStatus?: string;
    percentComplete?: number;
    budgetStatus?: string;
    openRisks?: number;
    upcomingMilestones?: number;
    overdueTasks?: number;
    blockingDependencies?: number;
  };
  guardrails?: {
    intakeComplete?: boolean;
    scopeComplete?: boolean;
    reviewComplete?: boolean;
    missingOwnershipCount?: number;
    blockedWithoutDependencyCount?: number;
  };
  warnings?: string[];
  initialWorkspaceTab?: string;
}) {
  const router = useRouter();
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<ProjectWorkspaceTab>(() => {
    const candidate = String(initialWorkspaceTab ?? "").toLowerCase();
    const allowed: ProjectWorkspaceTab[] = [
      "dashboard",
      "project_approval",
      "planning",
      "closure",
      "post_project_review",
      "tasks",
      "stakeholder_matrix",
      "risk_register",
      "decision_log",
      "project_updates",
      "expenses"
    ];
    return allowed.includes(candidate as ProjectWorkspaceTab)
      ? (candidate as ProjectWorkspaceTab)
      : "dashboard";
  });
  const [activeTab, setActiveTab] = useState<LifecyclePhase>("idea");
  const [projectState, setProjectState] = useState(project);
  const [staffRows, setStaffRows] = useState(staff);
  const [statusSelection, setStatusSelection] = useState<LifecycleStatus>(
    String(
      project.lifecycle_status ?? project.status ?? "idea"
    ) as LifecycleStatus
  );
  const [bypassGuardrails, setBypassGuardrails] = useState(false);
  const [bypassNote, setBypassNote] = useState("");
  const [statusGuardrailIssues, setStatusGuardrailIssues] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "open" | "in_progress" | "completed" | "overdue" | "canceled"
  >("all");
  const [showEditProject, setShowEditProject] = useState(false);
  const [projectForm, setProjectForm] = useState({
    name: String(project.name ?? ""),
    description: String(project.description ?? ""),
    status: String(project.status ?? "active"),
    projectStartDate: String(project.project_start_date ?? ""),
    expectedEndDate: String(project.expected_end_date ?? ""),
    ownerUserId: String(project.owner_user_id ?? ""),
    projectManagerUserId: String(project.project_manager_user_id ?? "")
  });
  const [projectStaffForm, setProjectStaffForm] = useState<
    Array<{ userId: string; roleOnProject: string }>
  >(
    staff.map((member) => ({
      userId: String(member.user_id ?? ""),
      roleOnProject: String(member.role_on_project ?? "Team Member")
    }))
  );
  const [projectSaveError, setProjectSaveError] = useState<string | null>(null);
  const [sharedError, setSharedError] = useState<string | null>(null);

  const [rows, setRows] = useState(stakeholders);
  const [showNewStakeholder, setShowNewStakeholder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<StakeholderForm>({
    stakeholderName: "",
    stakeholderRoleTitle: "",
    organization: "",
    stakeholderType: "External",
    influenceLevel: "",
    interestLevel: "",
    supportLevel: "",
    engagementStrategy: "",
    communicationNeeds: "",
    ownerUserId: "",
    contactInfo: ""
  });

  const [intakeForm, setIntakeForm] = useState({
    problemStatement: String(project.problem_statement ?? ""),
    businessJustification: String(project.business_justification ?? ""),
    expectedOutcomes: String(project.expected_outcomes ?? ""),
    successCriteria: String(project.success_criteria ?? ""),
    roughCostEstimate: String(project.rough_cost_estimate ?? ""),
    roughTimeEstimateWeeks: String(project.rough_time_estimate_weeks ?? ""),
    strategicAlignment: String(project.strategic_alignment ?? ""),
    requestorName: String(project.requestor_name ?? ""),
    executiveSponsorName: String(project.executive_sponsor_name ?? ""),
    scoreImpact: String(project.score_impact ?? ""),
    scoreEffort: String(project.score_effort ?? ""),
    scoreRisk: String(project.score_risk ?? "")
  });

  const [scopeForm, setScopeForm] = useState({
    inScope: String(scope?.in_scope ?? ""),
    outOfScope: String(scope?.out_of_scope ?? ""),
    assumptions: String(scope?.assumptions ?? ""),
    constraints: String(scope?.constraints ?? ""),
    dependencies: String(scope?.dependencies ?? "")
  });
  const [scopeChangeForm, setScopeChangeForm] = useState({
    changeSummary: "",
    changeReason: "",
    impactSummary: "",
    requestedBy: "",
    approvedBy: "",
    effectiveDate: ""
  });

  const [milestoneForm, setMilestoneForm] = useState({
    milestoneName: "",
    dueDate: "",
    ownerUserId: "",
    percentComplete: "0",
    description: ""
  });
  const [resourceForm, setResourceForm] = useState({
    resourceName: "",
    roleName: "",
    allocationPercent: "",
    plannedHours: "",
    actualHours: "",
    costRate: "",
    notes: ""
  });
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    ownerUserId: "",
    dueDate: "",
    estimatedHours: "",
    actualHours: "",
    startDate: "",
    status: "todo",
    priority: "medium",
    percentComplete: "0",
    milestoneId: "",
    blockingNote: ""
  });
  const [dependencyForm, setDependencyForm] = useState({
    taskId: "",
    prerequisiteTaskId: "",
    dependencyType: "blocks",
    note: ""
  });

  const [riskForm, setRiskForm] = useState({
    riskTitle: "",
    riskDescription: "",
    likelihood: "3",
    impact: "3",
    mitigationPlan: "",
    ownerUserId: "",
    status: "open",
    targetResolutionDate: ""
  });
  const [budgetForm, setBudgetForm] = useState({
    approvedBudget: String(budget?.approved_budget ?? 0),
    forecastedSpend: String(budget?.forecasted_spend ?? 0),
    actualSpend: String(budget?.actual_spend ?? 0),
    notes: String(budget?.notes ?? "")
  });
  const [decisionForm, setDecisionForm] = useState({
    decisionSummary: "",
    decisionDetails: "",
    decidedAt: ""
  });
  const [expenseForm, setExpenseForm] = useState({
    amount: "",
    entryDate: new Date().toISOString().slice(0, 10),
    description: ""
  });
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showTasksQuickAdd, setShowTasksQuickAdd] = useState(false);
  const [showRiskModal, setShowRiskModal] = useState(false);
  const [editingRiskId, setEditingRiskId] = useState<string | null>(null);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [editingDecisionId, setEditingDecisionId] = useState<string | null>(null);
  const [updateForm, setUpdateForm] = useState({
    updateTitle: "",
    updateBody: "",
    healthStatus: "on_track",
    publishedAt: ""
  });
  const [showProjectUpdateModal, setShowProjectUpdateModal] = useState(false);
  const [editingProjectUpdateId, setEditingProjectUpdateId] = useState<string | null>(null);
  const [activeClosureTab, setActiveClosureTab] = useState<ClosureSubTab>("improves");
  const [showCloseoutNoteModal, setShowCloseoutNoteModal] = useState(false);
  const [closeoutNoteType, setCloseoutNoteType] = useState<CloseoutNoteType>("improve");
  const [closeoutNoteBody, setCloseoutNoteBody] = useState("");
  const [reviewForm, setReviewForm] = useState({
    finalOutcomeSummary: String(review?.final_outcome_summary ?? ""),
    metSuccessCriteria:
      typeof review?.met_success_criteria === "boolean" ? review?.met_success_criteria : false,
    budgetVarianceExplanation: String(review?.budget_variance_explanation ?? ""),
    lessonsLearned: String(review?.lessons_learned ?? ""),
    wouldDoAgain: String(review?.would_do_again ?? "")
  });

  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of users) {
      map.set(user.user_id, user.display_name || user.user_id);
    }
    return map;
  }, [users]);

  const averageScore = useMemo(() => {
    const values = [intakeForm.scoreImpact, intakeForm.scoreEffort, intakeForm.scoreRisk]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (!values.length) return null;
    return (values.reduce((sum, current) => sum + current, 0) / values.length).toFixed(1);
  }, [intakeForm.scoreImpact, intakeForm.scoreEffort, intakeForm.scoreRisk]);

  const filteredTasks = useMemo(() => {
    if (statusFilter === "all") return tasks;
    return tasks.filter((task) => {
      const effective = effectiveStatus(task);
      if (statusFilter === "open") return effective === "Open";
      if (statusFilter === "in_progress") return effective === "In Progress";
      if (statusFilter === "completed") return effective === "Completed";
      if (statusFilter === "overdue") return effective === "Overdue";
      if (statusFilter === "canceled") return effective === "Canceled";
      return true;
    });
  }, [tasks, statusFilter]);

  const expenseTotals = useMemo(() => {
    const totals = (projectExpenses ?? []).reduce<{ debits: number }>(
      (acc, row) => {
        const amount = Number(row.amount ?? 0);
        const type = String(row.expense_type ?? "");
        if (type === "debit") acc.debits += amount;
        return acc;
      },
      { debits: 0 }
    );
    const approvedBudget = Number(budget?.approved_budget ?? 0);
    const remainingBudget = approvedBudget - totals.debits;
    return {
      debits: totals.debits,
      approvedBudget,
      remainingBudget,
      spentPercent: approvedBudget > 0 ? (totals.debits / approvedBudget) * 100 : 0
    };
  }, [projectExpenses, budget?.approved_budget]);

  const improveRows = useMemo(
    () =>
      (closeoutNotes ?? []).filter(
        (row) => String(row.note_type ?? "").toLowerCase() === "improve"
      ),
    [closeoutNotes]
  );
  const sustainRows = useMemo(
    () =>
      (closeoutNotes ?? []).filter(
        (row) => String(row.note_type ?? "").toLowerCase() === "sustain"
      ),
    [closeoutNotes]
  );

  async function saveLifecycleAction(payload: Record<string, unknown>) {
    setSaving(true);
    setSharedError(null);
    const response = await fetch(`/api/projects/${String(projectState.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      if (Array.isArray(body?.guardrailIssues)) {
        setStatusGuardrailIssues(body.guardrailIssues as string[]);
      }
      setSharedError(body?.message ?? "Unable to save project lifecycle changes.");
      return false;
    }
    return true;
  }

  async function saveAndRefresh(payload: Record<string, unknown>) {
    const ok = await saveLifecycleAction(payload);
    if (!ok) return;
    router.refresh();
  }

  async function saveExpenseEntry() {
    const ok = await saveLifecycleAction({
      action: "upsert_project_expense",
      expenseType: "debit",
      amount: numberOrZero(expenseForm.amount),
      entryDate: expenseForm.entryDate || null,
      description: expenseForm.description
    });
    if (!ok) return;
    setExpenseForm({
      amount: "",
      description: "",
      entryDate: new Date().toISOString().slice(0, 10)
    });
    setShowExpenseModal(false);
    router.refresh();
  }

  async function saveRiskEntry() {
    const ok = await saveLifecycleAction({
      action: "upsert_risk",
      id: editingRiskId ?? undefined,
      ...riskForm,
      likelihood: numberOrNull(riskForm.likelihood),
      impact: numberOrNull(riskForm.impact)
    });
    if (!ok) return;
    setEditingRiskId(null);
    setShowRiskModal(false);
    setRiskForm({
      riskTitle: "",
      riskDescription: "",
      likelihood: "3",
      impact: "3",
      mitigationPlan: "",
      ownerUserId: "",
      status: "open",
      targetResolutionDate: ""
    });
    router.refresh();
  }

  async function saveDecisionEntry() {
    const ok = await saveLifecycleAction({
      action: "upsert_decision",
      id: editingDecisionId ?? undefined,
      ...decisionForm,
      decidedAt: decisionForm.decidedAt || null
    });
    if (!ok) return;
    setEditingDecisionId(null);
    setShowDecisionModal(false);
    setDecisionForm({ decisionSummary: "", decisionDetails: "", decidedAt: "" });
    router.refresh();
  }

  function openNewDecision() {
    setEditingDecisionId(null);
    setDecisionForm({ decisionSummary: "", decisionDetails: "", decidedAt: "" });
    setShowDecisionModal(true);
  }

  function openEditDecision(decision: Record<string, unknown>) {
    setEditingDecisionId(String(decision.id ?? ""));
    setDecisionForm({
      decisionSummary: String(decision.decision_summary ?? ""),
      decisionDetails: String(decision.decision_details ?? ""),
      decidedAt: String(decision.decided_at ?? "").slice(0, 10)
    });
    setShowDecisionModal(true);
  }

  async function saveProjectUpdateEntry() {
    const ok = await saveLifecycleAction({
      action: "upsert_update",
      id: editingProjectUpdateId ?? undefined,
      updateTitle: updateForm.updateTitle,
      updateBody: updateForm.updateBody,
      healthStatus: updateForm.healthStatus,
      publishedAt: updateForm.publishedAt || null
    });
    if (!ok) return;
    setEditingProjectUpdateId(null);
    setShowProjectUpdateModal(false);
    setUpdateForm({ updateTitle: "", updateBody: "", healthStatus: "on_track", publishedAt: "" });
    router.refresh();
  }

  function openNewProjectUpdate() {
    setEditingProjectUpdateId(null);
    setUpdateForm({ updateTitle: "", updateBody: "", healthStatus: "on_track", publishedAt: "" });
    setShowProjectUpdateModal(true);
  }

  function openEditProjectUpdate(update: Record<string, unknown>) {
    setEditingProjectUpdateId(String(update.id ?? ""));
    setUpdateForm({
      updateTitle: String(update.update_title ?? ""),
      updateBody: String(update.update_body ?? ""),
      healthStatus: String(update.health_status ?? "on_track"),
      publishedAt: String(update.published_at ?? "").slice(0, 10)
    });
    setShowProjectUpdateModal(true);
  }

  function openNewCloseoutNote(type: CloseoutNoteType) {
    setCloseoutNoteType(type);
    setCloseoutNoteBody("");
    setShowCloseoutNoteModal(true);
  }

  async function saveCloseoutNote() {
    if (!closeoutNoteBody.trim()) return;
    const ok = await saveLifecycleAction({
      action: "upsert_closeout_note",
      noteType: closeoutNoteType,
      noteBody: closeoutNoteBody
    });
    if (!ok) return;
    setCloseoutNoteBody("");
    setShowCloseoutNoteModal(false);
    router.refresh();
  }

  function openNewRisk() {
    setEditingRiskId(null);
    setRiskForm({
      riskTitle: "",
      riskDescription: "",
      likelihood: "3",
      impact: "3",
      mitigationPlan: "",
      ownerUserId: "",
      status: "open",
      targetResolutionDate: ""
    });
    setShowRiskModal(true);
  }

  function openEditRisk(risk: Record<string, unknown>) {
    setEditingRiskId(String(risk.id ?? ""));
    setRiskForm({
      riskTitle: String(risk.risk_title ?? ""),
      riskDescription: String(risk.risk_description ?? ""),
      likelihood: String(risk.likelihood ?? "3"),
      impact: String(risk.impact ?? "3"),
      mitigationPlan: String(risk.mitigation_plan ?? ""),
      ownerUserId: String(risk.owner_user_id ?? ""),
      status: String(risk.status ?? "open"),
      targetResolutionDate: String(risk.target_resolution_date ?? "")
    });
    setShowRiskModal(true);
  }

  async function saveTaskFromTasksTab() {
    if (!taskForm.title.trim() || !taskForm.ownerUserId) return;
    const ok = await saveLifecycleAction({
      action: "upsert_task",
      ...taskForm,
      ownerUserId: taskForm.ownerUserId,
      estimatedHours: numberOrNull(taskForm.estimatedHours),
      actualHours: numberOrNull(taskForm.actualHours),
      percentComplete: numberOrNull(taskForm.percentComplete),
      milestoneId: taskForm.milestoneId || null
    });
    if (!ok) return;
    setTaskForm({
      title: "",
      description: "",
      ownerUserId: "",
      dueDate: "",
      estimatedHours: "",
      actualHours: "",
      startDate: "",
      status: "todo",
      priority: "medium",
      percentComplete: "0",
      milestoneId: "",
      blockingNote: ""
    });
    setShowTasksQuickAdd(false);
    router.refresh();
  }

  function resetProjectForm() {
    setProjectForm({
      name: String(projectState.name ?? ""),
      description: String(projectState.description ?? ""),
      status: String(projectState.status ?? "active"),
      projectStartDate: String(projectState.project_start_date ?? ""),
      expectedEndDate: String(projectState.expected_end_date ?? ""),
      ownerUserId: String(projectState.owner_user_id ?? ""),
      projectManagerUserId: String(projectState.project_manager_user_id ?? "")
    });
    setProjectStaffForm(
      staffRows.map((member) => ({
        userId: String(member.user_id ?? ""),
        roleOnProject: String(member.role_on_project ?? "Team Member")
      }))
    );
    setProjectSaveError(null);
  }

  function addProjectStaffRow() {
    setProjectStaffForm((prev) => [...prev, { userId: "", roleOnProject: "Team Member" }]);
  }

  async function saveProjectEdits(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setProjectSaveError(null);

    const assignedStaff = projectStaffForm
      .filter((row) => row.userId)
      .map((row) => ({ userId: row.userId, roleOnProject: row.roleOnProject || "Team Member" }));

    const response = await fetch(`/api/projects/${String(projectState.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...projectForm,
        assignedStaff
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setProjectSaveError(payload?.message ?? "Unable to save project changes.");
      setSaving(false);
      return;
    }

    setProjectState((prev) => ({
      ...prev,
      name: projectForm.name,
      description: projectForm.description || null,
      status: projectForm.status,
      project_start_date: projectForm.projectStartDate || null,
      expected_end_date: projectForm.expectedEndDate || null,
      owner_user_id: projectForm.ownerUserId || null,
      project_manager_user_id: projectForm.projectManagerUserId || null
    }));
    setStaffRows(
      assignedStaff.map((entry) => ({
        id: `${entry.userId}-${entry.roleOnProject}`,
        user_id: entry.userId,
        role_on_project: entry.roleOnProject
      }))
    );
    setSaving(false);
    setShowEditProject(false);
    router.refresh();
  }

  async function createStakeholder(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch(`/api/projects/${project.id as string}/stakeholders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form)
    });
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      setRows((prev) => [...prev, { ...form, id: payload?.id }]);
      setShowNewStakeholder(false);
      setForm({
        stakeholderName: "",
        stakeholderRoleTitle: "",
        organization: "",
        stakeholderType: "External",
        influenceLevel: "",
        interestLevel: "",
        supportLevel: "",
        engagementStrategy: "",
        communicationNeeds: "",
        ownerUserId: "",
        contactInfo: ""
      });
    }
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <TabButton
          active={activeWorkspaceTab === "dashboard"}
          onClick={() => setActiveWorkspaceTab("dashboard")}
        >
          Dashboard
        </TabButton>
        <TabButton
          active={activeWorkspaceTab === "project_approval"}
          onClick={() => setActiveWorkspaceTab("project_approval")}
        >
          Project Approval
        </TabButton>
        <TabButton active={activeWorkspaceTab === "planning"} onClick={() => setActiveWorkspaceTab("planning")}>
          Planning
        </TabButton>
        <TabButton active={activeWorkspaceTab === "closure"} onClick={() => setActiveWorkspaceTab("closure")}>
          Closure
        </TabButton>
        <TabButton
          active={activeWorkspaceTab === "post_project_review"}
          onClick={() => setActiveWorkspaceTab("post_project_review")}
        >
          Post Project Review
        </TabButton>
        <TabButton active={activeWorkspaceTab === "tasks"} onClick={() => setActiveWorkspaceTab("tasks")}>
          Tasks
        </TabButton>
        <TabButton
          active={activeWorkspaceTab === "stakeholder_matrix"}
          onClick={() => setActiveWorkspaceTab("stakeholder_matrix")}
        >
          Stakeholder Matrix
        </TabButton>
        <TabButton
          active={activeWorkspaceTab === "risk_register"}
          onClick={() => setActiveWorkspaceTab("risk_register")}
        >
          Risk Register
        </TabButton>
        <TabButton
          active={activeWorkspaceTab === "decision_log"}
          onClick={() => setActiveWorkspaceTab("decision_log")}
        >
          Decision Log
        </TabButton>
        <TabButton
          active={activeWorkspaceTab === "project_updates"}
          onClick={() => setActiveWorkspaceTab("project_updates")}
        >
          Project Updates
        </TabButton>
        <TabButton
          active={activeWorkspaceTab === "expenses"}
          onClick={() => setActiveWorkspaceTab("expenses")}
        >
          Project Expenses
        </TabButton>
      </div>

      {activeWorkspaceTab === "dashboard" ? (
        <>
          <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-sm font-semibold text-slate-900">
              Why this lifecycle framework exists
            </h4>
            <p className="mt-1 text-sm text-slate-700">
              This workflow helps your team protect mission time, budget, and people by making sure
              key thinking happens before execution.
            </p>
            <p className="mt-2 text-xs text-slate-600">
              Skipping planning often leads to scope creep, surprise spending, and staff burnout.
            </p>
          </section>

          <div className="grid gap-3 md:grid-cols-4">
            <SummaryBox
              label="Lifecycle Status"
              value={String(dashboard?.lifecycleStatus ?? project.lifecycle_status ?? "idea")}
              tone="slate"
              compact
            />
            <SummaryBox
              label="% Complete"
              value={`${dashboard?.percentComplete ?? 0}%`}
              tone="green"
              compact
            />
            <SummaryBox
              label="Budget Status"
              value={String(dashboard?.budgetStatus ?? "No budget entered")}
              tone="amber"
              compact
            />
            <SummaryBox label="Open Risks" value={String(dashboard?.openRisks ?? 0)} tone="red" compact />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <SummaryBox
              label="Upcoming Milestones"
              value={String(dashboard?.upcomingMilestones ?? 0)}
              tone="amber"
              compact
            />
            <SummaryBox
              label="Overdue Tasks"
              value={String(dashboard?.overdueTasks ?? 0)}
              tone="red"
              compact
            />
            <SummaryBox
              label="Blocking Dependencies"
              value={String(dashboard?.blockingDependencies ?? 0)}
              tone="red"
              compact
            />
          </div>
          <p className="text-xs text-slate-600">
            This dashboard helps leadership see reality without asking staff for daily update emails.
          </p>
        </>
      ) : null}

      {activeWorkspaceTab === "project_approval" ? (
        <>
          <section className="rounded-md border border-slate-200 p-4">
            <h4 className="text-sm font-semibold text-slate-900">Lifecycle Status Engine</h4>
            <p className="mt-1 text-xs text-slate-600">
              Move status intentionally. Guardrails help prevent unclear scope, missed ownership, and
              budget surprises.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={statusSelection}
                onChange={(event) => setStatusSelection(event.target.value as LifecycleStatus)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                disabled={saving}
                onClick={() =>
                  saveAndRefresh({
                    action: "transition_status",
                    lifecycleStatus: statusSelection,
                    bypassGuardrails,
                    bypassNote
                  })
                }
              >
                {saving ? "Saving..." : "Apply Status Transition"}
              </Button>
            </div>
            <Button
              className="mt-2"
              type="button"
              variant="secondary"
              onClick={() => {
                resetProjectForm();
                setShowEditProject(true);
              }}
            >
              Edit Project Basics
            </Button>
            <p className="mt-2 text-xs text-amber-700">{TRANSITION_EXPLANATIONS[statusSelection]}</p>
            <label className="mt-3 flex items-start gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={bypassGuardrails}
                onChange={(event) => setBypassGuardrails(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                I understand I am proceeding without recommended planning steps and this increases the
                risk of delay, cost overruns, and staff burnout.
              </span>
            </label>
            {bypassGuardrails ? (
              <Input
                value={bypassNote}
                onChange={(event) => setBypassNote(event.target.value)}
                placeholder="Optional bypass note (why this exception is needed)"
              />
            ) : null}
            {statusGuardrailIssues.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-700">
                {statusGuardrailIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </section>

          {(warnings ?? []).length > 0 ? (
            <section className="rounded-md border border-red-200 bg-red-50 p-4">
              <h5 className="text-sm font-semibold text-red-900">Smart warnings</h5>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-800">
                {(warnings ?? []).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-md border border-slate-200 bg-white p-4 text-xs text-slate-700">
            <p>
              <strong>Guardrail readiness:</strong>{" "}
              Intake {guardrails?.intakeComplete ? "complete" : "incomplete"} • Scope{" "}
              {guardrails?.scopeComplete ? "complete" : "incomplete"} • Closure review{" "}
              {guardrails?.reviewComplete ? "complete" : "incomplete"}
            </p>
          </section>
        </>
      ) : null}

      {activeWorkspaceTab === "planning" ? (
        <>
          <div className="flex flex-wrap gap-2">
            {PHASE_DETAILS.map((phase) => (
              <TabButton
                key={phase.key}
                active={activeTab === phase.key}
                onClick={() => setActiveTab(phase.key)}
              >
                {phase.label}
              </TabButton>
            ))}
          </div>

          <GuidancePanel phase={PHASE_DETAILS.find((phase) => phase.key === activeTab)!} />

          {activeTab === "idea" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Idea / Intake</h4>
          <p className="mt-1 text-xs text-slate-600">
            Clear intake protects leadership credibility by defining success before spending.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <LabeledTextarea
                label="Problem Statement"
                value={intakeForm.problemStatement}
                onChange={(value) => setIntakeForm((prev) => ({ ...prev, problemStatement: value }))}
              />
            </div>
            <div className="md:col-span-2">
              <LabeledTextarea
                label="Business Justification"
                value={intakeForm.businessJustification}
                onChange={(value) =>
                  setIntakeForm((prev) => ({ ...prev, businessJustification: value }))
                }
              />
            </div>
            <div className="md:col-span-2">
              <LabeledTextarea
                label="Expected Outcomes"
                value={intakeForm.expectedOutcomes}
                onChange={(value) => setIntakeForm((prev) => ({ ...prev, expectedOutcomes: value }))}
              />
            </div>
            <div className="md:col-span-2">
              <LabeledTextarea
                label="Success Criteria (Measurable)"
                value={intakeForm.successCriteria}
                onChange={(value) => setIntakeForm((prev) => ({ ...prev, successCriteria: value }))}
              />
            </div>
            <Input
              value={intakeForm.roughCostEstimate}
              onChange={(event) =>
                setIntakeForm((prev) => ({ ...prev, roughCostEstimate: event.target.value }))
              }
              placeholder="Rough Cost Estimate"
            />
            <Input
              value={intakeForm.roughTimeEstimateWeeks}
              onChange={(event) =>
                setIntakeForm((prev) => ({ ...prev, roughTimeEstimateWeeks: event.target.value }))
              }
              placeholder="Rough Time Estimate (weeks)"
            />
            <Input
              value={intakeForm.requestorName}
              onChange={(event) =>
                setIntakeForm((prev) => ({ ...prev, requestorName: event.target.value }))
              }
              placeholder="Requestor"
            />
            <Input
              value={intakeForm.executiveSponsorName}
              onChange={(event) =>
                setIntakeForm((prev) => ({ ...prev, executiveSponsorName: event.target.value }))
              }
              placeholder="Executive Sponsor"
            />
            <div className="md:col-span-2">
              <LabeledTextarea
                label="Strategic Alignment"
                value={intakeForm.strategicAlignment}
                onChange={(value) =>
                  setIntakeForm((prev) => ({ ...prev, strategicAlignment: value }))
                }
              />
            </div>
          </div>
          <Button
            className="mt-3"
            type="button"
            disabled={saving}
            onClick={() =>
              saveAndRefresh({
                action: "update_intake",
                ...intakeForm,
                roughCostEstimate: numberOrNull(intakeForm.roughCostEstimate),
                roughTimeEstimateWeeks: numberOrNull(intakeForm.roughTimeEstimateWeeks),
                scoreImpact: numberOrNull(intakeForm.scoreImpact),
                scoreEffort: numberOrNull(intakeForm.scoreEffort),
                scoreRisk: numberOrNull(intakeForm.scoreRisk)
              })
            }
          >
            Save Intake
          </Button>
        </section>
          ) : null}

      {activeTab === "evaluation" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Evaluation Scoring</h4>
          <p className="mt-1 text-xs text-slate-600">
            Scoring helps nonprofits prioritize high-impact work when capacity is limited.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Input
              value={intakeForm.scoreImpact}
              onChange={(event) =>
                setIntakeForm((prev) => ({ ...prev, scoreImpact: event.target.value }))
              }
              placeholder="Impact (1-5)"
            />
            <Input
              value={intakeForm.scoreEffort}
              onChange={(event) =>
                setIntakeForm((prev) => ({ ...prev, scoreEffort: event.target.value }))
              }
              placeholder="Effort (1-5)"
            />
            <Input
              value={intakeForm.scoreRisk}
              onChange={(event) =>
                setIntakeForm((prev) => ({ ...prev, scoreRisk: event.target.value }))
              }
              placeholder="Risk (1-5)"
            />
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Average score: <strong>{averageScore ?? "N/A"}</strong>
          </p>
          <Button
            className="mt-3"
            type="button"
            disabled={saving}
            onClick={() =>
              saveAndRefresh({
                action: "update_intake",
                scoreImpact: numberOrNull(intakeForm.scoreImpact),
                scoreEffort: numberOrNull(intakeForm.scoreEffort),
                scoreRisk: numberOrNull(intakeForm.scoreRisk)
              })
            }
          >
            Save Evaluation Scores
          </Button>
        </section>
      ) : null}

      {activeTab === "planning" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Scope, Milestones, and Resources</h4>
          <p className="mt-1 text-xs text-slate-600">
            Out-of-scope is required because it protects your team from unplanned expansion.
          </p>
          <div className="mt-3 grid gap-3">
            <LabeledTextarea
              label="In Scope"
              value={scopeForm.inScope}
              onChange={(value) => setScopeForm((prev) => ({ ...prev, inScope: value }))}
            />
            <LabeledTextarea
              label="Out of Scope (required)"
              value={scopeForm.outOfScope}
              onChange={(value) => setScopeForm((prev) => ({ ...prev, outOfScope: value }))}
            />
            <LabeledTextarea
              label="Assumptions"
              value={scopeForm.assumptions}
              onChange={(value) => setScopeForm((prev) => ({ ...prev, assumptions: value }))}
            />
            <LabeledTextarea
              label="Constraints"
              value={scopeForm.constraints}
              onChange={(value) => setScopeForm((prev) => ({ ...prev, constraints: value }))}
            />
            <LabeledTextarea
              label="Dependencies"
              value={scopeForm.dependencies}
              onChange={(value) => setScopeForm((prev) => ({ ...prev, dependencies: value }))}
            />
          </div>
          <Button
            className="mt-3"
            type="button"
            disabled={saving}
            onClick={() => saveAndRefresh({ action: "update_scope", ...scopeForm })}
          >
            Save Scope
          </Button>

          <div className="mt-4 space-y-4">
            <section className="rounded-md border border-slate-200 p-3">
              <h5 className="text-sm font-semibold text-slate-900">Milestones</h5>
              <p className="mt-1 text-xs text-slate-600">
                Milestones give leadership visibility without micromanaging tasks.
              </p>
              <div className="mt-2 space-y-2">
                {(milestones ?? []).map((milestone) => (
                  <div key={String(milestone.id)} className="rounded-md border border-slate-100 p-2 text-xs">
                    <p className="font-semibold text-slate-900">{String(milestone.milestone_name ?? "-")}</p>
                    <p className="text-slate-600">
                      Due {formatDate(String(milestone.due_date ?? ""))} •{" "}
                      {String(milestone.percent_complete ?? 0)}%
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-2 grid gap-2">
                <Input
                  value={milestoneForm.milestoneName}
                  onChange={(event) =>
                    setMilestoneForm((prev) => ({ ...prev, milestoneName: event.target.value }))
                  }
                  placeholder="Milestone name"
                />
                <Input
                  type="date"
                  value={milestoneForm.dueDate}
                  onChange={(event) =>
                    setMilestoneForm((prev) => ({ ...prev, dueDate: event.target.value }))
                  }
                />
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={milestoneForm.ownerUserId}
                  onChange={(event) =>
                    setMilestoneForm((prev) => ({ ...prev, ownerUserId: event.target.value }))
                  }
                >
                  <option value="">Owner</option>
                  {users.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.display_name ?? user.user_id}
                    </option>
                  ))}
                </select>
                <Input
                  value={milestoneForm.percentComplete}
                  onChange={(event) =>
                    setMilestoneForm((prev) => ({ ...prev, percentComplete: event.target.value }))
                  }
                  placeholder="Percent complete"
                />
                <LabeledTextarea
                  label="Description"
                  value={milestoneForm.description}
                  onChange={(value) =>
                    setMilestoneForm((prev) => ({ ...prev, description: value }))
                  }
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    saveAndRefresh({
                      action: "upsert_milestone",
                      ...milestoneForm,
                      percentComplete: numberOrNull(milestoneForm.percentComplete)
                    })
                  }
                >
                  Add Milestone
                </Button>
              </div>
            </section>

            <section className="rounded-md border border-slate-200 p-3">
              <h5 className="text-sm font-semibold text-slate-900">Resources</h5>
              <p className="mt-1 text-xs text-slate-600">
                Resource visibility supports fair workloads and prevents hidden capacity gaps.
              </p>
              <div className="mt-2 space-y-2">
                {(resources ?? []).map((resource) => (
                  <div key={String(resource.id)} className="rounded-md border border-slate-100 p-2 text-xs">
                    <p className="font-semibold text-slate-900">{String(resource.resource_name ?? "-")}</p>
                    <p className="text-slate-600">
                      {String(resource.role_name ?? "Role not set")} •{" "}
                      {String(resource.allocation_percent ?? "0")}% allocation
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-2 grid gap-2">
                <Input
                  value={resourceForm.resourceName}
                  onChange={(event) =>
                    setResourceForm((prev) => ({ ...prev, resourceName: event.target.value }))
                  }
                  placeholder="Resource name"
                />
                <Input
                  value={resourceForm.roleName}
                  onChange={(event) =>
                    setResourceForm((prev) => ({ ...prev, roleName: event.target.value }))
                  }
                  placeholder="Role"
                />
                <Input
                  value={resourceForm.allocationPercent}
                  onChange={(event) =>
                    setResourceForm((prev) => ({ ...prev, allocationPercent: event.target.value }))
                  }
                  placeholder="Allocation %"
                />
                <Input
                  value={resourceForm.plannedHours}
                  onChange={(event) =>
                    setResourceForm((prev) => ({ ...prev, plannedHours: event.target.value }))
                  }
                  placeholder="Planned hours"
                />
                <Input
                  value={resourceForm.actualHours}
                  onChange={(event) =>
                    setResourceForm((prev) => ({ ...prev, actualHours: event.target.value }))
                  }
                  placeholder="Actual hours"
                />
                <Input
                  value={resourceForm.costRate}
                  onChange={(event) =>
                    setResourceForm((prev) => ({ ...prev, costRate: event.target.value }))
                  }
                  placeholder="Cost rate"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    saveAndRefresh({
                      action: "upsert_resource",
                      ...resourceForm,
                      allocationPercent: numberOrNull(resourceForm.allocationPercent),
                      plannedHours: numberOrNull(resourceForm.plannedHours),
                      actualHours: numberOrNull(resourceForm.actualHours),
                      costRate: numberOrNull(resourceForm.costRate)
                    })
                  }
                >
                  Add Resource
                </Button>
              </div>
            </section>

            <section className="rounded-md border border-slate-200 p-3">
              <h5 className="text-sm font-semibold text-slate-900">Scope Change Log</h5>
              <p className="mt-1 text-xs text-slate-600">
                When scope changes are undocumented, projects grow quietly and budgets disappear.
              </p>
              <div className="mt-2 space-y-2">
                {(scopeChanges ?? []).map((change) => (
                  <div key={String(change.id)} className="rounded-md border border-slate-100 p-2 text-xs">
                    <p className="font-semibold text-slate-900">{String(change.change_summary ?? "-")}</p>
                    <p className="text-slate-600">{formatDate(String(change.created_at ?? ""))}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 grid gap-2">
                <Input
                  value={scopeChangeForm.changeSummary}
                  onChange={(event) =>
                    setScopeChangeForm((prev) => ({ ...prev, changeSummary: event.target.value }))
                  }
                  placeholder="Change summary"
                />
                <LabeledTextarea
                  label="Reason"
                  value={scopeChangeForm.changeReason}
                  onChange={(value) =>
                    setScopeChangeForm((prev) => ({ ...prev, changeReason: value }))
                  }
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => saveAndRefresh({ action: "add_scope_change", ...scopeChangeForm })}
                >
                  Add Scope Change
                </Button>
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === "execution" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-900">Tasks and Dependencies</h4>
          <p className="mb-3 text-xs text-slate-600">
            Every task needs an owner. Dependencies prevent schedule collisions and confusion.
          </p>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <SummaryBox label="Overdue" value={(groupedTasks.overdue ?? []).length} tone="red" />
            <SummaryBox label="Upcoming" value={(groupedTasks.upcoming ?? []).length} tone="amber" />
            <SummaryBox label="Completed" value={(groupedTasks.completed ?? []).length} tone="green" />
            <SummaryBox label="Canceled" value={(groupedTasks.cancelled ?? []).length} tone="slate" />
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <h5 className="text-sm font-semibold text-slate-900">Task List</h5>
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as
                    | "all"
                    | "open"
                    | "in_progress"
                    | "completed"
                    | "overdue"
                    | "canceled"
                )
              }
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="overdue">Overdue</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>

          {filteredTasks.length === 0 ? (
            <p className="text-sm text-slate-500">No tasks for selected filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Task Title</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Assigned User</th>
                    <th className="py-2">Due Date</th>
                    <th className="py-2">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((task) => (
                    <tr key={String(task.id)} className="border-b border-slate-100">
                      <td className="py-2">
                        <Link href={`/staff/tasks/${String(task.id)}`} className="font-medium text-brand-700">
                          {String(task.title ?? "-")}
                        </Link>
                      </td>
                      <td className="py-2">{effectiveStatus(task)}</td>
                      <td className="py-2">
                        {userNameById.get(String(task.assigned_to ?? "")) ?? String(task.assigned_to ?? "-")}
                      </td>
                      <td className="py-2">{formatDate(task.due_date as string)}</td>
                      <td className="py-2">{String(task.priority ?? "-")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-md border border-slate-200 p-3">
              <h5 className="text-sm font-semibold text-slate-900">Add Task</h5>
              <div className="mt-2 grid gap-2">
                <Input
                  value={taskForm.title}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="Task title"
                />
                <LabeledTextarea
                  label="Task description"
                  value={taskForm.description}
                  onChange={(value) => setTaskForm((prev) => ({ ...prev, description: value }))}
                />
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={taskForm.ownerUserId}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, ownerUserId: event.target.value }))
                  }
                >
                  <option value="">Task owner (required)</option>
                  {users.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.display_name ?? user.user_id}
                    </option>
                  ))}
                </select>
                <Input
                  type="date"
                  value={taskForm.startDate}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, startDate: event.target.value }))
                  }
                />
                <Input
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, dueDate: event.target.value }))
                  }
                />
                <Input
                  value={taskForm.estimatedHours}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, estimatedHours: event.target.value }))
                  }
                  placeholder="Estimated hours"
                />
                <Input
                  value={taskForm.actualHours}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, actualHours: event.target.value }))
                  }
                  placeholder="Actual hours"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!taskForm.ownerUserId}
                  onClick={() =>
                    saveAndRefresh({
                      action: "upsert_task",
                      ...taskForm,
                      ownerUserId: taskForm.ownerUserId,
                      estimatedHours: numberOrNull(taskForm.estimatedHours),
                      actualHours: numberOrNull(taskForm.actualHours),
                      percentComplete: numberOrNull(taskForm.percentComplete),
                      milestoneId: taskForm.milestoneId || null
                    })
                  }
                >
                  Add Task
                </Button>
              </div>
            </section>

            <section className="rounded-md border border-slate-200 p-3">
              <h5 className="text-sm font-semibold text-slate-900">Blocking Dependencies</h5>
              <div className="mt-2 space-y-2">
                {(taskDependencies ?? []).map((dependency) => (
                  <div key={String(dependency.id)} className="rounded-md border border-slate-100 p-2 text-xs">
                    <p>
                      Task {String(dependency.task_id)} depends on {String(dependency.prerequisite_task_id)}
                    </p>
                    <p className="text-slate-600">{String(dependency.note ?? "No note")}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 grid gap-2">
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={dependencyForm.taskId}
                  onChange={(event) =>
                    setDependencyForm((prev) => ({ ...prev, taskId: event.target.value }))
                  }
                >
                  <option value="">Task being blocked</option>
                  {tasks.map((task) => (
                    <option key={String(task.id)} value={String(task.id)}>
                      {String(task.title ?? task.id)}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={dependencyForm.prerequisiteTaskId}
                  onChange={(event) =>
                    setDependencyForm((prev) => ({
                      ...prev,
                      prerequisiteTaskId: event.target.value
                    }))
                  }
                >
                  <option value="">Prerequisite task</option>
                  {tasks.map((task) => (
                    <option key={String(task.id)} value={String(task.id)}>
                      {String(task.title ?? task.id)}
                    </option>
                  ))}
                </select>
                <Input
                  value={dependencyForm.note}
                  onChange={(event) =>
                    setDependencyForm((prev) => ({ ...prev, note: event.target.value }))
                  }
                  placeholder="Dependency note"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!dependencyForm.taskId || !dependencyForm.prerequisiteTaskId}
                  onClick={() => saveAndRefresh({ action: "add_task_dependency", ...dependencyForm })}
                >
                  Add Dependency
                </Button>
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === "monitoring" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Budget</h4>
          <p className="mt-1 text-xs text-slate-600">
            Monitoring variance protects donor trust and team alignment.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-md border border-slate-200 p-3">
              <h5 className="text-sm font-semibold text-slate-900">Budget</h5>
              <p className="mt-1 text-xs text-slate-600">
                Variance tracking helps you explain spend clearly to boards and funders.
              </p>
              <div className="mt-2 grid gap-2">
                <label className="text-xs font-medium text-slate-700">
                  Approved Budget
                  <Input
                    className="mt-1"
                    value={budgetForm.approvedBudget}
                    onChange={(event) =>
                      setBudgetForm((prev) => ({ ...prev, approvedBudget: event.target.value }))
                    }
                    placeholder="Approved budget"
                  />
                </label>
                <label className="text-xs font-medium text-slate-700">
                  Forecasted Spend
                  <Input
                    className="mt-1"
                    value={budgetForm.forecastedSpend}
                    onChange={(event) =>
                      setBudgetForm((prev) => ({ ...prev, forecastedSpend: event.target.value }))
                    }
                    placeholder="Forecasted spend"
                  />
                </label>
                <label className="text-xs font-medium text-slate-700">
                  Actual Spend
                  <Input
                    className="mt-1"
                    value={budgetForm.actualSpend}
                    onChange={(event) =>
                      setBudgetForm((prev) => ({ ...prev, actualSpend: event.target.value }))
                    }
                    placeholder="Actual spend"
                  />
                </label>
                <LabeledTextarea
                  label="Budget notes"
                  value={budgetForm.notes}
                  onChange={(value) => setBudgetForm((prev) => ({ ...prev, notes: value }))}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    saveAndRefresh({
                      action: "update_budget",
                      approvedBudget: numberOrZero(budgetForm.approvedBudget),
                      forecastedSpend: numberOrZero(budgetForm.forecastedSpend),
                      actualSpend: numberOrZero(budgetForm.actualSpend),
                      notes: budgetForm.notes
                    })
                  }
                >
                  Save Budget
                </Button>
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {showEditProject ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h5 className="text-base font-semibold text-slate-900">Edit Project</h5>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => setShowEditProject(false)}
              >
                Close
              </button>
            </div>
            <form onSubmit={saveProjectEdits} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  value={projectForm.name}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Project name"
                />
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={projectForm.status}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, status: event.target.value }))
                  }
                >
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <Input
                  value={projectForm.description}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="Description"
                />
                <Input
                  type="date"
                  value={projectForm.projectStartDate}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, projectStartDate: event.target.value }))
                  }
                />
                <Input
                  type="date"
                  value={projectForm.expectedEndDate}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, expectedEndDate: event.target.value }))
                  }
                />
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={projectForm.ownerUserId}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, ownerUserId: event.target.value }))
                  }
                >
                  <option value="">Project Owner</option>
                  {users.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.display_name ?? user.user_id}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={projectForm.projectManagerUserId}
                  onChange={(event) =>
                    setProjectForm((prev) => ({
                      ...prev,
                      projectManagerUserId: event.target.value
                    }))
                  }
                >
                  <option value="">Project Manager</option>
                  {users.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.display_name ?? user.user_id}
                    </option>
                  ))}
                </select>
              </div>

              <section className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Assigned Staff</p>
                  <Button type="button" variant="secondary" onClick={addProjectStaffRow}>
                    Add Staff
                  </Button>
                </div>
                <div className="space-y-2">
                  {projectStaffForm.length === 0 ? (
                    <p className="text-sm text-slate-500">No assigned staff yet.</p>
                  ) : (
                    projectStaffForm.map((entry, idx) => (
                      <div key={`${idx}-${entry.userId}`} className="grid gap-2 md:grid-cols-3">
                        <select
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                          value={entry.userId}
                          onChange={(event) =>
                            setProjectStaffForm((prev) =>
                              prev.map((row, rowIdx) =>
                                rowIdx === idx ? { ...row, userId: event.target.value } : row
                              )
                            )
                          }
                        >
                          <option value="">Select user</option>
                          {users.map((user) => (
                            <option key={user.user_id} value={user.user_id}>
                              {user.display_name ?? user.user_id}
                            </option>
                          ))}
                        </select>
                        <Input
                          value={entry.roleOnProject}
                          onChange={(event) =>
                            setProjectStaffForm((prev) =>
                              prev.map((row, rowIdx) =>
                                rowIdx === idx
                                  ? { ...row, roleOnProject: event.target.value }
                                  : row
                              )
                            )
                          }
                          placeholder="Role on project"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            setProjectStaffForm((prev) =>
                              prev.filter((_, rowIdx) => rowIdx !== idx)
                            )
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {projectSaveError ? <p className="text-sm text-red-700">{projectSaveError}</p> : null}
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Project"}
              </Button>
            </form>
          </div>
        </div>
      ) : null}
        </>
      ) : null}

      {activeWorkspaceTab === "closure" ? (
        <section className="space-y-4 rounded-md border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Closure</h4>
              <p className="mt-1 text-xs text-slate-600">
                Capture what to improve, what to sustain, and your closeout analysis for future
                mission work.
              </p>
            </div>
            {activeClosureTab === "improves" ? (
              <Button type="button" variant="secondary" onClick={() => openNewCloseoutNote("improve")}>
                Add Improve
              </Button>
            ) : null}
            {activeClosureTab === "sustains" ? (
              <Button type="button" variant="secondary" onClick={() => openNewCloseoutNote("sustain")}>
                Add Sustain
              </Button>
            ) : null}
            {activeClosureTab === "analysis" ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => saveAndRefresh({ action: "update_review", ...reviewForm })}
              >
                Save Analysis
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <TabButton active={activeClosureTab === "improves"} onClick={() => setActiveClosureTab("improves")}>
              Improves
            </TabButton>
            <TabButton active={activeClosureTab === "sustains"} onClick={() => setActiveClosureTab("sustains")}>
              Sustains
            </TabButton>
            <TabButton active={activeClosureTab === "analysis"} onClick={() => setActiveClosureTab("analysis")}>
              Analysis
            </TabButton>
          </div>

          {activeClosureTab === "improves" ? (
            <section className="rounded-md border border-slate-200 p-3">
              <h5 className="text-sm font-semibold text-slate-900">Improves</h5>
              <p className="mt-1 text-xs text-slate-600">
                Notes about what we should do better in future project cycles.
              </p>
              {improveRows.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No improve notes yet.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-600">
                        <th className="py-2">Created</th>
                        <th className="py-2">Note</th>
                        <th className="py-2">Added By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {improveRows.map((row) => (
                        <tr key={String(row.id)} className="border-b border-slate-100 align-top">
                          <td className="py-2">{formatDate(String(row.created_at ?? ""))}</td>
                          <td className="py-2 whitespace-pre-wrap">{String(row.note_body ?? "")}</td>
                          <td className="py-2">
                            {userNameById.get(String(row.created_by ?? "")) ??
                              String(row.created_by ?? "-")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {activeClosureTab === "sustains" ? (
            <section className="rounded-md border border-slate-200 p-3">
              <h5 className="text-sm font-semibold text-slate-900">Sustains</h5>
              <p className="mt-1 text-xs text-slate-600">
                Notes about practices that worked and should continue.
              </p>
              {sustainRows.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No sustain notes yet.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-600">
                        <th className="py-2">Created</th>
                        <th className="py-2">Note</th>
                        <th className="py-2">Added By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sustainRows.map((row) => (
                        <tr key={String(row.id)} className="border-b border-slate-100 align-top">
                          <td className="py-2">{formatDate(String(row.created_at ?? ""))}</td>
                          <td className="py-2 whitespace-pre-wrap">{String(row.note_body ?? "")}</td>
                          <td className="py-2">
                            {userNameById.get(String(row.created_by ?? "")) ??
                              String(row.created_by ?? "-")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {activeClosureTab === "analysis" ? (
            <section className="rounded-md border border-slate-200 p-4">
              <p className="text-xs text-slate-600">
                Closure turns experience into wisdom. Without review, mistakes repeat.
              </p>
              <div className="mt-3 grid gap-3">
                <LabeledTextarea
                  label="Final Outcome Summary"
                  value={reviewForm.finalOutcomeSummary}
                  onChange={(value) => setReviewForm((prev) => ({ ...prev, finalOutcomeSummary: value }))}
                />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={reviewForm.metSuccessCriteria}
                    onChange={(event) =>
                      setReviewForm((prev) => ({ ...prev, metSuccessCriteria: event.target.checked }))
                    }
                  />
                  Did we meet success criteria?
                </label>
                <LabeledTextarea
                  label="Budget Variance Explanation"
                  value={reviewForm.budgetVarianceExplanation}
                  onChange={(value) =>
                    setReviewForm((prev) => ({ ...prev, budgetVarianceExplanation: value }))
                  }
                />
                <LabeledTextarea
                  label="Lessons Learned"
                  value={reviewForm.lessonsLearned}
                  onChange={(value) => setReviewForm((prev) => ({ ...prev, lessonsLearned: value }))}
                />
                <LabeledTextarea
                  label="Would we do this again?"
                  value={reviewForm.wouldDoAgain}
                  onChange={(value) => setReviewForm((prev) => ({ ...prev, wouldDoAgain: value }))}
                />
              </div>
            </section>
          ) : null}
        </section>
      ) : null}

      {activeWorkspaceTab === "post_project_review" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-900">Post-Project Review</h4>
            <Button
              type="button"
              variant="secondary"
              onClick={() => saveAndRefresh({ action: "update_review", ...reviewForm })}
            >
              Save Review
            </Button>
          </div>
          <p className="text-xs text-slate-600">
            Document outcomes and lessons so future projects start stronger and avoid repeated mistakes.
          </p>
          <div className="mt-3 grid gap-3">
            <LabeledTextarea
              label="Final Outcome Summary"
              value={reviewForm.finalOutcomeSummary}
              onChange={(value) => setReviewForm((prev) => ({ ...prev, finalOutcomeSummary: value }))}
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={reviewForm.metSuccessCriteria}
                onChange={(event) =>
                  setReviewForm((prev) => ({ ...prev, metSuccessCriteria: event.target.checked }))
                }
              />
              Did we meet success criteria?
            </label>
            <LabeledTextarea
              label="Budget Variance Explanation"
              value={reviewForm.budgetVarianceExplanation}
              onChange={(value) =>
                setReviewForm((prev) => ({ ...prev, budgetVarianceExplanation: value }))
              }
            />
            <LabeledTextarea
              label="Lessons Learned"
              value={reviewForm.lessonsLearned}
              onChange={(value) => setReviewForm((prev) => ({ ...prev, lessonsLearned: value }))}
            />
            <LabeledTextarea
              label="Would we do this again?"
              value={reviewForm.wouldDoAgain}
              onChange={(value) => setReviewForm((prev) => ({ ...prev, wouldDoAgain: value }))}
            />
          </div>
        </section>
      ) : null}

      {activeWorkspaceTab === "stakeholder_matrix" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-900">Stakeholder Matrix</h4>
            <Button type="button" onClick={() => setShowNewStakeholder(true)}>
              New
            </Button>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">No stakeholder records yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Stakeholder Name</th>
                    <th className="py-2">Role / Title</th>
                    <th className="py-2">Organization</th>
                    <th className="py-2">Type</th>
                    <th className="py-2">Influence</th>
                    <th className="py-2">Interest</th>
                    <th className="py-2">Support</th>
                    <th className="py-2">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={String(row.id)} className="border-b border-slate-100">
                      <td className="py-2">{String(row.stakeholder_name ?? row.stakeholderName ?? "-")}</td>
                      <td className="py-2">
                        {String(row.stakeholder_role_title ?? row.stakeholderRoleTitle ?? "-")}
                      </td>
                      <td className="py-2">
                        {String(row.stakeholder_organization ?? row.organization ?? "-")}
                      </td>
                      <td className="py-2">{String(row.stakeholder_type ?? row.stakeholderType ?? "-")}</td>
                      <td className="py-2">{String(row.influence_level ?? row.influenceLevel ?? "-")}</td>
                      <td className="py-2">{String(row.interest_level ?? row.interestLevel ?? "-")}</td>
                      <td className="py-2">{String(row.support_level ?? row.supportLevel ?? "-")}</td>
                      <td className="py-2">
                        {userNameById.get(
                          String(row.owner_user_id ?? row.ownerUserId ?? "")
                        ) ?? String(row.owner_user_id ?? row.ownerUserId ?? "-")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {activeWorkspaceTab === "tasks" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Project Tasks</h4>
              <p className="mt-1 text-xs text-slate-600">
                Click any task to open its full editor. Use filters to focus the list.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as
                      | "all"
                      | "open"
                      | "in_progress"
                      | "completed"
                      | "overdue"
                      | "canceled"
                  )
                }
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="overdue">Overdue</option>
                <option value="canceled">Canceled</option>
              </select>
              <Button type="button" variant="secondary" onClick={() => setShowTasksQuickAdd((prev) => !prev)}>
                {showTasksQuickAdd ? "Close Add Task" : "Add Task"}
              </Button>
            </div>
          </div>

          {showTasksQuickAdd ? (
            <section className="mb-4 rounded-md border border-slate-200 p-3">
              <h5 className="text-sm font-semibold text-slate-900">Create Task</h5>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <Input
                  value={taskForm.title}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="Task title"
                />
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={taskForm.ownerUserId}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, ownerUserId: event.target.value }))
                  }
                >
                  <option value="">Task owner (required)</option>
                  {users.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.display_name ?? user.user_id}
                    </option>
                  ))}
                </select>
                <Input
                  type="date"
                  value={taskForm.startDate}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, startDate: event.target.value }))
                  }
                />
                <Input
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, dueDate: event.target.value }))
                  }
                />
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={taskForm.priority}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, priority: event.target.value }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={taskForm.status}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, status: event.target.value }))
                  }
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <div className="md:col-span-2">
                  <LabeledTextarea
                    label="Task description"
                    value={taskForm.description}
                    onChange={(value) => setTaskForm((prev) => ({ ...prev, description: value }))}
                  />
                </div>
                <div className="md:col-span-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!taskForm.title.trim() || !taskForm.ownerUserId}
                    onClick={saveTaskFromTasksTab}
                  >
                    Create Task
                  </Button>
                </div>
              </div>
            </section>
          ) : null}

          {filteredTasks.length === 0 ? (
            <p className="text-sm text-slate-500">No tasks for selected filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Task Title</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Owner</th>
                    <th className="py-2">Due Date</th>
                    <th className="py-2">Priority</th>
                    <th className="py-2">% Complete</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((task) => (
                    <tr key={String(task.id)} className="border-b border-slate-100">
                      <td className="py-2">
                        <Link href={`/staff/tasks/${String(task.id)}`} className="font-medium text-brand-700">
                          {String(task.title ?? "-")}
                        </Link>
                      </td>
                      <td className="py-2">{effectiveStatus(task)}</td>
                      <td className="py-2">
                        {userNameById.get(String(task.owner_user_id ?? task.assigned_to ?? "")) ??
                          String(task.owner_user_id ?? task.assigned_to ?? "-")}
                      </td>
                      <td className="py-2">{formatDate(task.due_date as string)}</td>
                      <td className="py-2">{String(task.priority ?? "-")}</td>
                      <td className="py-2">{String(task.percent_complete ?? 0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {activeWorkspaceTab === "risk_register" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Risk Register</h4>
              <p className="mt-1 text-xs text-slate-600">
                Track project risks early. Click a row to view or edit details.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={openNewRisk}>
              Add Risk
            </Button>
          </div>
          {(risks ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No risks logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Title</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Likelihood</th>
                    <th className="py-2">Impact</th>
                    <th className="py-2">Owner</th>
                    <th className="py-2">Target Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(risks ?? []).map((risk) => (
                    <tr
                      key={String(risk.id)}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                      onClick={() => openEditRisk(risk)}
                    >
                      <td className="py-2 font-medium text-brand-700">{String(risk.risk_title ?? "-")}</td>
                      <td className="py-2">{String(risk.status ?? "open")}</td>
                      <td className="py-2">{String(risk.likelihood ?? "-")}</td>
                      <td className="py-2">{String(risk.impact ?? "-")}</td>
                      <td className="py-2">
                        {userNameById.get(String(risk.owner_user_id ?? "")) ??
                          String(risk.owner_user_id ?? "-")}
                      </td>
                      <td className="py-2">{formatDate(String(risk.target_resolution_date ?? ""))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {activeWorkspaceTab === "decision_log" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Decision Log</h4>
              <p className="mt-1 text-xs text-slate-600">
                Document key decisions so institutional memory does not disappear.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={openNewDecision}>
              New Decision
            </Button>
          </div>
          {(decisionLog ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No decisions logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Decision Summary</th>
                    <th className="py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(decisionLog ?? []).map((decision) => (
                    <tr
                      key={String(decision.id)}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                      onClick={() => openEditDecision(decision)}
                    >
                      <td className="py-2 font-medium text-brand-700">
                        {String(decision.decision_summary ?? "-")}
                      </td>
                      <td className="py-2">{formatDate(String(decision.decided_at ?? ""))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {activeWorkspaceTab === "project_updates" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Project Updates</h4>
              <p className="mt-1 text-xs text-slate-600">
                Publish concise updates to reduce confusion and keep stakeholders aligned.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={openNewProjectUpdate}>
              Add Project Update
            </Button>
          </div>
          {(updates ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No project updates yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Update Title</th>
                    <th className="py-2">Health</th>
                    <th className="py-2">Published</th>
                  </tr>
                </thead>
                <tbody>
                  {(updates ?? []).map((update) => (
                    <tr
                      key={String(update.id)}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                      onClick={() => openEditProjectUpdate(update)}
                    >
                      <td className="py-2 font-medium text-brand-700">
                        {String(update.update_title ?? "-")}
                      </td>
                      <td className="py-2">{String(update.health_status ?? "on_track")}</td>
                      <td className="py-2">{formatDate(String(update.published_at ?? ""))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {activeWorkspaceTab === "expenses" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Project Expenses</h4>
          <p className="mt-1 text-xs text-slate-600">
            Expenses are tracked as debits against project budget.
          </p>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <SummaryBox
              label="Project Budget"
              value={`$${expenseTotals.approvedBudget.toFixed(2)}`}
              tone="slate"
              compact
            />
            <SummaryBox
              label="Project Expenses"
              value={`$${expenseTotals.debits.toFixed(2)}`}
              tone="red"
              compact
            />
            <SummaryBox
              label="Budget Remaining"
              value={`$${expenseTotals.remainingBudget.toFixed(2)}`}
              tone={expenseTotals.remainingBudget >= 0 ? "green" : "red"}
              compact
            />
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Budget utilization: {expenseTotals.spentPercent.toFixed(1)}%
          </p>

          <section className="mt-4 rounded-md border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h5 className="text-sm font-semibold text-slate-900">Expense Ledger</h5>
              <Button type="button" variant="secondary" onClick={() => setShowExpenseModal(true)}>
                Add Expense
              </Button>
            </div>
            {(projectExpenses ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No expenses recorded yet.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600">
                      <th className="py-2">Date</th>
                      <th className="py-2">Amount</th>
                      <th className="py-2">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(projectExpenses ?? []).map((row) => (
                      <tr key={String(row.id)} className="border-b border-slate-100">
                        <td className="py-2">{formatDate(String(row.entry_date ?? ""))}</td>
                        <td className="py-2">${Number(row.amount ?? 0).toFixed(2)}</td>
                        <td className="py-2">{String(row.description ?? "-")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      ) : null}

      {showExpenseModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h5 className="text-base font-semibold text-slate-900">Add Expense</h5>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => setShowExpenseModal(false)}
              >
                Close
              </button>
            </div>
            <div className="grid gap-2">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={expenseForm.amount}
                onChange={(event) =>
                  setExpenseForm((prev) => ({ ...prev, amount: event.target.value }))
                }
                placeholder="Amount"
              />
              <Input
                type="date"
                value={expenseForm.entryDate}
                onChange={(event) =>
                  setExpenseForm((prev) => ({ ...prev, entryDate: event.target.value }))
                }
              />
              <LabeledTextarea
                label="Description"
                value={expenseForm.description}
                onChange={(value) => setExpenseForm((prev) => ({ ...prev, description: value }))}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={Number(expenseForm.amount) <= 0}
                onClick={saveExpenseEntry}
              >
                Save Expense
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showRiskModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h5 className="text-base font-semibold text-slate-900">
                {editingRiskId ? "Edit Risk" : "New Risk"}
              </h5>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => {
                  setShowRiskModal(false);
                  setEditingRiskId(null);
                }}
              >
                Close
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-slate-700">
                <span>Risk Title</span>
                <Input
                  value={riskForm.riskTitle}
                  onChange={(event) =>
                    setRiskForm((prev) => ({ ...prev, riskTitle: event.target.value }))
                  }
                />
              </label>
              <label className="grid gap-1 text-xs text-slate-700">
                <span>Status</span>
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={riskForm.status}
                  onChange={(event) => setRiskForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="open">Open</option>
                  <option value="monitoring">Monitoring</option>
                  <option value="mitigated">Mitigated</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-slate-700">
                <span>Likelihood (1-5)</span>
                <Input
                  value={riskForm.likelihood}
                  onChange={(event) =>
                    setRiskForm((prev) => ({ ...prev, likelihood: event.target.value }))
                  }
                />
              </label>
              <label className="grid gap-1 text-xs text-slate-700">
                <span>Impact (1-5)</span>
                <Input
                  value={riskForm.impact}
                  onChange={(event) => setRiskForm((prev) => ({ ...prev, impact: event.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-xs text-slate-700">
                <span>Target Resolution Date</span>
                <Input
                  type="date"
                  value={riskForm.targetResolutionDate}
                  onChange={(event) =>
                    setRiskForm((prev) => ({ ...prev, targetResolutionDate: event.target.value }))
                  }
                />
              </label>
              <label className="grid gap-1 text-xs text-slate-700">
                <span>Risk Owner (optional)</span>
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={riskForm.ownerUserId}
                  onChange={(event) =>
                    setRiskForm((prev) => ({ ...prev, ownerUserId: event.target.value }))
                  }
                >
                  <option value="">Select owner</option>
                  {users.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.display_name ?? user.user_id}
                    </option>
                  ))}
                </select>
              </label>
              <div className="md:col-span-2">
                <LabeledTextarea
                  label="Risk description"
                  value={riskForm.riskDescription}
                  onChange={(value) =>
                    setRiskForm((prev) => ({ ...prev, riskDescription: value }))
                  }
                />
              </div>
              <div className="md:col-span-2">
                <LabeledTextarea
                  label="Mitigation plan"
                  value={riskForm.mitigationPlan}
                  onChange={(value) =>
                    setRiskForm((prev) => ({ ...prev, mitigationPlan: value }))
                  }
                />
              </div>
              <div className="md:col-span-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!riskForm.riskTitle.trim()}
                  onClick={saveRiskEntry}
                >
                  {editingRiskId ? "Save Risk" : "Create Risk"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showDecisionModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h5 className="text-base font-semibold text-slate-900">
                {editingDecisionId ? "Edit Decision" : "New Decision"}
              </h5>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => {
                  setShowDecisionModal(false);
                  setEditingDecisionId(null);
                }}
              >
                Close
              </button>
            </div>
            <div className="grid gap-2">
              <label className="grid gap-1 text-xs text-slate-700">
                <span>Decision Summary</span>
                <Input
                  value={decisionForm.decisionSummary}
                  onChange={(event) =>
                    setDecisionForm((prev) => ({ ...prev, decisionSummary: event.target.value }))
                  }
                />
              </label>
              <label className="grid gap-1 text-xs text-slate-700">
                <span>Decision Date</span>
                <Input
                  type="date"
                  value={decisionForm.decidedAt}
                  onChange={(event) =>
                    setDecisionForm((prev) => ({ ...prev, decidedAt: event.target.value }))
                  }
                />
              </label>
              <LabeledTextarea
                label="Decision Details"
                value={decisionForm.decisionDetails}
                onChange={(value) => setDecisionForm((prev) => ({ ...prev, decisionDetails: value }))}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={!decisionForm.decisionSummary.trim()}
                onClick={saveDecisionEntry}
              >
                {editingDecisionId ? "Save Decision" : "Create Decision"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showProjectUpdateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h5 className="text-base font-semibold text-slate-900">
                {editingProjectUpdateId ? "Edit Project Update" : "New Project Update"}
              </h5>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => {
                  setShowProjectUpdateModal(false);
                  setEditingProjectUpdateId(null);
                }}
              >
                Close
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-slate-700">
                <span>Update Title</span>
                <Input
                  value={updateForm.updateTitle}
                  onChange={(event) =>
                    setUpdateForm((prev) => ({ ...prev, updateTitle: event.target.value }))
                  }
                />
              </label>
              <label className="grid gap-1 text-xs text-slate-700">
                <span>Health Status</span>
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={updateForm.healthStatus}
                  onChange={(event) =>
                    setUpdateForm((prev) => ({ ...prev, healthStatus: event.target.value }))
                  }
                >
                  <option value="on_track">On Track</option>
                  <option value="at_risk">At Risk</option>
                  <option value="off_track">Off Track</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-slate-700 md:col-span-2">
                <span>Published Date</span>
                <Input
                  type="date"
                  value={updateForm.publishedAt}
                  onChange={(event) =>
                    setUpdateForm((prev) => ({ ...prev, publishedAt: event.target.value }))
                  }
                />
              </label>
              <div className="md:col-span-2">
                <LabeledTextarea
                  label="Update Details"
                  value={updateForm.updateBody}
                  onChange={(value) => setUpdateForm((prev) => ({ ...prev, updateBody: value }))}
                />
              </div>
              <div className="md:col-span-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!updateForm.updateTitle.trim() || !updateForm.updateBody.trim()}
                  onClick={saveProjectUpdateEntry}
                >
                  {editingProjectUpdateId ? "Save Project Update" : "Create Project Update"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showCloseoutNoteModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h5 className="text-base font-semibold text-slate-900">
                {closeoutNoteType === "improve" ? "Add Improve" : "Add Sustain"}
              </h5>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => setShowCloseoutNoteModal(false)}
              >
                Close
              </button>
            </div>
            <LabeledTextarea
              label={
                closeoutNoteType === "improve"
                  ? "What could we do better next time?"
                  : "What should we keep doing?"
              }
              value={closeoutNoteBody}
              onChange={setCloseoutNoteBody}
            />
            <div className="mt-3">
              <Button
                type="button"
                variant="secondary"
                disabled={!closeoutNoteBody.trim()}
                onClick={saveCloseoutNote}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showNewStakeholder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h5 className="text-base font-semibold text-slate-900">New Stakeholder</h5>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => setShowNewStakeholder(false)}
              >
                Close
              </button>
            </div>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={createStakeholder}>
              <Input
                placeholder="Stakeholder Name"
                value={form.stakeholderName}
                onChange={(event) => setForm((prev) => ({ ...prev, stakeholderName: event.target.value }))}
              />
              <Input
                placeholder="Role / Title"
                value={form.stakeholderRoleTitle}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, stakeholderRoleTitle: event.target.value }))
                }
              />
              <Input
                placeholder="Organization"
                value={form.organization}
                onChange={(event) => setForm((prev) => ({ ...prev, organization: event.target.value }))}
              />
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.stakeholderType}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    stakeholderType: event.target.value as "Internal" | "External"
                  }))
                }
              >
                <option value="External">External</option>
                <option value="Internal">Internal</option>
              </select>
              <Input
                placeholder="Influence Level"
                value={form.influenceLevel}
                onChange={(event) => setForm((prev) => ({ ...prev, influenceLevel: event.target.value }))}
              />
              <Input
                placeholder="Interest Level"
                value={form.interestLevel}
                onChange={(event) => setForm((prev) => ({ ...prev, interestLevel: event.target.value }))}
              />
              <Input
                placeholder="Support Level"
                value={form.supportLevel}
                onChange={(event) => setForm((prev) => ({ ...prev, supportLevel: event.target.value }))}
              />
              <Input
                placeholder="Engagement Strategy"
                value={form.engagementStrategy}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, engagementStrategy: event.target.value }))
                }
              />
              <Input
                placeholder="Communication Needs / Notes"
                value={form.communicationNeeds}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, communicationNeeds: event.target.value }))
                }
              />
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.ownerUserId}
                onChange={(event) => setForm((prev) => ({ ...prev, ownerUserId: event.target.value }))}
              >
                <option value="">Owner / Responsible Staff</option>
                {users.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.display_name ?? user.user_id}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Contact Information"
                value={form.contactInfo}
                onChange={(event) => setForm((prev) => ({ ...prev, contactInfo: event.target.value }))}
              />
              <div className="md:col-span-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Create Stakeholder"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {sharedError ? <p className="text-sm text-red-700">{sharedError}</p> : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
        active
          ? "border-brand-200 bg-brand-100 text-brand-800"
          : "border-slate-200 bg-slate-100 text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function SummaryBox({
  label,
  value,
  tone,
  compact = false
}: {
  label: string;
  value: number | string;
  tone: "red" | "amber" | "green" | "slate";
  compact?: boolean;
}) {
  const colorClass =
    tone === "red"
      ? "bg-red-50 text-red-800"
      : tone === "amber"
        ? "bg-amber-50 text-amber-800"
        : tone === "green"
          ? "bg-green-50 text-green-800"
          : "bg-slate-100 text-slate-800";

  return (
    <div className={`rounded-md border border-slate-200 p-3 ${colorClass}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className={`mt-1 font-semibold ${compact ? "text-sm" : "text-2xl"}`}>{value}</p>
    </div>
  );
}

function GuidancePanel({
  phase
}: {
  phase: { label: string; why: string; skip: string; good: string };
}) {
  return (
    <section className="rounded-md border border-blue-200 bg-blue-50 p-4">
      <h5 className="text-sm font-semibold text-blue-900">{phase.label}</h5>
      <p className="mt-1 text-xs text-blue-800">
        <strong>Why this stage exists:</strong> {phase.why}
      </p>
      <p className="mt-1 text-xs text-blue-800">
        <strong>What happens if you skip this:</strong> {phase.skip}
      </p>
      <p className="mt-1 text-xs text-blue-800">
        <strong>What good looks like:</strong> {phase.good}
      </p>
    </section>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs text-slate-700">
      <span>{label}</span>
      <textarea
        className="min-h-[90px] rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function numberOrNull(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
