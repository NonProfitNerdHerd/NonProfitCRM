"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SortDirection = "asc" | "desc";
type EventSortKey =
  | "eventName"
  | "eventDate"
  | "eventStatus"
  | "location"
  | "coordinator"
  | "roleCount"
  | "openRoles"
  | "openShifts"
  | "assignedVolunteers"
  | "waitlistCount"
  | "substituteCount";

type OverviewTab = "upcoming" | "hours";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLower(value: unknown) {
  return toText(value).toLowerCase();
}

function displayContactName(contact: Record<string, unknown> | null | undefined) {
  if (!contact) return "Unknown";
  const organization = toText(contact.organization_name);
  if (organization) return organization;
  const preferred = toText(contact.preferred_name);
  const first = toText(contact.first_name);
  const last = toText(contact.last_name);
  return preferred || `${first} ${last}`.trim() || "Unnamed contact";
}

function statusPillClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "completed" || normalized === "full") return "bg-emerald-100 text-emerald-700";
  if (normalized === "cancelled") return "bg-rose-100 text-rose-700";
  if (normalized === "draft") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-700";
}

function compareValues(a: string | number, b: string | number, direction: SortDirection) {
  let result = 0;
  if (typeof a === "number" && typeof b === "number") {
    result = a - b;
  } else {
    result = String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
  }
  return direction === "asc" ? result : -result;
}

