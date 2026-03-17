"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { DonationsManagement } from "@/components/donations/donations-management";
import { ContactTagManager } from "@/components/contacts/contact-tag-manager";
import { ContactVolunteerProfileTab } from "@/components/contacts/contact-volunteer-profile-tab";

const recordTypeOptions = ["person", "organization"] as const;
const trackingStatusOptions = ["donor", "lead", "non_lead"] as const;

type ContactProfileTabsProps = {
  contactId: string;
  contactDetails: Record<string, unknown>;
  taskUrgency: "default" | "yellow" | "red";
  activity: Array<Record<string, unknown>>;
  donations: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  memberships: Array<Record<string, unknown>>;
  campaigns: Array<Record<string, unknown>>;
  staffUsers: Array<{ user_id: string; display_name?: string | null }>;
};

type WorkbenchItem = {
  id: string;
  itemType: string;
  title: string;
  summary: string;
  createdBy: string;
  createdAt: string | null;
  metadata: Array<{ label: string; value: string }>;
};

function parseCommunicationPreferences(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter(Boolean);
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, isEnabled]) => Boolean(isEnabled))
      .map(([label]) => label);
  }
  return [] as string[];
}

function buildOrganizationFormalLetterName(input: {
  organizationName: string;
  firstName: string;
  lastName: string;
}) {
  const org = input.organizationName.trim();
  const primaryName = `${input.firstName.trim()} ${input.lastName.trim()}`.trim();
  if (!org && !primaryName) return "";
  if (!org) return primaryName;
  if (!primaryName) return org;
  return `${org}\nc/o ${primaryName}`;
}

