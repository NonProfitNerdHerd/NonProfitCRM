import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import {
  buildVolunteerCoordinationEmptyState,
  getVolunteerEventDetail,
  isVolunteerSchemaMissingError
} from "@/lib/volunteer-coordination/service";

type PageProps = {
  params: Promise<{ id: string }>;
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

export default async function VolunteerEventDetailPage({ params }: PageProps) {
  const { id } = await params;
  let detail: Record<string, unknown> | null = null;
  try {
    detail = (await getVolunteerEventDetail(id)) as Record<string, unknown>;
  } catch (error) {
    if (isVolunteerSchemaMissingError(error)) {
      const fallback = buildVolunteerCoordinationEmptyState();
      return (
        <Card>
          <CardHeader title="Volunteer Event" subtitle="Schema not available in this environment." />
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {toText(fallback.schemaWarning)}
          </div>
        </Card>
      );
    }
    throw error;
  }

  const event = (detail.event as Record<string, unknown> | null) ?? null;
  if (!event) notFound();
  const canViewSensitive = Boolean(detail.canViewSensitive);
  const roles = (detail.roles as Array<Record<string, unknown>> | undefined) ?? [];
  const assignments = (detail.assignments as Array<Record<string, unknown>> | undefined) ?? [];
  const waitlist = (detail.waitlist as Array<Record<string, unknown>> | undefined) ?? [];
  const substitutes = (detail.substitutes as Array<Record<string, unknown>> | undefined) ?? [];
  const hours = (detail.hours as Array<Record<string, unknown>> | undefined) ?? [];
  const imports = (detail.imports as Array<Record<string, unknown>> | undefined) ?? [];
  const incidents = (detail.incidents as Array<Record<string, unknown>> | undefined) ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={toText(event.event_name) || "Volunteer Event"}
          subtitle={`Date ${toText(event.event_date)} • Status ${toText(event.event_status)}`}
        />
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <p>
            <span className="font-medium text-slate-700">Type:</span> {toText(event.event_type) || "-"}
          </p>
          <p>
            <span className="font-medium text-slate-700">Program / Department:</span>{" "}
            {toText(event.program_department) || "-"}
          </p>
          <p>
            <span className="font-medium text-slate-700">Time:</span>{" "}
            {toText(event.start_time)} - {toText(event.end_time)}
          </p>
          <p>
            <span className="font-medium text-slate-700">Location:</span> {toText(event.location) || "-"}
          </p>
          <p>
            <span className="font-medium text-slate-700">Capacity:</span>{" "}
            {toText(event.capacity_filled) || "0"} / {toText(event.capacity_total) || "0"}
          </p>
          <p>
            <span className="font-medium text-slate-700">Visibility:</span> {toText(event.visibility) || "-"}
          </p>
          <p>
            <span className="font-medium text-slate-700">Family Friendly:</span>{" "}
            {Boolean(event.family_friendly) ? "Yes" : "No"}
          </p>
          <p>
            <span className="font-medium text-slate-700">Group Allowed:</span>{" "}
            {Boolean(event.group_allowed) ? "Yes" : "No"}
          </p>
          <p>
            <span className="font-medium text-slate-700">Minor Allowed:</span>{" "}
            {Boolean(event.minor_allowed) ? "Yes" : "No"}
          </p>
        </div>
        <div className="mt-3 flex gap-2">
          <Link
            href="/staff/volunteer-coordination"
            className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Back to Volunteer Coordination
          </Link>
        </div>
      </Card>

      <Card>
        <CardHeader title="Roles" subtitle="Role hierarchy and staffing requirements." />
        <SimpleTable
          headers={["Role", "Parent", "Needed", "Filled", "Lead", "Waitlist", "Substitute"]}
          rows={roles.map((role) => {
            const parent = roles.find((entry) => String(entry.id) === String(role.parent_role_id));
            return [
              toText(role.role_name),
              toText(parent?.role_name) || "-",
              toText(role.number_needed) || "0",
              toText(role.number_filled) || "0",
              Boolean(role.is_lead_role) ? "Yes" : "No",
              Boolean(role.waitlist_enabled) ? "Yes" : "No",
              Boolean(role.substitute_enabled) ? "Yes" : "No"
            ];
          })}
        />
      </Card>

      <Card>
        <CardHeader title="Assignments" subtitle="Volunteer staffing and attendance details." />
        <SimpleTable
          headers={["Volunteer", "Role", "Status", "Approval", "Scheduled", "Actual", "Check-in", "Check-out"]}
          rows={assignments.map((assignment) => {
            const volunteer = (Array.isArray(assignment.volunteer_profiles)
              ? assignment.volunteer_profiles[0]
              : assignment.volunteer_profiles) as Record<string, unknown> | null;
            const contact = (Array.isArray(volunteer?.contacts)
              ? (volunteer?.contacts as Array<Record<string, unknown>>)[0]
              : (volunteer?.contacts as Record<string, unknown> | null)) as Record<string, unknown> | null;
            return [
              contact
                ? `${toText(contact.organization_name) || `${toText(contact.first_name)} ${toText(contact.last_name)}`}`.trim()
                : "-",
              toText(
                (Array.isArray(assignment.volunteer_event_roles)
                  ? assignment.volunteer_event_roles[0]
                  : assignment.volunteer_event_roles as Record<string, unknown> | null)?.role_name
              ),
              toText(assignment.assignment_status),
              toText(assignment.approval_status),
              toText(assignment.scheduled_hours),
              toText(assignment.actual_hours),
              toText(assignment.check_in_at),
              toText(assignment.check_out_at)
            ];
          })}
        />
      </Card>

      <Card>
        <CardHeader title="Waitlist & Substitute Pools" subtitle="Gap management at role level." />
        <div className="grid gap-3 lg:grid-cols-2">
          <SimpleTable
            headers={["Type", "Volunteer Profile", "Role", "Order / Priority", "Status"]}
            rows={waitlist.map((entry) => [
              "Waitlist",
              toText(entry.volunteer_profile_id),
              toText(
                (Array.isArray(entry.volunteer_event_roles)
                  ? entry.volunteer_event_roles[0]
                  : entry.volunteer_event_roles as Record<string, unknown> | null)?.role_name
              ),
              toText(entry.waitlist_order),
              toText(entry.entry_status)
            ])}
          />
          <SimpleTable
            headers={["Type", "Volunteer Profile", "Role", "Order / Priority", "Status"]}
            rows={substitutes.map((entry) => [
              "Substitute",
              toText(entry.volunteer_profile_id),
              toText(
                (Array.isArray(entry.volunteer_event_roles)
                  ? entry.volunteer_event_roles[0]
                  : entry.volunteer_event_roles as Record<string, unknown> | null)?.role_name
              ),
              toText(entry.priority_order),
              toText(entry.availability_status)
            ])}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Hours & Imports" subtitle="Service logs and hour import audit for this event." />
        <div className="grid gap-3 lg:grid-cols-2">
          <SimpleTable
            headers={["Service Date", "Volunteer Profile", "Role", "Hours", "Attendance", "Source"]}
            rows={hours.map((entry) => [
              toText(entry.service_date),
              toText(entry.volunteer_profile_id),
              toText(
                (Array.isArray(entry.volunteer_event_roles)
                  ? entry.volunteer_event_roles[0]
                  : entry.volunteer_event_roles as Record<string, unknown> | null)?.role_name
              ),
              toText(entry.actual_hours),
              toText(entry.attendance_status),
              toText(entry.source)
            ])}
          />
          <SimpleTable
            headers={["Import ID", "Status", "Rows Staged", "Rows Committed", "Rows Error", "Imported At"]}
            rows={imports.map((entry) => [
              toText(entry.id),
              toText(entry.import_status),
              toText(entry.rows_staged),
              toText(entry.rows_committed),
              toText(entry.rows_error),
              toText(entry.imported_at)
            ])}
          />
        </div>
      </Card>

      {canViewSensitive ? (
        <Card>
          <CardHeader title="Incidents" subtitle="Sensitive event incidents and follow-up." />
          <SimpleTable
            headers={["When", "Category", "Severity", "Resolved", "Description"]}
            rows={incidents.map((incident) => [
              toText(incident.incident_at),
              toText(incident.incident_category),
              toText(incident.severity),
              Boolean(incident.resolved) ? "Yes" : "No",
              toText(incident.description)
            ])}
          />
        </Card>
      ) : null}
    </div>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="max-h-96 overflow-auto rounded-md border border-slate-200">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {headers.map((header) => (
              <th key={header} className="px-2 py-2 font-semibold text-slate-700">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row, index) => (
              <tr key={`${index}-${row.join("|")}`} className="border-b border-slate-100">
                {row.map((cell, cellIndex) => (
                  <td key={`${index}-${cellIndex}`} className="px-2 py-2 text-slate-700">
                    {cell || "-"}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-2 py-3 text-slate-500" colSpan={headers.length}>
                No records found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
