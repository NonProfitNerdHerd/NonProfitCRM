import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import {
  buildVolunteerCoordinationEmptyState,
  getVolunteerProfileDetail,
  isVolunteerSchemaMissingError
} from "@/lib/volunteer-coordination/service";

type PageProps = {
  params: Promise<{ id: string }>;
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function displayContactName(contact: Record<string, unknown> | null) {
  if (!contact) return "-";
  const orgName = toText(contact.organization_name);
  if (orgName) return orgName;
  const fullName = `${toText(contact.first_name)} ${toText(contact.last_name)}`.trim();
  return fullName || toText(contact.id) || "-";
}

export default async function VolunteerProfileDetailPage({ params }: PageProps) {
  const { id } = await params;
  let detail: Record<string, unknown> | null = null;
  try {
    detail = (await getVolunteerProfileDetail(id)) as Record<string, unknown>;
  } catch (error) {
    if (isVolunteerSchemaMissingError(error)) {
      const fallback = buildVolunteerCoordinationEmptyState();
      return (
        <Card>
          <CardHeader title="Volunteer Profile" subtitle="Schema not available in this environment." />
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {toText(fallback.schemaWarning)}
          </div>
        </Card>
      );
    }
    throw error;
  }

  const profile = (detail.profile as Record<string, unknown> | null) ?? null;
  if (!profile) notFound();
  const contact = (Array.isArray(profile.contacts)
    ? profile.contacts[0]
    : profile.contacts) as Record<string, unknown> | null;
  const canViewSensitive = Boolean(detail.canViewSensitive);
  const assignments = (detail.assignments as Array<Record<string, unknown>> | undefined) ?? [];
  const hours = (detail.hours as Array<Record<string, unknown>> | undefined) ?? [];
  const concerns = (detail.concerns as Array<Record<string, unknown>> | undefined) ?? [];
  const complianceItems = (detail.complianceItems as Array<Record<string, unknown>> | undefined) ?? [];
  const incidents = (detail.incidents as Array<Record<string, unknown>> | undefined) ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={displayContactName(contact)}
          subtitle={`Volunteer Profile ${toText(profile.id)} • Status ${toText(profile.volunteer_status)}`}
        />
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <p>
            <span className="font-medium text-slate-700">Volunteer Type:</span>{" "}
            {toText(profile.volunteer_type) || "-"}
          </p>
          <p>
            <span className="font-medium text-slate-700">Reliability:</span>{" "}
            {toText(profile.reliability_indicator)} ({toText(profile.reliability_score)})
          </p>
          <p>
            <span className="font-medium text-slate-700">Lifetime Hours:</span>{" "}
            {toText(profile.lifetime_hours)}
          </p>
          <p>
            <span className="font-medium text-slate-700">Year-to-Date Hours:</span> {toText(profile.ytd_hours)}
          </p>
          <p>
            <span className="font-medium text-slate-700">Burnout Flag:</span>{" "}
            {Boolean(profile.burnout_flag) ? "Yes" : "No"}
          </p>
          <p>
            <span className="font-medium text-slate-700">Caution / Blacklist:</span>{" "}
            {Boolean(profile.caution_flag) || Boolean(profile.soft_blacklist_flag) ? "Yes" : "No"}
          </p>
          <p>
            <span className="font-medium text-slate-700">Last Activity:</span>{" "}
            {toText(profile.last_activity_at) || "-"}
          </p>
          <p>
            <span className="font-medium text-slate-700">Guardian Consent:</span>{" "}
            {toText(profile.guardian_consent_status)}
          </p>
          <p className="md:col-span-2">
            <span className="font-medium text-slate-700">Skills:</span>{" "}
            {Array.isArray(profile.skills)
              ? profile.skills.map((entry) => toText(entry)).filter(Boolean).join(", ")
              : "-"}
          </p>
          <p className="md:col-span-2">
            <span className="font-medium text-slate-700">Certifications:</span>{" "}
            {Array.isArray(profile.certifications)
              ? profile.certifications.map((entry) => toText(entry)).filter(Boolean).join(", ")
              : "-"}
          </p>
        </div>
        <div className="mt-3">
          <Link
            href="/staff/volunteer-coordination"
            className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Back to Volunteer Coordination
          </Link>
        </div>
      </Card>

      <Card>
        <CardHeader title="Assignments" subtitle="Volunteer assignment and attendance history." />
        <SimpleTable
          headers={["Event", "Role", "Status", "Assigned At", "Actual Hours", "Check-in", "Check-out"]}
          rows={assignments.map((assignment) => [
            toText(
              (Array.isArray(assignment.volunteer_events)
                ? assignment.volunteer_events[0]
                : assignment.volunteer_events as Record<string, unknown> | null)?.event_name
            ),
            toText(
              (Array.isArray(assignment.volunteer_event_roles)
                ? assignment.volunteer_event_roles[0]
                : assignment.volunteer_event_roles as Record<string, unknown> | null)?.role_name
            ),
            toText(assignment.assignment_status),
            toText(assignment.assigned_at),
            toText(assignment.actual_hours),
            toText(assignment.check_in_at),
            toText(assignment.check_out_at)
          ])}
        />
      </Card>

      <Card>
        <CardHeader title="Service Hours" subtitle="Detailed volunteer hour records." />
        <SimpleTable
          headers={["Service Date", "Event", "Role", "Hours", "Attendance", "Source"]}
          rows={hours.map((entry) => [
            toText(entry.service_date),
            toText(
              (Array.isArray(entry.volunteer_events)
                ? entry.volunteer_events[0]
                : entry.volunteer_events as Record<string, unknown> | null)?.event_name
            ),
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
      </Card>

      {canViewSensitive ? (
        <>
          <Card>
            <CardHeader title="Compliance Records" subtitle="Eligibility and compliance tracking." />
            <SimpleTable
              headers={["Type", "Status", "Completed", "Expires", "Notes"]}
              rows={complianceItems.map((item) => [
                toText(item.compliance_type),
                toText(item.compliance_status),
                toText(item.completed_at),
                toText(item.expires_at),
                toText(item.notes)
              ])}
            />
          </Card>
          <Card>
            <CardHeader title="Concern History" subtitle="Caution, restrictions, and review history." />
            <SimpleTable
              headers={["Category", "Type", "Severity", "Action", "Status", "Date"]}
              rows={concerns.map((concern) => [
                toText(concern.concern_category),
                toText(concern.concern_type),
                toText(concern.severity),
                toText(concern.action_level),
                toText(concern.review_status),
                toText(concern.concern_date)
              ])}
            />
          </Card>
          <Card>
            <CardHeader title="Incident Involvement" subtitle="Incidents tied to this volunteer." />
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
        </>
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
