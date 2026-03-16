export const ROLE_HIERARCHY_ORDER = [
  "administrator",
  "data_administrator",
  "executive_staff",
  "staff_pii",
  "staff_non_pii",
  "data_entry",
  "volunteer"
] as const;

export type CanonicalRoleKey = (typeof ROLE_HIERARCHY_ORDER)[number];

export const ROLE_HIERARCHY_DESCRIPTIONS: Record<CanonicalRoleKey, string> = {
  administrator:
    "Full system access. Can manage users, roles, integrations, and all operational/financial modules.",
  data_administrator:
    "High-privilege data operations role. Can manage integrations and mass-delete workflows, but cannot edit role definitions.",
  executive_staff:
    "Leadership role with campaign and financial visibility/management and project creation.",
  staff_pii:
    "Operational staff role with access to protected PII fields and project/task creation.",
  staff_non_pii:
    "Operational staff role without sensitive PII visibility; includes project/task creation.",
  data_entry:
    "Data input role for creating contacts/donations and editing only contacts they created.",
  volunteer: "Minimal access role with limited read-only functionality."
};

export function roleOrderScore(roleKey: string) {
  const index = ROLE_HIERARCHY_ORDER.indexOf(roleKey as CanonicalRoleKey);
  if (index >= 0) return index;
  return ROLE_HIERARCHY_ORDER.length + 10;
}