export function ContactProfileTabs({
  contactId,
  contactDetails,
  taskUrgency,
  activity,
  donations,
  notes,
  tasks,
  memberships,
  campaigns,
  staffUsers
}: ContactProfileTabsProps) {
  const router = useRouter();
  const isOrganizationContact = String(contactDetails.entity_type ?? "person") === "organization";
  const initialExternalSource = String(contactDetails.external_source ?? "").toLowerCase();
  const initialGivingFuelId =
    (initialExternalSource === "givingfuel" || initialExternalSource === "webconnex"
      ? String(contactDetails.external_source_id ?? "")
      : "") || String(contactDetails.webconnex_id ?? "");
  const [activeTab, setActiveTab] = useState<
    | "activity"
    | "contactInfo"
    | "tags"
    | "donations"
    | "volunteer"
    | "notes"
    | "tasks"
    | "memberships"
  >("activity");
  const [noteBody, setNoteBody] = useState("");
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpAssignedToUserId, setFollowUpAssignedToUserId] = useState("");
  const [followUpSuspenseDate, setFollowUpSuspenseDate] = useState("");
  const [followUpTaskDescription, setFollowUpTaskDescription] = useState("");
  const [selectedItem, setSelectedItem] = useState<WorkbenchItem | null>(null);
  const [showContactInfoModal, setShowContactInfoModal] = useState(false);
  const [contactInfo, setContactInfo] = useState({
    recordType: String(contactDetails.entity_type ?? "person"),
    trackingStatus: String(contactDetails.tracking_status ?? "lead"),
    webconnexId: initialGivingFuelId,
    firstName: String(contactDetails.first_name ?? ""),
    lastName: String(contactDetails.last_name ?? ""),
    preferredName: String(contactDetails.preferred_name ?? ""),
    formalLetterName: String(contactDetails.formal_letter_name ?? ""),
    organizationName: String(contactDetails.organization_name ?? ""),
    donorStatus: String(contactDetails.donor_status ?? "prospect"),
    memberStatus: String(contactDetails.member_status ?? "none"),
    email: String(contactDetails.email ?? ""),
    alternateEmail: String(contactDetails.alternate_email ?? ""),
    phone: String(contactDetails.phone ?? ""),
    mobileNumber: String(contactDetails.mobile_number ?? ""),
    alternatePhone: String(contactDetails.alternate_phone ?? ""),
    emergencyContact: String(contactDetails.emergency_contact ?? ""),
    emergencyContactPhone: String(contactDetails.emergency_contact_phone ?? ""),
    communicationPreferences: parseCommunicationPreferences(contactDetails.communication_preferences),
    addressLine1: String(contactDetails.address_line_1 ?? ""),
    addressLine2: String(contactDetails.address_line_2 ?? ""),
    city: String(contactDetails.city ?? ""),
    state: String(contactDetails.state ?? ""),
    postalCode: String(contactDetails.postal_code ?? ""),
    mailingAddressLine1: String(contactDetails.mailing_address_line_1 ?? ""),
    mailingAddressLine2: String(contactDetails.mailing_address_line_2 ?? ""),
    mailingCity: String(contactDetails.mailing_city ?? ""),
    mailingState: String(contactDetails.mailing_state ?? ""),
    mailingPostalCode: String(contactDetails.mailing_postal_code ?? "")
  });
  const [contactInfoDraft, setContactInfoDraft] = useState(contactInfo);
  const [formalLetterManualOverride, setFormalLetterManualOverride] = useState(false);
  const [followUpType, setFollowUpType] = useState<"task" | "note">("task");
  const [followUpBody, setFollowUpBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const taskTabClasses = useMemo(() => {
    if (taskUrgency === "red") return "bg-red-100 text-red-800 border-red-200";
    if (taskUrgency === "yellow") return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-slate-100 text-slate-700 border-slate-200";
  }, [taskUrgency]);

  useEffect(() => {
    setContactInfoDraft((prev) => {
      if (prev.recordType !== "person" || !prev.organizationName) return prev;
      return { ...prev, organizationName: "" };
    });
  }, [contactInfoDraft.recordType]);

  useEffect(() => {
    setContactInfoDraft((prev) => {
      if (!prev.webconnexId.trim()) return prev;
      if (prev.recordType === "person") return prev;
      return { ...prev, recordType: "person" };
    });
  }, [contactInfoDraft.webconnexId, contactInfoDraft.recordType]);

  useEffect(() => {
    if (contactInfoDraft.recordType !== "organization" || formalLetterManualOverride) return;
    const generated = buildOrganizationFormalLetterName({
      organizationName: contactInfoDraft.organizationName,
      firstName: contactInfoDraft.firstName,
      lastName: contactInfoDraft.lastName
    });
    setContactInfoDraft((prev) => {
      if (prev.formalLetterName === generated) return prev;
      return { ...prev, formalLetterName: generated };
    });
  }, [
    contactInfoDraft.recordType,
    contactInfoDraft.organizationName,
    contactInfoDraft.firstName,
    contactInfoDraft.lastName,
    formalLetterManualOverride
  ]);

  function openItem(item: WorkbenchItem) {
    setSelectedItem(item);
    setFollowUpType("task");
    setFollowUpBody("");
    setFollowUpAssignedToUserId("");
    setFollowUpSuspenseDate("");
  }

  async function submitNote(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contactId,
        body: noteBody,
        followUpRequired,
        followUpAssignedToUserId: followUpAssignedToUserId || undefined,
        followUpSuspenseDate: followUpSuspenseDate || undefined,
        followUpTaskDescription: followUpTaskDescription || undefined
      })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to save note.");
      setLoading(false);
      return;
    }

    setMessage("Note added.");
    setNoteBody("");
    setFollowUpRequired(false);
    setFollowUpAssignedToUserId("");
    setFollowUpSuspenseDate("");
    setFollowUpTaskDescription("");
    setLoading(false);
    router.refresh();
  }

  async function submitFollowUp(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedItem) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    const endpoint = followUpType === "task" ? "/api/tasks" : "/api/notes";
    const payload =
      followUpType === "task"
        ? {
            title: followUpBody || `Follow up: ${selectedItem.title}`,
            description: selectedItem.summary,
            suspenseDate: followUpSuspenseDate || undefined,
            assignedToUserId: followUpAssignedToUserId || undefined,
            contactId
          }
        : {
            contactId,
            body: followUpBody || `Follow up from ${selectedItem.itemType}: ${selectedItem.title}`,
            followUpRequired: false
          };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const responsePayload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(responsePayload?.message ?? "Unable to create follow-up.");
      setLoading(false);
      return;
    }

    setMessage("Follow-up created.");
    setSelectedItem(null);
    setFollowUpBody("");
    setLoading(false);
    router.refresh();
  }

  async function submitContactInfo(event: React.FormEvent) {
    event.preventDefault();
    if (!contactInfoDraft.firstName.trim()) {
      setError("First Name is required.");
      return;
    }
    if (!contactInfoDraft.lastName.trim()) {
      setError("Last Name is required.");
      return;
    }
    if (
      contactInfoDraft.recordType === "organization" &&
      !contactInfoDraft.organizationName.trim()
    ) {
      setError("Organization Name is required when Record Type is Organization.");
      return;
    }
    if (
      contactInfo.trackingStatus === "donor" &&
      contactInfoDraft.trackingStatus !== "donor"
    ) {
      setError("Donor classification cannot be downgraded.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);

    const response = await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entity_type: contactInfoDraft.recordType,
        tracking_status: contactInfoDraft.trackingStatus,
        first_name: contactInfoDraft.firstName,
        last_name: contactInfoDraft.lastName,
        preferred_name: contactInfoDraft.preferredName,
        formal_letter_name: contactInfoDraft.formalLetterName,
        organization_name:
          contactInfoDraft.recordType === "organization"
            ? contactInfoDraft.organizationName
            : "",
        donor_status: contactInfoDraft.donorStatus,
        member_status: contactInfoDraft.memberStatus,
        email: contactInfoDraft.email,
        alternate_email: contactInfoDraft.alternateEmail,
        phone: contactInfoDraft.phone,
        mobile_number: contactInfoDraft.mobileNumber,
        alternate_phone: contactInfoDraft.alternatePhone,
        emergency_contact: contactInfoDraft.emergencyContact,
        emergency_contact_phone: contactInfoDraft.emergencyContactPhone,
        communication_preferences: contactInfoDraft.communicationPreferences,
        address_line_1: contactInfoDraft.addressLine1,
        address_line_2: contactInfoDraft.addressLine2,
        city: contactInfoDraft.city,
        state: contactInfoDraft.state,
        postal_code: contactInfoDraft.postalCode,
        mailing_address_line_1: contactInfoDraft.mailingAddressLine1,
        mailing_address_line_2: contactInfoDraft.mailingAddressLine2,
        mailing_city: contactInfoDraft.mailingCity,
        mailing_state: contactInfoDraft.mailingState,
        mailing_postal_code: contactInfoDraft.mailingPostalCode
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to update contact information.");
      setLoading(false);
      return;
    }

    setContactInfo({
      ...contactInfoDraft,
      trackingStatus:
        contactInfoDraft.webconnexId.trim() !== "" ? "donor" : contactInfoDraft.trackingStatus
    });
    setShowContactInfoModal(false);
    setMessage("Contact information updated.");
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <TabButton active={activeTab === "activity"} onClick={() => setActiveTab("activity")}>
          Activity Information
        </TabButton>
        <TabButton
          active={activeTab === "contactInfo"}
          onClick={() => setActiveTab("contactInfo")}
        >
          Contact Information
        </TabButton>
        <TabButton active={activeTab === "tags"} onClick={() => setActiveTab("tags")}>
          Tags
        </TabButton>
        <TabButton active={activeTab === "donations"} onClick={() => setActiveTab("donations")}>
          Donations
        </TabButton>
        {!isOrganizationContact ? (
          <TabButton active={activeTab === "volunteer"} onClick={() => setActiveTab("volunteer")}>
            Volunteer
          </TabButton>
        ) : null}
        <TabButton active={activeTab === "notes"} onClick={() => setActiveTab("notes")}>
          Notes
        </TabButton>
        <TabButton
          active={activeTab === "memberships"}
          onClick={() => setActiveTab("memberships")}
        >
          Memberships
        </TabButton>
        <button
          type="button"
          onClick={() => setActiveTab("tasks")}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${taskTabClasses}`}
        >
          Tasks
        </button>
      </div>

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {activeTab === "activity" ? (
        <div className="space-y-2">
          {activity.length === 0 ? (
            <p className="text-sm text-slate-500">No activity yet.</p>
          ) : (
            activity.map((entry) => (
              <button
                type="button"
                key={entry.id as string}
                className="w-full rounded-md border border-slate-200 p-3 text-left"
                onClick={() =>
                  openItem({
                    id: String(entry.id ?? ""),
                    itemType: "Activity",
                    title: String(entry.action_type ?? "Activity"),
                    summary: String(entry.action_summary ?? ""),
                    createdBy: String(entry.performed_by_user_id ?? "Unknown"),
                    createdAt: (entry.created_at as string) ?? null,
                    metadata: [{ label: "Entity", value: String(entry.entity_type ?? "-") }]
                  })
                }
              >
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{entry.action_type as string}</span>
                  <span>{formatDate(entry.created_at as string)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-800">{entry.action_summary as string}</p>
                <p className="mt-1 text-xs text-slate-500">{entry.entity_type as string}</p>
              </button>
            ))
          )}
        </div>
      ) : null}

      {activeTab === "contactInfo" ? (
        <div className="space-y-4 rounded-md border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Contact Information</p>
            <Button
              type="button"
              onClick={() => {
                setContactInfoDraft(contactInfo);
                setFormalLetterManualOverride(false);
                setShowContactInfoModal(true);
              }}
            >
              Edit
            </Button>
          </div>
          <section className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Contact Type</p>
            <div className="grid gap-3 md:grid-cols-2">
              <LabeledValue
                label="Record Type"
                value={contactInfo.recordType === "organization" ? "Organization" : "Person"}
              />
              <LabeledValue
                label="Tracking Status"
                value={contactInfo.trackingStatus.replaceAll("_", "-")}
              />
            </div>
          </section>

          <section className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Name</p>
            <div className="grid gap-3 md:grid-cols-2">
              {contactInfo.recordType === "organization" ? (
                <LabeledValue label="Organization Name" value={contactInfo.organizationName} />
              ) : null}
              <LabeledValue
                label={
                  contactInfo.recordType === "organization"
                    ? "Primary Contact First Name"
                    : "First Name"
                }
                value={contactInfo.firstName}
              />
              <LabeledValue
                label={
                  contactInfo.recordType === "organization"
                    ? "Primary Contact Last Name"
                    : "Last Name"
                }
                value={contactInfo.lastName}
              />
              <LabeledValue label="Display / Preferred Name" value={contactInfo.preferredName} />
              <LabeledValue label="Formal Letter Name" value={contactInfo.formalLetterName} />
            </div>
          </section>

          <section className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Contact Methods</p>
            <div className="grid gap-3 md:grid-cols-2">
              <LabeledValue label="Phone Number" value={contactInfo.phone} />
              <LabeledValue label="Alternate Phone Number" value={contactInfo.alternatePhone} />
              {contactInfo.recordType === "person" ? (
                <LabeledValue label="Mobile Number" value={contactInfo.mobileNumber} />
              ) : null}
              <LabeledValue label="Email" value={contactInfo.email} />
              <LabeledValue label="Alternate Email" value={contactInfo.alternateEmail} />
              {contactInfo.recordType === "person" ? (
                <>
                  <LabeledValue label="Emergency Contact" value={contactInfo.emergencyContact} />
                  <LabeledValue
                    label="Emergency Contact Phone Number"
                    value={contactInfo.emergencyContactPhone}
                  />
                </>
              ) : null}
            </div>
          </section>

          {contactInfo.recordType === "person" ? (
            <section className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Preferences - Communication</p>
              <LabeledValue
                label="Selected Preferences"
                value={
                  contactInfo.communicationPreferences.length > 0
                    ? contactInfo.communicationPreferences.join(", ")
                    : ""
                }
              />
            </section>
          ) : null}

          <section className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Physical Address</p>
            <div className="grid gap-3 md:grid-cols-2">
              <LabeledValue label="Physical Address Line 1" value={contactInfo.addressLine1} />
              <LabeledValue label="Physical Address Line 2" value={contactInfo.addressLine2} />
              <LabeledValue label="City" value={contactInfo.city} />
              <LabeledValue label="State" value={contactInfo.state} />
              <LabeledValue label="Zip" value={contactInfo.postalCode} />
            </div>
          </section>

          <section className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Mailing Address</p>
            <div className="grid gap-3 md:grid-cols-2">
              <LabeledValue
                label="Mailing Address Line 1"
                value={contactInfo.mailingAddressLine1}
              />
              <LabeledValue
                label="Mailing Address Line 2"
                value={contactInfo.mailingAddressLine2}
              />
              <LabeledValue label="Mailing City" value={contactInfo.mailingCity} />
              <LabeledValue label="Mailing State" value={contactInfo.mailingState} />
              <LabeledValue label="Mailing Zip" value={contactInfo.mailingPostalCode} />
            </div>
          </section>

          <section className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">External Data Points</p>
            <LabeledValue label="GivingFuel ID" value={contactInfo.webconnexId} />
          </section>
        </div>
      ) : null}

      {activeTab === "tags" ? <ContactTagManager contactId={contactId} /> : null}

      {activeTab === "donations" ? (
        <DonationsManagement
          initialDonations={donations}
          campaigns={campaigns.map((campaign) => ({
            id: String(campaign.id ?? ""),
            name: String(campaign.name ?? "")
          }))}
          detailBasePath="/staff/financial/donations"
          campaignBasePath="/staff/financial/campaigns"
          fixedContact={{
            id: contactId,
            displayName:
              String(contactInfo.preferredName || "").trim() ||
              `${contactInfo.firstName} ${contactInfo.lastName}`.trim()
          }}
        />
      ) : null}

      {!isOrganizationContact && activeTab === "volunteer" ? (
        <ContactVolunteerProfileTab contactId={contactId} />
      ) : null}

      {activeTab === "notes" ? (
        <div className="space-y-4">
          <div className="space-y-2">
            {notes.length === 0 ? (
              <p className="text-sm text-slate-500">No notes available.</p>
            ) : (
              notes.map((note) => (
                <button
                  key={note.id as string}
                  type="button"
                  className="w-full rounded-md border border-slate-200 p-3 text-left"
                  onClick={() =>
                    openItem({
                      id: String(note.id ?? ""),
                      itemType: "Note",
                      title: String(note.note_type ?? "Note"),
                      summary: String(note.body ?? ""),
                      createdBy: String(note.created_by ?? "Unknown"),
                      createdAt: (note.created_at as string) ?? null,
                      metadata: []
                    })
                  }
                >
                  <p className="text-xs text-slate-500">
                    {formatDate(note.created_at as string)} • {(note.created_by as string) ?? "Unknown"}
                  </p>
                  <p className="mt-1 text-sm text-slate-800">{note.body as string}</p>
                </button>
              ))
            )}
          </div>

          <form onSubmit={submitNote} className="rounded-md border border-slate-200 p-4">
            <p className="mb-2 text-sm font-semibold">Add Note</p>
            <textarea
              className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
              placeholder="Write note details..."
            />
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={followUpRequired}
                onChange={(event) => setFollowUpRequired(event.target.checked)}
              />
              Follow Up Required
            </label>

            {followUpRequired ? (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={followUpAssignedToUserId}
                  onChange={(event) => setFollowUpAssignedToUserId(event.target.value)}
                >
                  <option value="">Assign staff member</option>
                  {staffUsers.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.display_name || user.user_id}
                    </option>
                  ))}
                </select>
                <Input
                  type="date"
                  value={followUpSuspenseDate}
                  onChange={(event) => setFollowUpSuspenseDate(event.target.value)}
                />
                <Input
                  placeholder="Task description"
                  value={followUpTaskDescription}
                  onChange={(event) => setFollowUpTaskDescription(event.target.value)}
                />
              </div>
            ) : null}

            <Button className="mt-3" type="submit" disabled={loading}>
              Add Note
            </Button>
          </form>
        </div>
      ) : null}

      {activeTab === "memberships" ? (
        <div className="space-y-2">
          {memberships.length === 0 ? (
            <p className="text-sm text-slate-500">No membership activity for this contact.</p>
          ) : (
            memberships.map((membership) => {
              const membershipType = Array.isArray(membership.membership_types)
                ? membership.membership_types[0]
                : membership.membership_types;
              return (
                <button
                  key={membership.id as string}
                  type="button"
                  className="w-full rounded-md border border-slate-200 p-3 text-left"
                  onClick={() =>
                    openItem({
                      id: String(membership.id ?? ""),
                      itemType: "Membership",
                      title: String(membershipType?.name ?? "Membership"),
                      summary: `Status: ${String(membership.status ?? "-")} • Level: ${String(
                        membership.level ?? "-"
                      )}`,
                      createdBy: String(membership.created_by ?? "Unknown"),
                      createdAt: (membership.created_at as string) ?? null,
                      metadata: [
                        { label: "Status", value: String(membership.status ?? "-") },
                        { label: "Renewal", value: formatDate(membership.renewal_date as string) }
                      ]
                    })
                  }
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {(membershipType?.name as string) ?? "Membership"}
                  </p>
                  <p className="text-xs text-slate-600">
                    {membership.status as string} • Renewal {formatDate(membership.renewal_date as string)}
                  </p>
                </button>
              );
            })
          )}
        </div>
      ) : null}

      {activeTab === "tasks" ? (
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <p className="text-sm text-slate-500">No tasks linked to this contact.</p>
          ) : (
            tasks.map((task) => {
              const project = Array.isArray(task.projects)
                ? task.projects[0]
                : (task.projects as Record<string, unknown> | null);
              return (
                <button
                  type="button"
                  key={task.id as string}
                  className="w-full rounded-md border border-slate-200 p-3 text-left"
                  onClick={() =>
                    openItem({
                      id: String(task.id ?? ""),
                      itemType: "Task",
                      title: String(task.title ?? "Task"),
                      summary: String(task.description ?? "-"),
                      createdBy: String(task.created_by ?? "Unknown"),
                      createdAt: (task.created_at as string) ?? null,
                      metadata: [
                        { label: "Status", value: String(task.status ?? "-") },
                        { label: "Priority", value: String(task.priority ?? "-") },
                        { label: "Due", value: formatDate(task.due_date as string) }
                      ]
                    })
                  }
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">{task.title as string}</p>
                    <span className="text-xs text-slate-500">{formatDate(task.due_date as string)}</span>
                  </div>
                  <p className="text-sm text-slate-700">{(task.description as string) ?? "-"}</p>
                  <p className="text-xs text-slate-500">
                    {(task.status as string) ?? "-"} • {(task.priority as string) ?? "-"}{" "}
                    {project?.name ? `• Project: ${project.name as string}` : ""}
                  </p>
                </button>
              );
            })
          )}
        </div>
      ) : null}

      {showContactInfoModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Edit Contact Information</h3>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => setShowContactInfoModal(false)}
              >
                Close
              </button>
            </div>
            <form className="space-y-4" onSubmit={submitContactInfo}>
              <section className="rounded-md border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">Contact Type</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <FormField label="Record Type *">
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={contactInfoDraft.recordType}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({
                          ...prev,
                          recordType: event.target.value
                        }))
                      }
                      disabled={Boolean(contactInfoDraft.webconnexId.trim())}
                    >
                      {recordTypeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option === "organization" ? "Organization" : "Person"}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Tracking Status *">
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={contactInfoDraft.trackingStatus}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({
                          ...prev,
                          trackingStatus: event.target.value
                        }))
                      }
                    >
                      {trackingStatusOptions.map((option) => (
                        <option key={option} value={option}>
                          {option === "non_lead"
                            ? "Non-Lead"
                            : option.charAt(0).toUpperCase() + option.slice(1)}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
              </section>

              <section className="rounded-md border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">Name</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {contactInfoDraft.recordType === "organization" ? (
                    <FormField label="Organization Name *">
                      <Input
                        value={contactInfoDraft.organizationName}
                        onChange={(event) =>
                          setContactInfoDraft((prev) => ({
                            ...prev,
                            organizationName: event.target.value
                          }))
                        }
                      />
                    </FormField>
                  ) : null}
                  <FormField
                    label={
                      contactInfoDraft.recordType === "organization"
                        ? "Primary Contact First Name *"
                        : "First Name *"
                    }
                  >
                    <Input
                      value={contactInfoDraft.firstName}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({ ...prev, firstName: event.target.value }))
                      }
                    />
                  </FormField>
                  <FormField
                    label={
                      contactInfoDraft.recordType === "organization"
                        ? "Primary Contact Last Name *"
                        : "Last Name *"
                    }
                  >
                    <Input
                      value={contactInfoDraft.lastName}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({ ...prev, lastName: event.target.value }))
                      }
                    />
                  </FormField>
                  <FormField label="Display / Preferred Name">
                    <Input
                      value={contactInfoDraft.preferredName}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({
                          ...prev,
                          preferredName: event.target.value
                        }))
                      }
                    />
                  </FormField>
                  <FormField label="Formal Letter Name">
                    <Input
                      value={contactInfoDraft.formalLetterName}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({
                          ...prev,
                          formalLetterName: event.target.value
                        }))
                      }
                    />
                    {contactInfoDraft.recordType === "organization" ? (
                      <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={formalLetterManualOverride}
                          onChange={(event) => setFormalLetterManualOverride(event.target.checked)}
                        />
                        Manually override organization formal letter name
                      </label>
                    ) : null}
                  </FormField>
                </div>
              </section>

              <section className="rounded-md border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">Contact Methods</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <FormField label="Phone Number">
                    <Input
                      value={contactInfoDraft.phone}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({ ...prev, phone: event.target.value }))
                      }
                    />
                  </FormField>
                  <FormField label="Alternate Phone Number">
                    <Input
                      value={contactInfoDraft.alternatePhone}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({
                          ...prev,
                          alternatePhone: event.target.value
                        }))
                      }
                    />
                  </FormField>
                  {contactInfoDraft.recordType === "person" ? (
                    <FormField label="Mobile Number">
                      <Input
                        value={contactInfoDraft.mobileNumber}
                        onChange={(event) =>
                          setContactInfoDraft((prev) => ({
                            ...prev,
                            mobileNumber: event.target.value
                          }))
                        }
                      />
                    </FormField>
                  ) : null}
                  <FormField label="Email">
                    <Input
                      type="email"
                      value={contactInfoDraft.email}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({ ...prev, email: event.target.value }))
                      }
                    />
                  </FormField>
                  <FormField label="Alternate Email">
                    <Input
                      type="email"
                      value={contactInfoDraft.alternateEmail}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({
                          ...prev,
                          alternateEmail: event.target.value
                        }))
                      }
                    />
                  </FormField>
                  {contactInfoDraft.recordType === "person" ? (
                    <>
                      <FormField label="Emergency Contact">
                        <Input
                          value={contactInfoDraft.emergencyContact}
                          onChange={(event) =>
                            setContactInfoDraft((prev) => ({
                              ...prev,
                              emergencyContact: event.target.value
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="Emergency Contact Phone Number">
                        <Input
                          value={contactInfoDraft.emergencyContactPhone}
                          onChange={(event) =>
                            setContactInfoDraft((prev) => ({
                              ...prev,
                              emergencyContactPhone: event.target.value
                            }))
                          }
                        />
                      </FormField>
                    </>
                  ) : null}
                </div>
              </section>

              {contactInfoDraft.recordType === "person" ? (
                <section className="rounded-md border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">
                  Preferences - Communication
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {["Marketing Email", "Other Mail", "Phone Calls", "Newsletter"].map(
                    (option) => {
                      const checked = contactInfoDraft.communicationPreferences.includes(option);
                      return (
                        <label
                          key={option}
                          className="flex items-center gap-2 text-sm text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setContactInfoDraft((prev) => ({
                                ...prev,
                                communicationPreferences: event.target.checked
                                  ? Array.from(new Set([...prev.communicationPreferences, option]))
                                  : prev.communicationPreferences.filter(
                                      (entry) => entry !== option
                                    )
                              }))
                            }
                          />
                          {option}
                        </label>
                      );
                    }
                  )}
                </div>
                </section>
              ) : null}

              <section className="rounded-md border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">Physical Address</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <FormField label="Physical Address Line 1">
                    <Input
                      value={contactInfoDraft.addressLine1}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({
                          ...prev,
                          addressLine1: event.target.value
                        }))
                      }
                    />
                  </FormField>
                  <FormField label="Physical Address Line 2">
                    <Input
                      value={contactInfoDraft.addressLine2}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({
                          ...prev,
                          addressLine2: event.target.value
                        }))
                      }
                    />
                  </FormField>
                  <FormField label="City">
                    <Input
                      value={contactInfoDraft.city}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({ ...prev, city: event.target.value }))
                      }
                    />
                  </FormField>
                  <FormField label="State">
                    <Input
                      value={contactInfoDraft.state}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({ ...prev, state: event.target.value }))
                      }
                    />
                  </FormField>
                  <FormField label="Zip">
                    <Input
                      value={contactInfoDraft.postalCode}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({
                          ...prev,
                          postalCode: event.target.value
                        }))
                      }
                    />
                  </FormField>
                </div>
              </section>

              <section className="rounded-md border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">Mailing Address</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <FormField label="Mailing Address Line 1">
                    <Input
                      value={contactInfoDraft.mailingAddressLine1}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({
                          ...prev,
                          mailingAddressLine1: event.target.value
                        }))
                      }
                    />
                  </FormField>
                  <FormField label="Mailing Address Line 2">
                    <Input
                      value={contactInfoDraft.mailingAddressLine2}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({
                          ...prev,
                          mailingAddressLine2: event.target.value
                        }))
                      }
                    />
                  </FormField>
                  <FormField label="Mailing City">
                    <Input
                      value={contactInfoDraft.mailingCity}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({
                          ...prev,
                          mailingCity: event.target.value
                        }))
                      }
                    />
                  </FormField>
                  <FormField label="Mailing State">
                    <Input
                      value={contactInfoDraft.mailingState}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({
                          ...prev,
                          mailingState: event.target.value
                        }))
                      }
                    />
                  </FormField>
                  <FormField label="Mailing Zip">
                    <Input
                      value={contactInfoDraft.mailingPostalCode}
                      onChange={(event) =>
                        setContactInfoDraft((prev) => ({
                          ...prev,
                          mailingPostalCode: event.target.value
                        }))
                      }
                    />
                  </FormField>
                </div>
              </section>

              <section className="rounded-md border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">External Data Points</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <FormField label="GivingFuel ID">
                    <Input
                      value={contactInfoDraft.webconnexId}
                      readOnly
                      disabled
                    />
                  </FormField>
                </div>
              </section>

              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving..." : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowContactInfoModal(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {selectedItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {selectedItem.itemType}
                </p>
                <h3 className="text-lg font-semibold text-slate-900">{selectedItem.title}</h3>
              </div>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => setSelectedItem(null)}
              >
                Close
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-700">{selectedItem.summary}</p>
            <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
              <p>Created by: {selectedItem.createdBy}</p>
              <p>Created at: {formatDate(selectedItem.createdAt)}</p>
              {selectedItem.metadata.map((entry) => (
                <p key={entry.label}>
                  {entry.label}: {entry.value}
                </p>
              ))}
            </div>
            <form className="mt-4 rounded-md border border-slate-200 p-3" onSubmit={submitFollowUp}>
              <p className="mb-2 text-sm font-semibold">Add Follow-Up</p>
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={followUpType}
                  onChange={(event) => setFollowUpType(event.target.value as "task" | "note")}
                >
                  <option value="task">Create Task</option>
                  <option value="note">Create Note</option>
                </select>
                <Input
                  placeholder="Follow-up summary"
                  value={followUpBody}
                  onChange={(event) => setFollowUpBody(event.target.value)}
                />
                {followUpType === "task" ? (
                  <>
                    <select
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={followUpAssignedToUserId}
                      onChange={(event) => setFollowUpAssignedToUserId(event.target.value)}
                    >
                      <option value="">Assign staff member</option>
                      {staffUsers.map((user) => (
                        <option key={user.user_id} value={user.user_id}>
                          {user.display_name || user.user_id}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="date"
                      value={followUpSuspenseDate}
                      onChange={(event) => setFollowUpSuspenseDate(event.target.value)}
                    />
                  </>
                ) : null}
              </div>
              <Button className="mt-3" type="submit" disabled={loading}>
                Save Follow-Up
              </Button>
            </form>
          </div>
        </div>
      ) : null}
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
  children: ReactNode;
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

function LabeledValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-800">{value || "-"}</p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}