export function VolunteerCoordinationOperationsDashboard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaWarning, setSchemaWarning] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [eventSearch, setEventSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");
  const [sortBy, setSortBy] = useState<EventSortKey>("eventDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [activeTab, setActiveTab] = useState<OverviewTab>("upcoming");

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/volunteer-coordination/overview", {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(toText(payload.message) || "Unable to load Volunteer Coordination dashboard.");
      }
      setData(payload);
      setSchemaWarning(toText(payload.schemaWarning) || null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load dashboard data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const summary = (data?.summary as Record<string, unknown> | undefined) ?? {};
  const events = useMemo(
    () => ((data?.events as Array<Record<string, unknown>> | undefined) ?? []).slice(),
    [data]
  );
  const eventRoles = useMemo(
    () => ((data?.eventRoles as Array<Record<string, unknown>> | undefined) ?? []).slice(),
    [data]
  );
  const roleShifts = useMemo(
    () => ((data?.roleShifts as Array<Record<string, unknown>> | undefined) ?? []).slice(),
    [data]
  );
  const assignments = useMemo(
    () => ((data?.assignments as Array<Record<string, unknown>> | undefined) ?? []).slice(),
    [data]
  );
  const waitlist = useMemo(
    () => ((data?.waitlist as Array<Record<string, unknown>> | undefined) ?? []).slice(),
    [data]
  );
  const substitutes = useMemo(
    () => ((data?.substitutes as Array<Record<string, unknown>> | undefined) ?? []).slice(),
    [data]
  );
  const volunteers = useMemo(
    () => ((data?.volunteers as Array<Record<string, unknown>> | undefined) ?? []).slice(),
    [data]
  );

  const rolesByEvent = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>();
    for (const role of eventRoles) {
      const eventId = toText(role.event_id);
      if (!map.has(eventId)) map.set(eventId, []);
      map.get(eventId)?.push(role);
    }
    return map;
  }, [eventRoles]);

  const shiftsByRole = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>();
    for (const shift of roleShifts) {
      const roleId = toText(shift.role_id);
      if (!map.has(roleId)) map.set(roleId, []);
      map.get(roleId)?.push(shift);
    }
    return map;
  }, [roleShifts]);

  const assignmentsByEvent = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>();
    for (const assignment of assignments) {
      const eventId = toText(assignment.event_id);
      if (!map.has(eventId)) map.set(eventId, []);
      map.get(eventId)?.push(assignment);
    }
    return map;
  }, [assignments]);

  const waitlistCountByEvent = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of waitlist) {
      const eventId = toText(entry.event_id);
      map.set(eventId, (map.get(eventId) ?? 0) + 1);
    }
    return map;
  }, [waitlist]);

  const substituteCountByEvent = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of substitutes) {
      const eventId = toText(entry.event_id);
      map.set(eventId, (map.get(eventId) ?? 0) + 1);
    }
    return map;
  }, [substitutes]);

  const eventRows = useMemo(() => {
    const activeAssignmentStatuses = new Set(["confirmed", "completed", "pending_approval", "interested"]);
    return events.map((event) => {
      const eventId = toText(event.id);
      const roles = rolesByEvent.get(eventId) ?? [];
      const eventAssignments = assignmentsByEvent.get(eventId) ?? [];
      const assignedVolunteers = eventAssignments.filter((row) =>
        activeAssignmentStatuses.has(normalizeLower(row.assignment_status))
      ).length;

      let openRoles = 0;
      let openShifts = 0;
      for (const role of roles) {
        const roleId = toText(role.id);
        const shifts = shiftsByRole.get(roleId) ?? [];
        if (shifts.length === 0) {
          const roleNeeded = Math.max(1, toNumber(role.number_needed));
          const roleFilled = eventAssignments.filter((row) => toText(row.role_id) === roleId).length;
          if (roleFilled < roleNeeded) {
            openRoles += 1;
            openShifts += 1;
          }
          continue;
        }
        let roleHasOpenShift = false;
        for (const shift of shifts) {
          const shiftId = toText(shift.id);
          const needed = Math.max(1, toNumber(shift.number_needed));
          const filled = eventAssignments.filter((row) => toText(row.shift_id) === shiftId).length;
          if (filled < needed) {
            roleHasOpenShift = true;
            openShifts += 1;
          }
        }
        if (roleHasOpenShift) openRoles += 1;
      }

      return {
        id: eventId,
        eventName: toText(event.event_name),
        eventDate: toText(event.event_date),
        eventStatus: toText(event.event_status),
        location: toText(event.location),
        coordinator: toText(event.coordinator_user_id) || "Unassigned",
        roleCount: roles.length,
        openRoles,
        openShifts,
        assignedVolunteers,
        waitlistCount: waitlistCountByEvent.get(eventId) ?? 0,
        substituteCount: substituteCountByEvent.get(eventId) ?? 0
      };
    });
  }, [events, rolesByEvent, shiftsByRole, assignmentsByEvent, waitlistCountByEvent, substituteCountByEvent]);

  const filteredSortedRows = useMemo(() => {
    const search = normalizeLower(eventSearch);
    const filtered = eventRows.filter((row) => {
      if (search) {
        const haystack = `${row.eventName} ${row.location} ${row.coordinator}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (statusFilter && normalizeLower(row.eventStatus) !== normalizeLower(statusFilter)) return false;
      if (fromDateFilter && row.eventDate < fromDateFilter) return false;
      if (toDateFilter && row.eventDate > toDateFilter) return false;
      return true;
    });
    filtered.sort((a, b) => compareValues(a[sortBy], b[sortBy], sortDirection));
    return filtered;
  }, [eventRows, eventSearch, statusFilter, fromDateFilter, toDateFilter, sortBy, sortDirection]);

  const upcomingRows = useMemo(
    () =>
      filteredSortedRows
        .filter((row) => row.eventDate >= new Date().toISOString().slice(0, 10))
        .sort((a, b) => a.eventDate.localeCompare(b.eventDate)),
    [filteredSortedRows]
  );

  const volunteersByLifetime = useMemo(() => {
    const rows = volunteers.map((volunteer) => {
      const contact = (Array.isArray(volunteer.contacts)
        ? volunteer.contacts[0]
        : volunteer.contacts) as Record<string, unknown> | null;
      return {
        id: toText(volunteer.id),
        volunteerName: displayContactName(contact),
        lifetimeHours: toNumber(volunteer.lifetime_hours),
        ytdHours: toNumber(volunteer.ytd_hours),
        lastServedDate: toText(volunteer.last_activity_at),
        status: toText(volunteer.volunteer_status)
      };
    });
    rows.sort((a, b) => b.lifetimeHours - a.lifetimeHours);
    return rows;
  }, [volunteers]);

  function handleSort(nextSortBy: EventSortKey) {
    if (sortBy === nextSortBy) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(nextSortBy);
    setSortDirection("asc");
  }

  return (
    <div className="space-y-4">
      {schemaWarning ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {schemaWarning}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Volunteers" value={toText(summary.totalVolunteers) || "0"} />
        <StatCard label="Active Volunteers" value={toText(summary.activeVolunteers) || "0"} />
        <StatCard label="Open Roles" value={toText(summary.openRoles) || "0"} />
        <StatCard label="No-Shows" value={toText(summary.noShowCount) || "0"} />
        <StatCard label="Burnout Flags" value={toText(summary.burnoutCount) || "0"} />
        <StatCard label="Caution Flags" value={toText(summary.cautionCount) || "0"} />
        <StatCard label="Waitlist Entries" value={toText(summary.waitlistCount) || "0"} />
        <StatCard label="Substitute Entries" value={toText(summary.substituteCount) || "0"} />
      </div>

      <section className="space-y-3 rounded-md border border-slate-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Volunteer Events</h3>
            <p className="text-xs text-slate-600">Operational view for staffing readiness across events.</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void loadData()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        <div className="grid gap-2 md:grid-cols-5">
          <Input
            placeholder="Search event, location, coordinator"
            value={eventSearch}
            onChange={(event) => setEventSearch(event.target.value)}
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="recruiting">Recruiting</option>
            <option value="full">Full</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <Input type="date" value={fromDateFilter} onChange={(event) => setFromDateFilter(event.target.value)} />
          <Input type="date" value={toDateFilter} onChange={(event) => setToDateFilter(event.target.value)} />
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setEventSearch("");
              setStatusFilter("");
              setFromDateFilter("");
              setToDateFilter("");
            }}
          >
            Clear Filters
          </Button>
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <SortableHeader label="Event Name" onClick={() => handleSort("eventName")} />
                <SortableHeader label="Event Date" onClick={() => handleSort("eventDate")} />
                <SortableHeader label="Status" onClick={() => handleSort("eventStatus")} />
                <SortableHeader label="Location" onClick={() => handleSort("location")} />
                <SortableHeader label="Coordinator" onClick={() => handleSort("coordinator")} />
                <SortableHeader label="# Roles" onClick={() => handleSort("roleCount")} />
                <SortableHeader label="Open Roles / Shifts" onClick={() => handleSort("openRoles")} />
                <SortableHeader label="Assigned Volunteers" onClick={() => handleSort("assignedVolunteers")} />
                <SortableHeader label="Waitlist" onClick={() => handleSort("waitlistCount")} />
                <SortableHeader label="Substitutes" onClick={() => handleSort("substituteCount")} />
              </tr>
            </thead>
            <tbody>
              {filteredSortedRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-sm text-slate-500" colSpan={10}>
                    No events match these filters.
                  </td>
                </tr>
              ) : (
                filteredSortedRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200">
                    <td className="px-3 py-2 font-medium text-slate-900">{row.eventName}</td>
                    <td className="px-3 py-2 text-slate-700">{row.eventDate}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-1 text-xs font-medium ${statusPillClass(row.eventStatus)}`}>
                        {row.eventStatus || "Unknown"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{row.location || "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{row.coordinator}</td>
                    <td className="px-3 py-2 text-slate-700">{row.roleCount}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {row.openRoles} / {row.openShifts}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{row.assignedVolunteers}</td>
                    <td className="px-3 py-2 text-slate-700">{row.waitlistCount}</td>
                    <td className="px-3 py-2 text-slate-700">{row.substituteCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 rounded-md border border-slate-200 p-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={activeTab === "upcoming" ? "primary" : "secondary"} onClick={() => setActiveTab("upcoming")}>
            Upcoming Events
          </Button>
          <Button type="button" variant={activeTab === "hours" ? "primary" : "secondary"} onClick={() => setActiveTab("hours")}>
            Volunteers by Lifetime Hours
          </Button>
        </div>

        {activeTab === "upcoming" ? (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Event Name</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Staffing Summary</th>
                </tr>
              </thead>
              <tbody>
                {upcomingRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-sm text-slate-500" colSpan={5}>
                      No upcoming events.
                    </td>
                  </tr>
                ) : (
                  upcomingRows.map((row) => (
                    <tr key={`upcoming-${row.id}`} className="border-t border-slate-200">
                      <td className="px-3 py-2 text-slate-700">{row.eventDate}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{row.eventName}</td>
                      <td className="px-3 py-2 text-slate-700">{row.location || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{row.eventStatus}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {row.assignedVolunteers} assigned | {row.openRoles} open roles | {row.openShifts} open shifts
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {activeTab === "hours" ? (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Volunteer Name</th>
                  <th className="px-3 py-2 font-medium">Lifetime Hours</th>
                  <th className="px-3 py-2 font-medium">YTD Hours</th>
                  <th className="px-3 py-2 font-medium">Last Served Date</th>
                  <th className="px-3 py-2 font-medium">Current Status</th>
                </tr>
              </thead>
              <tbody>
                {volunteersByLifetime.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-sm text-slate-500" colSpan={5}>
                      No volunteer records available.
                    </td>
                  </tr>
                ) : (
                  volunteersByLifetime.map((row) => (
                    <tr key={row.id} className="border-t border-slate-200">
                      <td className="px-3 py-2 font-medium text-slate-900">{row.volunteerName}</td>
                      <td className="px-3 py-2 text-slate-700">{row.lifetimeHours.toFixed(2)}</td>
                      <td className="px-3 py-2 text-slate-700">{row.ytdHours.toFixed(2)}</td>
                      <td className="px-3 py-2 text-slate-700">{row.lastServedDate || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{row.status || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SortableHeader({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <th className="px-3 py-2 font-medium">
      <button type="button" className="font-medium text-slate-700 hover:text-slate-900" onClick={onClick}>
        {label}
      </button>
    </th>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
