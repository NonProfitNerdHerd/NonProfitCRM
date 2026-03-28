import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";
import {
  REPORT_TYPE_DEFINITIONS,
  defaultColumnsForType,
  type ReportType,
  type SortDirection
} from "@/lib/reports/config";
import { type PermissionKey } from "@/types/database";

type ReportRow = Record<string, unknown>;
type ReportFilters = Record<string, unknown>;

type ReportSort = {
  field: string;
  direction: SortDirection;
};

type RunReportInput = {
  reportType: ReportType;
  selectedColumns: string[];
  filters?: ReportFilters;
  sort?: ReportSort;
  page?: number;
  pageSize?: number;
  recordRun?: boolean;
  exportAll?: boolean;
};

function relatedSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toDateMs(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  const normalized = raw.includes("T") ? raw : `${raw}T00:00:00Z`;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function isoDate(value: unknown) {
  const ms = toDateMs(value);
  if (!ms) return "";
  return new Date(ms).toISOString().slice(0, 10);
}

function inDateRange(value: unknown, from?: unknown, to?: unknown) {
  const valueMs = toDateMs(value);
  if (valueMs === null) return false;
  const fromMs = toDateMs(from);
  const toMs = toDateMs(to);
  if (fromMs !== null && valueMs < fromMs) return false;
  if (toMs !== null && valueMs > toMs) return false;
  return true;
}

function containsValue(value: unknown, query: unknown) {
  const search = lower(query);
  if (!search) return true;
  return lower(value).includes(search);
}

function listOfText(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => text(entry)).filter(Boolean);
  }
  const single = text(value);
  return single ? [single] : [];
}

const US_STATE_ENTRIES: Array<[string, string]> = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
  ["DC", "District of Columbia"]
];

const US_STATE_ALIAS_TO_CODE = (() => {
  const aliases = new Map<string, string>();
  for (const [code, name] of US_STATE_ENTRIES) {
    aliases.set(code.toLowerCase(), code);
    aliases.set(name.toLowerCase(), code);
  }
  return aliases;
})();

const US_STATE_CODE_TO_NAME = (() => {
  const names = new Map<string, string>();
  for (const [code, name] of US_STATE_ENTRIES) {
    names.set(code, name);
  }
  return names;
})();

function matchesStateFilter(recordValue: unknown, filterValue: unknown) {
  const filterRaw = lower(filterValue);
  if (!filterRaw) return true;
  const recordRaw = lower(recordValue);
  if (!recordRaw) return false;
  const recordCode = US_STATE_ALIAS_TO_CODE.get(recordRaw);
  const filterCode = US_STATE_ALIAS_TO_CODE.get(filterRaw);
  if (recordCode && filterCode) return recordCode === filterCode;
  if (recordCode) {
    const recordName = lower(US_STATE_CODE_TO_NAME.get(recordCode));
    if (recordName === filterRaw) return true;
  }
  if (filterCode) {
    const filterName = lower(US_STATE_CODE_TO_NAME.get(filterCode));
    if (recordRaw === filterName) return true;
  }
  return recordRaw.includes(filterRaw);
}

function hasPermission(
  orgId: string,
  permissionKey: PermissionKey,
  permissionMap: Map<PermissionKey, boolean>
) {
  if (!permissionMap.has(permissionKey)) {
    permissionMap.set(permissionKey, false);
  }
  return permissionMap.get(permissionKey) ?? false;
}

async function resolvePermissionMap(orgId: string, permissionKeys: PermissionKey[]) {
  const supabase = await createClient();
  const permissionMap = new Map<PermissionKey, boolean>();

  for (const permissionKey of permissionKeys) {
    const { data } = await supabase.rpc("has_permission", {
      org_id: orgId,
      permission_key: permissionKey
    });
    permissionMap.set(permissionKey, Boolean(data));
  }

  return permissionMap;
}

function contactDisplayName(contact: Record<string, unknown>) {
  if (text(contact.organization_name)) return text(contact.organization_name);
  if (text(contact.preferred_name)) return text(contact.preferred_name);
  const name = `${text(contact.first_name)} ${text(contact.last_name)}`.trim();
  return name || "Unnamed Contact";
}

function profileLabel(profile: Record<string, unknown> | null | undefined) {
  if (!profile) return "";
  if (text(profile.display_name)) return text(profile.display_name);
  const combined = `${text(profile.first_name)} ${text(profile.last_name)}`.trim();
  if (combined) return combined;
  return text(profile.email);
}

async function buildContactRows(orgId: string) {
  const supabase = await createClient();
  const selectColumns =
    "id, first_name, last_name, preferred_name, organization_name, email, phone, address_line_1, address_line_2, city, state, postal_code, mailing_city, mailing_state, mailing_postal_code, entity_type, tracking_status, donor_status, member_status, created_at, updated_at";
  const contactsRows: Array<Record<string, unknown>> = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const contactsPage = await supabase
      .from("contacts")
      .select(selectColumns)
      .eq("organization_id", orgId)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (contactsPage.error) throw contactsPage.error;
    const page = (contactsPage.data ?? []) as Array<Record<string, unknown>>;
    contactsRows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
    if (offset > 250000) break;
  }
  const [
    donationsResult,
    membershipsResult,
    activityResult,
    contactTagsResult,
    tasksResult,
    allocationsResult,
    campaignsResult
  ] =
    await Promise.all([
      supabase
        .from("donations")
        .select("id, contact_id, amount, donation_date")
        .eq("organization_id", orgId)
        .limit(20000),
      supabase
        .from("memberships")
        .select("contact_id, status, start_date, renewal_date, membership_types(name)")
        .eq("organization_id", orgId)
        .limit(20000),
      supabase
        .from("activity_log")
        .select("related_contact_id, created_at")
        .eq("organization_id", orgId)
        .not("related_contact_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(20000),
      supabase
        .from("contact_tags")
        .select("contact_id,tags(id,name,path)")
        .eq("organization_id", orgId)
        .limit(50000),
      supabase
        .from("tasks")
        .select("contact_id,status")
        .eq("organization_id", orgId)
        .not("contact_id", "is", null)
        .limit(50000),
      supabase
        .from("donation_allocations")
        .select("donation_id,campaign_id")
        .eq("organization_id", orgId)
        .limit(50000),
      supabase
        .from("campaigns")
        .select("id,name")
        .eq("organization_id", orgId)
        .limit(10000)
    ]);

  if (donationsResult.error) throw donationsResult.error;
  if (membershipsResult.error) throw membershipsResult.error;
  if (activityResult.error) throw activityResult.error;
  if (contactTagsResult.error) throw contactTagsResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (allocationsResult.error) throw allocationsResult.error;
  if (campaignsResult.error) throw campaignsResult.error;

  const donationRollup = new Map<string, { total: number; count: number }>();
  const donationContactById = new Map<string, string>();
  for (const donation of donationsResult.data ?? []) {
    const donationId = text(donation.id);
    const contactId = text(donation.contact_id);
    if (!contactId) continue;
    if (donationId) donationContactById.set(donationId, contactId);
    const current = donationRollup.get(contactId) ?? { total: 0, count: 0 };
    current.total += toNumber(donation.amount);
    current.count += 1;
    donationRollup.set(contactId, current);
  }

  const taskStatusesByContact = new Map<string, Set<string>>();
  for (const task of tasksResult.data ?? []) {
    const contactId = text(task.contact_id);
    const status = text(task.status);
    if (!contactId || !status) continue;
    if (!taskStatusesByContact.has(contactId)) taskStatusesByContact.set(contactId, new Set<string>());
    taskStatusesByContact.get(contactId)?.add(status);
  }

  const campaignNameById = new Map<string, string>();
  for (const campaign of campaignsResult.data ?? []) {
    const id = text(campaign.id);
    const name = text(campaign.name);
    if (!id || !name) continue;
    campaignNameById.set(id, name);
  }

  const campaignsByContact = new Map<string, Set<string>>();
  for (const allocation of allocationsResult.data ?? []) {
    const donationId = text(allocation.donation_id);
    const campaignId = text(allocation.campaign_id);
    const contactId = donationContactById.get(donationId);
    const campaignName = campaignNameById.get(campaignId);
    if (!contactId || !campaignName) continue;
    if (!campaignsByContact.has(contactId)) campaignsByContact.set(contactId, new Set<string>());
    campaignsByContact.get(contactId)?.add(campaignName);
  }

  const membershipRollup = new Map<
    string,
    { membershipType: string; membershipStatus: string; startDate: string }
  >();
  for (const membership of membershipsResult.data ?? []) {
    const contactId = text(membership.contact_id);
    if (!contactId) continue;
    const relatedType = relatedSingle<Record<string, unknown>>(membership.membership_types);
    const candidate = {
      membershipType: text(relatedType?.name),
      membershipStatus: text(membership.status),
      startDate: text(membership.start_date)
    };
    const existing = membershipRollup.get(contactId);
    if (!existing || toDateMs(candidate.startDate)! > (toDateMs(existing.startDate) ?? 0)) {
      membershipRollup.set(contactId, candidate);
    }
  }

  const lastActivity = new Map<string, string>();
  for (const activity of activityResult.data ?? []) {
    const contactId = text(activity.related_contact_id);
    if (!contactId || lastActivity.has(contactId)) continue;
    lastActivity.set(contactId, text(activity.created_at));
  }

  const tagsByContact = new Map<string, { ids: Set<string>; names: Set<string>; paths: Set<string> }>();
  for (const row of contactTagsResult.data ?? []) {
    const contactId = text(row.contact_id);
    const tag = relatedSingle<Record<string, unknown>>(row.tags);
    const tagId = text(tag?.id);
    const name = text(tag?.name);
    const path = text(tag?.path);
    if (!contactId) continue;
    if (!tagsByContact.has(contactId)) {
      tagsByContact.set(contactId, { ids: new Set<string>(), names: new Set<string>(), paths: new Set<string>() });
    }
    if (tagId) tagsByContact.get(contactId)?.ids.add(tagId);
    if (name) tagsByContact.get(contactId)?.names.add(name);
    if (path) tagsByContact.get(contactId)?.paths.add(path);
  }

  return contactsRows.map((contact) => {
    const contactId = text(contact.id);
    const donation = donationRollup.get(contactId) ?? { total: 0, count: 0 };
    const membership = membershipRollup.get(contactId);
    const address = [text(contact.address_line_1), text(contact.address_line_2)]
      .filter(Boolean)
      .join(", ");
    const lastActivityDate = lastActivity.get(contactId) ?? "";
    const trackingStatus = lower(contact.tracking_status) || "lead";
    const entityType =
      lower(contact.entity_type) === "organization"
        ? trackingStatus === "donor"
          ? "Donor Organization"
          : "Organization"
        : trackingStatus === "donor"
          ? "Donor"
          : "Contact";
    const tags = tagsByContact.get(contactId) ?? {
      ids: new Set<string>(),
      names: new Set<string>(),
      paths: new Set<string>()
    };
    const taskStatuses = Array.from(taskStatusesByContact.get(contactId) ?? []).sort((a, b) =>
      a.localeCompare(b)
    );
    const campaignList = Array.from(campaignsByContact.get(contactId) ?? []).sort((a, b) =>
      a.localeCompare(b)
    );

    return {
      id: contactId,
      name: contactDisplayName(contact),
      entityType,
      contactType: entityType,
      trackingStatus,
      email: text(contact.email),
      phone: text(contact.phone),
      address,
      city: text(contact.city),
      state: text(contact.state),
      zip: text(contact.postal_code),
      mailingCity: text(contact.mailing_city),
      mailingState: text(contact.mailing_state),
      mailingZip: text(contact.mailing_postal_code),
      lastActivityDate: isoDate(lastActivityDate),
      membershipType: membership?.membershipType ?? "",
      membershipStatus: membership?.membershipStatus ?? text(contact.member_status),
      taskStatuses: taskStatuses.join(", "),
      campaignList: campaignList.join(", "),
      tagIds: Array.from(tags.ids),
      tagList: Array.from(tags.names).sort((a, b) => a.localeCompare(b)).join(", "),
      tagPathList: Array.from(tags.paths).sort((a, b) => a.localeCompare(b)).join(" | "),
      totalDonations: donation.total,
      numberOfDonations: donation.count,
      donorKind: donation.count > 0 ? "donor" : "non-donor",
      hasEmail: text(contact.email) ? "yes" : "no",
      hasPhone: text(contact.phone) ? "yes" : "no",
      createdDate: isoDate(contact.created_at),
      modifiedDate: isoDate(contact.updated_at)
    };
  });
}

async function buildCampaignRows(orgId: string) {
  const supabase = await createClient();
  const [campaignsResult, allocationsResult, donationsResult] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, status, start_date, end_date, created_at, updated_at")
      .eq("organization_id", orgId)
      .order("name", { ascending: true })
      .limit(10000),
    supabase
      .from("donation_allocations")
      .select("campaign_id, donation_id, allocation_amount")
      .eq("organization_id", orgId)
      .limit(30000),
    supabase
      .from("donations")
      .select("id, contact_id, donation_date, payment_type, acknowledgement_status")
      .eq("organization_id", orgId)
      .limit(30000)
  ]);

  if (campaignsResult.error) throw campaignsResult.error;
  if (allocationsResult.error) throw allocationsResult.error;
  if (donationsResult.error) throw donationsResult.error;

  const donationById = new Map<string, Record<string, unknown>>();
  for (const donation of donationsResult.data ?? []) {
    donationById.set(text(donation.id), donation);
  }

  const rollup = new Map<
    string,
    {
      totalDonations: number;
      numberOfGifts: number;
      donors: Set<string>;
      pendingDonationIds: Set<string>;
      paymentTypes: Set<string>;
      lastDonationDate: string;
    }
  >();
  for (const campaign of campaignsResult.data ?? []) {
    rollup.set(text(campaign.id), {
      totalDonations: 0,
      numberOfGifts: 0,
      donors: new Set<string>(),
      pendingDonationIds: new Set<string>(),
      paymentTypes: new Set<string>(),
      lastDonationDate: ""
    });
  }

  for (const allocation of allocationsResult.data ?? []) {
    const campaignId = text(allocation.campaign_id);
    const donationId = text(allocation.donation_id);
    const donation = donationById.get(donationId);
    const stats = rollup.get(campaignId);
    if (!stats || !donation) continue;

    stats.totalDonations += toNumber(allocation.allocation_amount);
    stats.numberOfGifts += 1;
    if (text(donation.contact_id)) stats.donors.add(text(donation.contact_id));
    if (text(donation.acknowledgement_status) === "Pending") {
      stats.pendingDonationIds.add(donationId);
    }
    if (text(donation.payment_type)) stats.paymentTypes.add(text(donation.payment_type));

    const existing = toDateMs(stats.lastDonationDate) ?? 0;
    const candidate = toDateMs(donation.donation_date) ?? 0;
    if (candidate > existing) stats.lastDonationDate = text(donation.donation_date);
  }

  return (campaignsResult.data ?? []).map((campaign) => {
    const stats = rollup.get(text(campaign.id)) ?? {
      totalDonations: 0,
      numberOfGifts: 0,
      donors: new Set<string>(),
      pendingDonationIds: new Set<string>(),
      paymentTypes: new Set<string>(),
      lastDonationDate: ""
    };
    return {
      id: text(campaign.id),
      campaignName: text(campaign.name),
      status: text(campaign.status),
      startDate: isoDate(campaign.start_date),
      endDate: isoDate(campaign.end_date),
      totalDonations: stats.totalDonations,
      numberOfDonors: stats.donors.size,
      numberOfGifts: stats.numberOfGifts,
      averageGift: stats.numberOfGifts > 0 ? stats.totalDonations / stats.numberOfGifts : 0,
      pendingAcknowledgements: stats.pendingDonationIds.size,
      lastDonationDate: isoDate(stats.lastDonationDate),
      paymentTypes: Array.from(stats.paymentTypes).join(", "),
      createdDate: isoDate(campaign.created_at),
      modifiedDate: isoDate(campaign.updated_at)
    };
  });
}

async function buildDonorRows(orgId: string, filters: ReportFilters) {
  const supabase = await createClient();
  const donationsResult = await supabase
    .from("donations")
    .select("id, contact_id, amount, donation_date, payment_type, acknowledgement_status")
    .eq("organization_id", orgId)
    .not("contact_id", "is", null)
    .limit(50000);
  if (donationsResult.error) throw donationsResult.error;

  const contactIds = Array.from(
    new Set((donationsResult.data ?? []).map((row) => text(row.contact_id)).filter(Boolean))
  );
  const contactsResult = contactIds.length
    ? await supabase
        .from("contacts")
        .select(
          "id, first_name, last_name, preferred_name, organization_name, email, phone, address_line_1, address_line_2, city, state, postal_code, mailing_address_line_1, mailing_address_line_2, mailing_city, mailing_state, mailing_postal_code"
        )
        .eq("organization_id", orgId)
        .in("id", contactIds)
        .limit(20000)
    : { data: [], error: null };
  if (contactsResult.error) throw contactsResult.error;

  const contactTagsResult = contactIds.length
    ? await supabase
        .from("contact_tags")
        .select("contact_id,tags(name,path)")
        .eq("organization_id", orgId)
        .in("contact_id", contactIds)
        .limit(50000)
    : { data: [], error: null };
  if (contactTagsResult.error) throw contactTagsResult.error;

  const contactMap = new Map<string, Record<string, unknown>>();
  for (const contact of contactsResult.data ?? []) {
    contactMap.set(text(contact.id), contact);
  }

  const tagsByContact = new Map<string, Set<string>>();
  for (const row of contactTagsResult.data ?? []) {
    const contactId = text(row.contact_id);
    const tag = relatedSingle<Record<string, unknown>>(row.tags);
    const path = text(tag?.path);
    if (!contactId || !path) continue;
    if (!tagsByContact.has(contactId)) tagsByContact.set(contactId, new Set());
    tagsByContact.get(contactId)?.add(path);
  }

  const periodFrom = filters.donationDateFrom;
  const periodTo = filters.donationDateTo;

  const donorRollup = new Map<
    string,
    {
      firstGiftDate: string;
      lastGiftDate: string;
      totalGiving: number;
      givingInSelectedPeriod: number;
      numberOfGifts: number;
      largestGift: number;
      pendingAcknowledgements: number;
      sentAcknowledgements: number;
      notRequiredAcknowledgements: number;
      paymentTypes: Set<string>;
    }
  >();

  for (const donation of donationsResult.data ?? []) {
    const contactId = text(donation.contact_id);
    if (!contactId) continue;
    const amount = toNumber(donation.amount);
    const date = text(donation.donation_date);
    const ack = text(donation.acknowledgement_status);
    const current = donorRollup.get(contactId) ?? {
      firstGiftDate: "",
      lastGiftDate: "",
      totalGiving: 0,
      givingInSelectedPeriod: 0,
      numberOfGifts: 0,
      largestGift: 0,
      pendingAcknowledgements: 0,
      sentAcknowledgements: 0,
      notRequiredAcknowledgements: 0,
      paymentTypes: new Set<string>()
    };

    current.totalGiving += amount;
    current.numberOfGifts += 1;
    current.largestGift = Math.max(current.largestGift, amount);
    if (inDateRange(date, periodFrom, periodTo)) {
      current.givingInSelectedPeriod += amount;
    }
    if (!current.firstGiftDate || (toDateMs(date) ?? 0) < (toDateMs(current.firstGiftDate) ?? 0)) {
      current.firstGiftDate = date;
    }
    if (!current.lastGiftDate || (toDateMs(date) ?? 0) > (toDateMs(current.lastGiftDate) ?? 0)) {
      current.lastGiftDate = date;
    }
    if (ack === "Pending") current.pendingAcknowledgements += 1;
    else if (ack === "Sent") current.sentAcknowledgements += 1;
    else if (ack === "Not Required") current.notRequiredAcknowledgements += 1;
    if (text(donation.payment_type)) current.paymentTypes.add(text(donation.payment_type));

    donorRollup.set(contactId, current);
  }

  return Array.from(donorRollup.entries()).map(([contactId, stats]) => {
    const contact = contactMap.get(contactId) ?? {};
    const donorName = contactDisplayName(contact);
    const donorSegment = stats.numberOfGifts <= 1 ? "First-Time" : "Returning";
    const address = [text(contact.address_line_1), text(contact.address_line_2)]
      .filter(Boolean)
      .join(", ");
    const mailingAddress = [
      text(contact.mailing_address_line_1),
      text(contact.mailing_address_line_2)
    ]
      .filter(Boolean)
      .join(", ");
    return {
      id: contactId,
      donorName,
      firstGiftDate: isoDate(stats.firstGiftDate),
      lastGiftDate: isoDate(stats.lastGiftDate),
      totalGiving: stats.totalGiving,
      givingInSelectedPeriod: stats.givingInSelectedPeriod,
      numberOfGifts: stats.numberOfGifts,
      largestGift: stats.largestGift,
      pendingAcknowledgements: stats.pendingAcknowledgements,
      sentAcknowledgements: stats.sentAcknowledgements,
      notRequiredAcknowledgements: stats.notRequiredAcknowledgements,
      acknowledgementStatusSummary: `Pending: ${stats.pendingAcknowledgements} • Sent: ${stats.sentAcknowledgements} • Not Required: ${stats.notRequiredAcknowledgements}`,
      donorSegment,
      email: text(contact.email),
      phone: text(contact.phone),
      address,
      mailingAddress,
      mailingCity: text(contact.mailing_city),
      mailingState: text(contact.mailing_state),
      mailingZip: text(contact.mailing_postal_code),
      city: text(contact.city),
      state: text(contact.state),
      zip: text(contact.postal_code),
      paymentTypes: Array.from(stats.paymentTypes).join(", "),
      donorTags: Array.from(tagsByContact.get(contactId) ?? []).sort((a, b) => a.localeCompare(b)).join(" | ")
    };
  });
}

async function buildProjectRows(orgId: string) {
  const supabase = await createClient();
  const [projectsResult, tasksResult, staffResult] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, status, project_start_date, expected_end_date, project_manager_user_id, created_at, updated_at")
      .eq("organization_id", orgId)
      .order("name", { ascending: true })
      .limit(10000),
    supabase
      .from("tasks")
      .select("id, project_id, status, due_date, completed_at, assigned_to")
      .eq("organization_id", orgId)
      .not("project_id", "is", null)
      .limit(50000),
    supabase
      .from("project_staff")
      .select("project_id, user_id")
      .eq("organization_id", orgId)
      .limit(30000)
  ]);

  if (projectsResult.error) throw projectsResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (staffResult.error) throw staffResult.error;

  const profileIds = new Set<string>();
  for (const project of projectsResult.data ?? []) {
    if (text(project.project_manager_user_id)) profileIds.add(text(project.project_manager_user_id));
  }
  for (const task of tasksResult.data ?? []) {
    if (text(task.assigned_to)) profileIds.add(text(task.assigned_to));
  }
  for (const staff of staffResult.data ?? []) {
    if (text(staff.user_id)) profileIds.add(text(staff.user_id));
  }

  const profilesResult = profileIds.size
    ? await supabase
        .from("profiles")
        .select("id, display_name, first_name, last_name, email")
        .in("id", Array.from(profileIds))
    : { data: [], error: null };
  if (profilesResult.error) throw profilesResult.error;

  const profileMap = new Map<string, Record<string, unknown>>();
  for (const profile of profilesResult.data ?? []) {
    profileMap.set(text(profile.id), profile);
  }

  const taskRollup = new Map<
    string,
    { numberOfTasks: number; overdueTasks: number; completedTasks: number; assignedStaff: Set<string> }
  >();
  for (const task of tasksResult.data ?? []) {
    const projectId = text(task.project_id);
    if (!projectId) continue;
    const current = taskRollup.get(projectId) ?? {
      numberOfTasks: 0,
      overdueTasks: 0,
      completedTasks: 0,
      assignedStaff: new Set<string>()
    };
    current.numberOfTasks += 1;
    const isCompleted = text(task.status) === "completed" || Boolean(task.completed_at);
    if (isCompleted) current.completedTasks += 1;
    if (!isCompleted && toDateMs(task.due_date) !== null && (toDateMs(task.due_date) ?? 0) < Date.now()) {
      current.overdueTasks += 1;
    }
    if (text(task.assigned_to)) {
      current.assignedStaff.add(profileLabel(profileMap.get(text(task.assigned_to))) || text(task.assigned_to));
    }
    taskRollup.set(projectId, current);
  }

  for (const staff of staffResult.data ?? []) {
    const projectId = text(staff.project_id);
    if (!projectId) continue;
    const current = taskRollup.get(projectId) ?? {
      numberOfTasks: 0,
      overdueTasks: 0,
      completedTasks: 0,
      assignedStaff: new Set<string>()
    };
    if (text(staff.user_id)) {
      current.assignedStaff.add(profileLabel(profileMap.get(text(staff.user_id))) || text(staff.user_id));
    }
    taskRollup.set(projectId, current);
  }

  return (projectsResult.data ?? []).map((project) => {
    const metrics = taskRollup.get(text(project.id)) ?? {
      numberOfTasks: 0,
      overdueTasks: 0,
      completedTasks: 0,
      assignedStaff: new Set<string>()
    };
    const completionStatus =
      metrics.numberOfTasks === 0
        ? "No Tasks"
        : metrics.completedTasks === metrics.numberOfTasks
          ? "Completed"
          : metrics.overdueTasks > 0
            ? "At Risk"
            : "On Track";

    return {
      id: text(project.id),
      projectName: text(project.name),
      projectStatus: text(project.status),
      startDate: isoDate(project.project_start_date),
      endDate: isoDate(project.expected_end_date),
      projectManager:
        profileLabel(profileMap.get(text(project.project_manager_user_id))) ||
        text(project.project_manager_user_id),
      assignedStaff: Array.from(metrics.assignedStaff).join(", "),
      numberOfTasks: metrics.numberOfTasks,
      overdueTasks: metrics.overdueTasks,
      completionStatus,
      activeCompleted:
        lower(project.status).includes("complete") || completionStatus === "Completed"
          ? "Completed"
          : "Active",
      createdDate: isoDate(project.created_at),
      modifiedDate: isoDate(project.updated_at)
    };
  });
}

function membershipRenewalStatus(row: Record<string, unknown>) {
  const status = lower(row.status);
  if (status && status !== "active") return "Inactive";
  const endMs = toDateMs(row.end_date);
  if (endMs === null) return "Current";
  const now = Date.now();
  const days = Math.floor((endMs - now) / (1000 * 60 * 60 * 24));
  if (days < 0) return "Expired";
  if (days <= 30) return "Expiring Soon";
  return "Current";
}

async function buildMembershipRows(orgId: string) {
  const supabase = await createClient();
  const membershipsResult = await supabase
    .from("memberships")
    .select(
      "id, status, start_date, end_date, renewal_date, created_at, updated_at, membership_types(name), contacts(first_name,last_name,preferred_name,organization_name,address_line_1,address_line_2,city,state,postal_code,mailing_address_line_1,mailing_address_line_2,mailing_city,mailing_state,mailing_postal_code)"
    )
    .eq("organization_id", orgId)
    .limit(20000);

  if (membershipsResult.error) throw membershipsResult.error;

  return (membershipsResult.data ?? []).map((membership) => {
    const contact = relatedSingle<Record<string, unknown>>(membership.contacts) ?? {};
    const membershipType = relatedSingle<Record<string, unknown>>(membership.membership_types);
    const renewalStatus = membershipRenewalStatus(membership);
    const city = text(contact.city);
    const state = text(contact.state);
    const zip = text(contact.postal_code);
    const address = [text(contact.address_line_1), text(contact.address_line_2)]
      .filter(Boolean)
      .join(", ");
    const mailingAddress = [
      text(contact.mailing_address_line_1),
      text(contact.mailing_address_line_2)
    ]
      .filter(Boolean)
      .join(", ");
    const location = [city, state, zip].filter(Boolean).join(", ");
    const endMs = toDateMs(membership.end_date);
    const expiringInDays =
      endMs === null ? null : Math.floor((endMs - Date.now()) / (1000 * 60 * 60 * 24));

    return {
      id: text(membership.id),
      memberName: contactDisplayName(contact),
      membershipType: text(membershipType?.name),
      membershipStatus: text(membership.status),
      startDate: isoDate(membership.start_date),
      endDate: isoDate(membership.end_date),
      renewalDate: isoDate(membership.renewal_date),
      renewalStatus,
      address,
      mailingAddress,
      expiringInDays,
      location,
      city,
      state,
      mailingCity: text(contact.mailing_city),
      mailingState: text(contact.mailing_state),
      zip,
      mailingZip: text(contact.mailing_postal_code),
      createdDate: isoDate(membership.created_at),
      modifiedDate: isoDate(membership.updated_at)
    };
  });
}

async function buildRowsByType(reportType: ReportType, orgId: string, filters: ReportFilters) {
  if (reportType === "contacts") return buildContactRows(orgId);
  if (reportType === "transactions") return buildTransactionRows(orgId);
  if (reportType === "campaigns") return buildCampaignRows(orgId);
  if (reportType === "donors") return buildDonorRows(orgId, filters);
  if (reportType === "projects") return buildProjectRows(orgId);
  return buildMembershipRows(orgId);
}

function donationOrgSchemaError(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string })?.message ??
      (error as { details?: string })?.details ??
      ""
  ).toLowerCase();
  return message.includes("crm_organization_id") || message.includes("crm_organizations");
}

async function buildTransactionRows(orgId: string) {
  const supabase = await createClient();
  const fullSelect =
    "id, contact_id, amount, currency, donation_date, status, payment_type, check_number, transaction_id, external_transaction_id, source, source_platform, campaign, acknowledgement_status, acknowledgement_sent_date, memo, is_recurring, created_at, campaign_id, contacts(first_name,last_name,preferred_name,organization_name,entity_type,tracking_status,email,phone,address_line_1,address_line_2,city,state,postal_code), campaigns(name)";
  const legacySelect =
    "id, contact_id, amount, currency, donation_date, status, payment_type, check_number, transaction_id, external_transaction_id, source, source_platform, campaign, acknowledgement_status, acknowledgement_sent_date, memo, is_recurring, created_at, campaign_id, contacts(first_name,last_name,preferred_name,organization_name,entity_type,tracking_status,email,phone,address_line_1,address_line_2,city,state,postal_code)";

  const pageSize = 1000;
  const donationsAccum: Array<Record<string, unknown>> = [];
  let offset = 0;

  while (true) {
    const primaryPage = await supabase
      .from("donations")
      .select(fullSelect)
      .eq("organization_id", orgId)
      .order("donation_date", { ascending: false })
      .range(offset, offset + pageSize - 1);
    const page =
      primaryPage.error && donationOrgSchemaError(primaryPage.error)
        ? await supabase
            .from("donations")
            .select(legacySelect)
            .eq("organization_id", orgId)
            .order("donation_date", { ascending: false })
            .range(offset, offset + pageSize - 1)
        : primaryPage;
    if (page.error) throw page.error;
    const batch = (page.data ?? []) as Array<Record<string, unknown>>;
    donationsAccum.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 100000) break;
  }

  const contactIds = Array.from(
    new Set(donationsAccum.map((d) => text(d.contact_id)).filter(Boolean))
  );
  const tagsByContact = new Map<string, { names: Set<string>; ids: Set<string> }>();
  if (contactIds.length > 0) {
    const contactTagsResult = await supabase
      .from("contact_tags")
      .select("contact_id,tags(id,name,path)")
      .eq("organization_id", orgId)
      .in("contact_id", contactIds)
      .limit(100000);
    if (contactTagsResult.error) throw contactTagsResult.error;
    for (const row of contactTagsResult.data ?? []) {
      const contactId = text(row.contact_id);
      const tag = relatedSingle<Record<string, unknown>>(row.tags);
      const tagId = text(tag?.id);
      const name = text(tag?.name);
      const path = text(tag?.path);
      if (!contactId) continue;
      if (!tagsByContact.has(contactId)) {
        tagsByContact.set(contactId, { names: new Set<string>(), ids: new Set<string>() });
      }
      const bucket = tagsByContact.get(contactId)!;
      if (tagId) bucket.ids.add(tagId);
      if (path) bucket.names.add(path);
      else if (name) bucket.names.add(name);
    }
  }

  return donationsAccum.map((donation) => {
    const contact = relatedSingle<Record<string, unknown>>(donation.contacts) ?? {};
    const campaignRel = relatedSingle<Record<string, unknown>>(donation.campaigns);
    const contactId = text(donation.contact_id);
    const campaignFromRelation = text(campaignRel?.name);
    const campaignName = campaignFromRelation || text(donation.campaign) || "";
    const tags = tagsByContact.get(contactId) ?? { names: new Set<string>(), ids: new Set<string>() };
    const tagList = Array.from(tags.names).sort((a, b) => a.localeCompare(b)).join(", ");
    const tagIds = Array.from(tags.ids);
    const trackingStatus = lower(contact.tracking_status);
    const rawEntity = lower(contact.entity_type);
    const entityType =
      rawEntity === "organization"
        ? trackingStatus === "donor"
          ? "Donor Organization"
          : "Organization"
        : trackingStatus === "donor"
          ? "Donor"
          : "Contact";
    const address = [text(contact.address_line_1), text(contact.address_line_2)]
      .filter(Boolean)
      .join(", ");
    const donorName = contactId ? contactDisplayName(contact) : "No contact";
    const displayName = donorName;

    return {
      id: text(donation.id),
      contactId,
      donationDate: isoDate(donation.donation_date),
      amount: toNumber(donation.amount),
      currency: text(donation.currency) || "USD",
      donorName: displayName,
      name: displayName,
      email: text(contact.email),
      phone: text(contact.phone),
      address,
      city: text(contact.city),
      state: text(contact.state),
      zip: text(contact.postal_code),
      entityType,
      campaignName,
      paymentType: text(donation.payment_type),
      checkNumber: text(donation.check_number),
      transactionReference: text(donation.transaction_id),
      externalTransactionId: text(donation.external_transaction_id),
      donationStatus: text(donation.status),
      acknowledgementStatus: text(donation.acknowledgement_status),
      acknowledgementSentDate: isoDate(donation.acknowledgement_sent_date),
      source: text(donation.source),
      sourcePlatform: text(donation.source_platform),
      memo: text(donation.memo),
      isRecurring: Boolean(donation.is_recurring) ? "Yes" : "No",
      tagList,
      tagIds,
      createdDate: isoDate(donation.created_at)
    };
  });
}

function applyFilters(reportType: ReportType, rows: ReportRow[], filters: ReportFilters) {
  const normalized = Object.entries(filters ?? {}).filter(
    ([, value]) => value !== null && value !== undefined && text(value) !== ""
  );
  if (normalized.length === 0) return rows;

  return rows.filter((row) => {
    for (const [key, value] of normalized) {
      if (key === "freeText") {
        const haystack = Object.entries(row)
          .filter(([column]) => column !== "id")
          .map(([, item]) => text(item))
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(lower(value))) return false;
        continue;
      }

      if (key === "state" || key === "city" || key === "zip") {
        if (reportType === "contacts") {
          if (key === "city") {
            if (!containsValue(row.city, value) && !containsValue(row.mailingCity, value)) return false;
          } else if (key === "state") {
            if (!matchesStateFilter(row.state, value) && !matchesStateFilter(row.mailingState, value)) {
              return false;
            }
          } else if (!containsValue(row.zip, value) && !containsValue(row.mailingZip, value)) {
            return false;
          }
        } else if (!containsValue(row[key], value)) {
          return false;
        }
        continue;
      }

      if (key === "createdDateFrom") {
        if (!inDateRange(row.createdDate, value, undefined)) return false;
        continue;
      }
      if (key === "createdDateTo") {
        if (!inDateRange(row.createdDate, undefined, value)) return false;
        continue;
      }
      if (key === "modifiedDateFrom") {
        if (!inDateRange(row.modifiedDate, value, undefined)) return false;
        continue;
      }
      if (key === "modifiedDateTo") {
        if (!inDateRange(row.modifiedDate, undefined, value)) return false;
        continue;
      }

      if (reportType === "contacts") {
        if (key === "entityType") {
          const selected = listOfText(value);
          const normalizedRowEntityType = lower(row.entityType);
          if (
            selected.length > 0 &&
            !selected.some((entry) => {
              const normalizedEntry = lower(entry);
              if (normalizedEntry === "person") {
                return normalizedRowEntityType === "donor" || normalizedRowEntityType === "contact";
              }
              if (normalizedEntry === "organization") {
                return (
                  normalizedRowEntityType === "organization" ||
                  normalizedRowEntityType === "donor organization"
                );
              }
              return normalizedEntry === normalizedRowEntityType;
            })
          ) {
            return false;
          }
        }
        if (key === "contactType") {
          const normalizedValue = lower(value);
          const normalizedRowEntityType = lower(row.entityType);
          if (normalizedValue === "person") {
            if (!(normalizedRowEntityType === "donor" || normalizedRowEntityType === "contact")) return false;
          } else if (normalizedValue === "organization") {
            if (
              !(normalizedRowEntityType === "organization" || normalizedRowEntityType === "donor organization")
            ) {
              return false;
            }
          } else if (normalizedValue && normalizedValue !== normalizedRowEntityType) {
            return false;
          }
        }
        if (key === "membershipType" && !containsValue(row.membershipType, value)) return false;
        if (key === "membershipStatus") {
          const selected = listOfText(value);
          if (
            selected.length > 0 &&
            !selected.some((entry) => lower(entry) === lower(row.membershipStatus))
          ) {
            return false;
          }
        }
        if (key === "trackingStatus") {
          const selected = listOfText(value);
          if (
            selected.length > 0 &&
            !selected.some((entry) => lower(entry) === lower(row.trackingStatus))
          ) {
            return false;
          }
        }
        if (key === "donorKind" && lower(row.donorKind) !== lower(value)) return false;
        if (key === "hasEmail" && lower(row.hasEmail) !== lower(value)) return false;
        if (key === "hasPhone" && lower(row.hasPhone) !== lower(value)) return false;
        if (key === "tagContains" && !containsValue(row.tagList, value)) return false;
        if (key === "tagIds") {
          const selectedTagIds = Array.isArray(value)
            ? value.map((entry) => text(entry)).filter(Boolean)
            : [text(value)].filter(Boolean);
          if (selectedTagIds.length > 0) {
            const rowTagIds = Array.isArray(row.tagIds)
              ? (row.tagIds as unknown[]).map((entry) => text(entry)).filter(Boolean)
              : [];
            if (!selectedTagIds.every((selectedTagId) => rowTagIds.includes(selectedTagId))) return false;
          }
        }
        if (key === "taskStatus") {
          const selected = listOfText(value).map((entry) => lower(entry));
          if (selected.length > 0) {
            const rowTaskStatuses = text(row.taskStatuses)
              .split(",")
              .map((entry) => lower(entry))
              .map((entry) => entry.trim())
              .filter(Boolean);
            if (!selected.some((entry) => rowTaskStatuses.includes(entry))) return false;
          }
        }
        if (key === "campaignContains" && !containsValue(row.campaignList, value)) return false;
        if (key === "tagPathContains" && !containsValue(row.tagPathList, value)) return false;
        if (key === "lastActivityDateFrom" && !inDateRange(row.lastActivityDate, value, undefined)) return false;
        if (key === "lastActivityDateTo" && !inDateRange(row.lastActivityDate, undefined, value)) return false;
      }

      if (reportType === "campaigns") {
        if (key === "campaignStatus" && lower(row.status) !== lower(value)) return false;
        if (key === "minAmount" && toNumber(row.totalDonations) < toNumber(value)) return false;
        if (key === "maxAmount" && toNumber(row.totalDonations) > toNumber(value)) return false;
        if (key === "donationDateFrom" && !inDateRange(row.lastDonationDate, value, undefined)) return false;
        if (key === "donationDateTo" && !inDateRange(row.lastDonationDate, undefined, value)) return false;
        if (key === "paymentType" && !containsValue(row.paymentTypes, value)) return false;
        if (key === "acknowledgementStatus") {
          if (text(value) === "Pending" && toNumber(row.pendingAcknowledgements) <= 0) return false;
          if (text(value) === "Sent" && toNumber(row.pendingAcknowledgements) > 0) return false;
        }
      }

      if (reportType === "donors") {
        if (key === "donationDateFrom" || key === "donationDateTo") continue;
        if (key === "lastGiftDateFrom" && !inDateRange(row.lastGiftDate, value, undefined)) return false;
        if (key === "lastGiftDateTo" && !inDateRange(row.lastGiftDate, undefined, value)) return false;
        if (key === "minTotalGiving" && toNumber(row.totalGiving) < toNumber(value)) return false;
        if (key === "maxTotalGiving" && toNumber(row.totalGiving) > toNumber(value)) return false;
        if (key === "minNumberOfGifts" && toNumber(row.numberOfGifts) < toNumber(value)) return false;
        if (key === "maxNumberOfGifts" && toNumber(row.numberOfGifts) > toNumber(value)) return false;
        if (key === "donorSegment" && text(row.donorSegment) !== text(value)) return false;
        if (key === "donorTagContains" && !containsValue(row.donorTags, value)) return false;
        if (key === "acknowledgementStatus") {
          if (text(value) === "Pending" && toNumber(row.pendingAcknowledgements) <= 0) return false;
          if (text(value) === "Sent" && toNumber(row.sentAcknowledgements) <= 0) return false;
          if (text(value) === "Not Required" && toNumber(row.notRequiredAcknowledgements) <= 0) return false;
        }
      }

      if (reportType === "projects") {
        if (key === "projectStatus" && !containsValue(row.projectStatus, value)) return false;
        if (key === "projectManager" && !containsValue(row.projectManager, value)) return false;
        if (key === "assignedStaff" && !containsValue(row.assignedStaff, value)) return false;
        if (key === "projectStartDateFrom" && !inDateRange(row.startDate, value, undefined)) return false;
        if (key === "projectStartDateTo" && !inDateRange(row.startDate, undefined, value)) return false;
        if (key === "projectEndDateFrom" && !inDateRange(row.endDate, value, undefined)) return false;
        if (key === "projectEndDateTo" && !inDateRange(row.endDate, undefined, value)) return false;
        if (key === "activeCompleted" && text(row.activeCompleted) !== text(value)) return false;
        if (key === "taskRollupStatus" && text(row.completionStatus) !== text(value)) return false;
      }

      if (reportType === "memberships") {
        if (key === "membershipType" && !containsValue(row.membershipType, value)) return false;
        if (key === "membershipStatus" && lower(row.membershipStatus) !== lower(value)) return false;
        if (key === "startDateFrom" && !inDateRange(row.startDate, value, undefined)) return false;
        if (key === "startDateTo" && !inDateRange(row.startDate, undefined, value)) return false;
        if (key === "endDateFrom" && !inDateRange(row.endDate, value, undefined)) return false;
        if (key === "endDateTo" && !inDateRange(row.endDate, undefined, value)) return false;
        if (key === "expiringWithinDays" && toNumber(row.expiringInDays) > toNumber(value)) return false;
        if (key === "renewalStatus" && text(row.renewalStatus) !== text(value)) return false;
      }

      if (reportType === "transactions") {
        if (key === "donationDateFrom" && !inDateRange(row.donationDate, value, undefined)) return false;
        if (key === "donationDateTo" && !inDateRange(row.donationDate, undefined, value)) return false;
        if (key === "minAmount" && toNumber(row.amount) < toNumber(value)) return false;
        if (key === "maxAmount" && toNumber(row.amount) > toNumber(value)) return false;
        if (key === "paymentType") {
          const selected = listOfText(value);
          if (selected.length > 0 && !selected.some((entry) => lower(entry) === lower(row.paymentType))) {
            return false;
          }
        }
        if (key === "acknowledgementStatus") {
          const selected = listOfText(value);
          if (
            selected.length > 0 &&
            !selected.some((entry) => lower(entry) === lower(row.acknowledgementStatus))
          ) {
            return false;
          }
        }
        if (key === "campaignContains" && !containsValue(row.campaignName, value)) return false;
        if (key === "donorNameContains" && !containsValue(row.donorName, value)) return false;
        if (key === "tagContains" && !containsValue(row.tagList, value)) return false;
        if (key === "tagIds") {
          const selectedTagIds = Array.isArray(value)
            ? value.map((entry) => text(entry)).filter(Boolean)
            : [text(value)].filter(Boolean);
          if (selectedTagIds.length > 0) {
            const rowTagIds = Array.isArray(row.tagIds)
              ? (row.tagIds as unknown[]).map((entry) => text(entry)).filter(Boolean)
              : [];
            if (!selectedTagIds.every((selectedTagId) => rowTagIds.includes(selectedTagId))) return false;
          }
        }
        if (key === "entityType") {
          const selected = listOfText(value);
          const normalizedRowEntityType = lower(row.entityType);
          if (
            selected.length > 0 &&
            !selected.some((entry) => {
              const normalizedEntry = lower(entry);
              if (normalizedEntry === "person") {
                return normalizedRowEntityType === "donor" || normalizedRowEntityType === "contact";
              }
              if (normalizedEntry === "organization") {
                return (
                  normalizedRowEntityType === "organization" ||
                  normalizedRowEntityType === "donor organization"
                );
              }
              return normalizedEntry === normalizedRowEntityType;
            })
          ) {
            return false;
          }
        }
      }
    }
    return true;
  });
}

function sortRows(rows: ReportRow[], sort: ReportSort | undefined, defaultSort: ReportSort) {
  const appliedSort = sort?.field ? sort : defaultSort;
  return [...rows].sort((left, right) => {
    const leftValue = left[appliedSort.field];
    const rightValue = right[appliedSort.field];

    const leftDate = toDateMs(leftValue);
    const rightDate = toDateMs(rightValue);
    let comparison = 0;
    if (leftDate !== null && rightDate !== null) {
      comparison = leftDate - rightDate;
    } else if (typeof leftValue === "number" || typeof rightValue === "number") {
      comparison = toNumber(leftValue) - toNumber(rightValue);
    } else {
      comparison = text(leftValue).localeCompare(text(rightValue), undefined, { sensitivity: "base" });
    }

    return appliedSort.direction === "asc" ? comparison : -comparison;
  });
}

function selectColumns(rows: ReportRow[], selectedColumns: string[]) {
  return rows.map((row) => {
    const projected: Record<string, unknown> = {};
    for (const column of selectedColumns) {
      projected[column] = row[column] ?? "";
    }
    return projected;
  });
}

function chunk<T>(items: T[], size: number) {
  if (size <= 0) return [items];
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

async function assertReportTypeAccess(reportType: ReportType, orgId: string) {
  const requiredPermission = REPORT_TYPE_DEFINITIONS[reportType].requiredPermission;
  const permissionMap = await resolvePermissionMap(orgId, [requiredPermission]);
  if (!hasPermission(orgId, requiredPermission, permissionMap)) {
    throw new Error("You are not authorized to run this report type.");
  }
}

export async function getReportBuilderMetadata(activeReportType?: ReportType) {
  const context = await requireStaffPermission("can_run_reports");
  const permissionKeys: PermissionKey[] = [
    "can_view_contacts",
    "can_view_donations",
    "can_view_dashboard",
    "can_view_member_records",
    "can_build_reports",
    "can_export_csv",
    "can_export_excel"
  ];
  const permissionMap = await resolvePermissionMap(context.organizationId, permissionKeys);

  const availableReportTypes = (Object.values(REPORT_TYPE_DEFINITIONS) as Array<
    (typeof REPORT_TYPE_DEFINITIONS)[ReportType]
  >)
    .filter((definition) => hasPermission(context.organizationId, definition.requiredPermission, permissionMap))
    .map((definition) => ({
      key: definition.key,
      label: definition.label,
      description: definition.description
    }));

  const fallbackReportType = (availableReportTypes[0]?.key ?? "contacts") as ReportType;
  if (
    activeReportType &&
    !availableReportTypes.some((type) => type.key === activeReportType)
  ) {
    throw new Error("You are not authorized to use this report type.");
  }
  const reportType = (activeReportType ?? fallbackReportType) as ReportType;
  const definition = REPORT_TYPE_DEFINITIONS[reportType];

  return {
    availableReportTypes,
    activeDefinition: {
      ...definition,
      defaultColumns: defaultColumnsForType(reportType)
    },
    capabilities: {
      canBuildReports: hasPermission(context.organizationId, "can_build_reports", permissionMap),
      canExportCsv: hasPermission(context.organizationId, "can_export_csv", permissionMap),
      canExportExcel: hasPermission(context.organizationId, "can_export_excel", permissionMap)
    }
  };
}

export async function runReport(input: RunReportInput) {
  const context = await requireStaffPermission("can_run_reports");
  await assertReportTypeAccess(input.reportType, context.organizationId);

  const definition = REPORT_TYPE_DEFINITIONS[input.reportType];
  const allowedColumns = new Set(definition.columns.map((column) => column.key));
  const selectedColumns =
    input.selectedColumns.filter((column) => allowedColumns.has(column)).length > 0
      ? input.selectedColumns.filter((column) => allowedColumns.has(column))
      : defaultColumnsForType(input.reportType);

  const rawRows = await buildRowsByType(input.reportType, context.organizationId, input.filters ?? {});
  const filteredRows = applyFilters(input.reportType, rawRows, input.filters ?? {});
  const sortedRows = sortRows(filteredRows, input.sort, definition.defaultSort);

  const requestedPageSize = Number(input.pageSize);
  const requestedPage = Number(input.page);
  const pageSize = Math.min(
    Math.max(
      Number.isFinite(requestedPageSize) && requestedPageSize > 0
        ? Math.floor(requestedPageSize)
        : 25,
      1
    ),
    200
  );
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
  const totalCount = sortedRows.length;
  const pagedRows = input.exportAll
    ? sortedRows
    : sortedRows.slice((page - 1) * pageSize, page * pageSize);
  const projectedRows = selectColumns(pagedRows, selectedColumns);

  if (input.recordRun !== false) {
    const supabase = await createClient();
    await supabase.from("report_runs").insert({
      organization_id: context.organizationId,
      domain_key: input.reportType,
      executed_by: context.userId,
      export_format: null,
      row_count: totalCount,
      included_pii: false,
      execution_metadata: {
        selected_columns: selectedColumns,
        filters: input.filters ?? {},
        sort: input.sort ?? definition.defaultSort,
        page,
        page_size: pageSize
      }
    });
  }

  return {
    reportType: input.reportType,
    selectedColumns,
    rows: projectedRows,
    totalCount,
    page,
    pageSize,
    pageCount: input.exportAll ? 1 : Math.max(1, Math.ceil(totalCount / pageSize))
  };
}

export async function getConstituentActivitiesReport(input: { filters?: ReportFilters }) {
  const context = await requireStaffPermission("can_run_reports");
  await assertReportTypeAccess("contacts", context.organizationId);

  const filters = input.filters ?? {};
  const contactRows = applyFilters(
    "contacts",
    await buildRowsByType("contacts", context.organizationId, filters),
    filters
  );
  const contactIds = contactRows.map((row) => text(row.id)).filter(Boolean);
  if (contactIds.length === 0) return [] as Array<Record<string, unknown>>;

  const supabase = await createClient();
  const activitiesByContact = new Map<string, Array<{ createdAt: string; summary: string; actionType: string }>>();
  const contactIdChunks = chunk(contactIds, 250);
  for (const contactIdChunk of contactIdChunks) {
    const { data, error } = await supabase
      .from("activity_log")
      .select("related_contact_id,action_type,action_summary,created_at")
      .eq("organization_id", context.organizationId)
      .in("related_contact_id", contactIdChunk)
      .order("created_at", { ascending: false })
      .limit(20000);
    if (error) throw error;
    for (const row of data ?? []) {
      const relatedContactId = text(row.related_contact_id);
      if (!relatedContactId) continue;
      if (!activitiesByContact.has(relatedContactId)) activitiesByContact.set(relatedContactId, []);
      activitiesByContact.get(relatedContactId)?.push({
        createdAt: text(row.created_at),
        summary: text(row.action_summary),
        actionType: text(row.action_type)
      });
    }
  }

  return contactRows.map((row) => {
    const contactId = text(row.id);
    const address = [text(row.address), text(row.city), text(row.state), text(row.zip)]
      .filter(Boolean)
      .join(", ");
    return {
      id: contactId,
      name: text(row.name),
      phone: text(row.phone),
      email: text(row.email),
      address,
      activities: activitiesByContact.get(contactId) ?? []
    };
  });
}

export async function exportReport(input: {
  reportType: ReportType;
  selectedColumns: string[];
  filters?: ReportFilters;
  sort?: ReportSort;
  format: "csv" | "excel";
  executionMetadata?: Record<string, unknown>;
}) {
  const context = await requireStaffPermission(
    input.format === "csv" ? "can_export_csv" : "can_export_excel"
  );

  const reportResult = await runReport({
    reportType: input.reportType,
    selectedColumns: input.selectedColumns,
    filters: input.filters,
    sort: input.sort,
    exportAll: true,
    recordRun: false
  });

  const supabase = await createClient();
  await supabase.from("report_runs").insert({
    organization_id: context.organizationId,
    domain_key: input.reportType,
    executed_by: context.userId,
    export_format: input.format,
    row_count: reportResult.totalCount,
    included_pii: false,
    execution_metadata: {
      selected_columns: reportResult.selectedColumns,
      filters: input.filters ?? {},
      sort: input.sort ?? null,
      export_format: input.format,
      ...(input.executionMetadata ?? {})
    }
  });

  if (input.format === "csv") {
    const headers = reportResult.selectedColumns;
    const csvRows = [
      headers.join(","),
      ...reportResult.rows.map((row) =>
        headers
          .map((header) => JSON.stringify(text((row as Record<string, unknown>)[header])))
          .join(",")
      )
    ];
    return {
      fileName: `${input.reportType}-report.csv`,
      contentType: "text/csv",
      data: csvRows.join("\n")
    };
  }

  const sheet = XLSX.utils.json_to_sheet(reportResult.rows as object[]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Report");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return {
    fileName: `${input.reportType}-report.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data: buffer
  };
}

export async function getContactTagRollupSummary() {
  const context = await requireStaffPermission("can_run_reports");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("contact_tag_rollup_counts", {
    org_id: context.organizationId
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    tagId: text(row.tag_id),
    tagName: text(row.tag_name),
    tagPath: text(row.tag_path),
    level: toNumber(row.level),
    directContactCount: toNumber(row.direct_contact_count),
    rollupContactCount: toNumber(row.rollup_contact_count)
  }));
}

export async function listSavedReports(reportType?: ReportType) {
  const context = await requireStaffPermission("can_run_reports");
  const supabase = await createClient();
  let query = supabase
    .from("saved_reports")
    .select(
      "id, name, description, domain_key, selected_fields, filters, sort_config, created_by, created_at, updated_at"
    )
    .eq("organization_id", context.organizationId)
    .eq("created_by", context.userId)
    .order("updated_at", { ascending: false });
  if (reportType) {
    query = query.eq("domain_key", reportType);
  }
  const { data, error } = await query;
  if (error) throw error;
  const userIds = Array.from(
    new Set((data ?? []).map((row) => text(row.created_by)).filter(Boolean))
  );
  const profilesResult = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, first_name, last_name, email")
        .in("id", userIds)
    : { data: [], error: null };
  if (profilesResult.error) throw profilesResult.error;
  const profileMap = new Map<string, Record<string, unknown>>();
  for (const profile of profilesResult.data ?? []) {
    profileMap.set(text(profile.id), profile);
  }
  return (data ?? []).map((row) => ({
    id: text(row.id),
    name: text(row.name),
    description: text(row.description),
    reportType: text(row.domain_key) as ReportType,
    selectedColumns: (row.selected_fields as string[]) ?? [],
    filters: (row.filters as ReportFilters) ?? {},
    sort: (row.sort_config as ReportSort) ?? null,
    createdByUserId: text(row.created_by),
    createdBy:
      profileLabel(profileMap.get(text(row.created_by))) || text(row.created_by) || "Unknown",
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at)
  }));
}

export async function getSavedReport(savedReportId: string) {
  const context = await requireStaffPermission("can_run_reports");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_reports")
    .select("id, name, description, domain_key, selected_fields, filters, sort_config, created_at, updated_at")
    .eq("organization_id", context.organizationId)
    .eq("created_by", context.userId)
    .eq("id", savedReportId)
    .single();
  if (error) throw error;
  return {
    id: text(data.id),
    name: text(data.name),
    description: text(data.description),
    reportType: text(data.domain_key) as ReportType,
    selectedColumns: (data.selected_fields as string[]) ?? [],
    filters: (data.filters as ReportFilters) ?? {},
    sort: (data.sort_config as ReportSort) ?? null,
    createdAt: text(data.created_at),
    updatedAt: text(data.updated_at)
  };
}

export async function saveReportDefinition(input: {
  id?: string;
  saveAsNew?: boolean;
  name: string;
  description?: string;
  reportType: ReportType;
  selectedColumns: string[];
  filters?: ReportFilters;
  sort?: ReportSort | null;
}) {
  const context = await requireStaffPermission("can_build_reports");
  await assertReportTypeAccess(input.reportType, context.organizationId);
  const supabase = await createClient();

  const payload = {
    organization_id: context.organizationId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    domain_key: input.reportType,
    selected_fields: input.selectedColumns,
    filters: input.filters ?? {},
    sort_config: input.sort ?? {},
    created_by: context.userId
  };

  if (input.id && !input.saveAsNew) {
    const { data, error } = await supabase
      .from("saved_reports")
      .update(payload)
      .eq("organization_id", context.organizationId)
      .eq("created_by", context.userId)
      .eq("id", input.id)
      .select("id")
      .single();
    if (error) throw error;
    return text(data.id);
  }

  const { data, error } = await supabase
    .from("saved_reports")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return text(data.id);
}

export async function renameSavedReport(savedReportId: string, name: string) {
  const context = await requireStaffPermission("can_build_reports");
  const supabase = await createClient();
  const { error } = await supabase
    .from("saved_reports")
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq("organization_id", context.organizationId)
    .eq("created_by", context.userId)
    .eq("id", savedReportId);
  if (error) throw error;
}

export async function deleteSavedReport(savedReportId: string) {
  const context = await requireStaffPermission("can_build_reports");
  const supabase = await createClient();
  const { error } = await supabase
    .from("saved_reports")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("created_by", context.userId)
    .eq("id", savedReportId);
  if (error) throw error;
}

export async function runSavedReport(savedReportId: string, page?: number, pageSize?: number) {
  const saved = await getSavedReport(savedReportId);
  return runReport({
    reportType: saved.reportType,
    selectedColumns: saved.selectedColumns,
    filters: saved.filters,
    sort: saved.sort ?? undefined,
    page,
    pageSize
  });
}

type ReportHistoryMode = "constituent" | "transaction" | "project";

function deriveHistoryMode(domainKey: string, executionMetadata: Record<string, unknown>): ReportHistoryMode {
  const metadataMode = lower(executionMetadata.report_mode);
  if (metadataMode === "project") return "project";
  if (metadataMode === "transaction") return "transaction";
  if (metadataMode === "constituent") return "constituent";
  if (lower(domainKey) === "projects") return "project";
  if (lower(domainKey) === "contacts") return "constituent";
  if (lower(domainKey) === "transactions") return "transaction";
  return "transaction";
}

function summarizeFilters(filters: Record<string, unknown>) {
  const entries = Object.entries(filters).filter(([, value]) => {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    return text(value) !== "";
  });
  if (entries.length === 0) return "No filters";
  return entries
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: ${value.map((item) => text(item)).filter(Boolean).join(", ")}`;
      }
      return `${key}: ${text(value)}`;
    })
    .join(" | ");
}

function isReportType(value: string): value is ReportType {
  return Object.prototype.hasOwnProperty.call(REPORT_TYPE_DEFINITIONS, value);
}

export async function registerPdfReportRun(input: {
  reportType: ReportType;
  outputKey: string;
  outputLabel: string;
  fileName: string;
  fileDataUrl: string;
  rowCount: number;
  selectedColumns: string[];
  filters?: ReportFilters;
  reportMode?: string;
}) {
  const context = await requireStaffPermission("can_run_reports");
  await assertReportTypeAccess(input.reportType, context.organizationId);
  if (!text(input.fileDataUrl).startsWith("data:")) {
    throw new Error("Generated PDF payload is invalid.");
  }
  const supabase = await createClient();
  const { error } = await supabase.from("report_runs").insert({
    organization_id: context.organizationId,
    domain_key: input.reportType,
    executed_by: context.userId,
    export_format: "pdf",
    row_count: Math.max(0, Math.floor(Number(input.rowCount) || 0)),
    included_pii: false,
    execution_metadata: {
      workflow:
        input.reportType === "transactions" ? "transaction_report_builder" : "constituent_report_builder",
      report_mode: text(input.reportMode || (input.reportType === "transactions" ? "transaction" : "constituent")),
      selected_columns: input.selectedColumns ?? [],
      filters: input.filters ?? {},
      output_key: text(input.outputKey),
      output_label: text(input.outputLabel),
      file_name: text(input.fileName),
      file_data_url: input.fileDataUrl
    }
  });
  if (error) throw error;
}

export async function listRecentReportHistory(input?: {
  reportMode?: ReportHistoryMode | "";
  outputType?: "csv" | "excel" | "pdf" | "";
}) {
  const context = await requireStaffPermission("can_run_reports");
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from("report_runs")
    .select("id,domain_key,export_format,row_count,executed_by,execution_metadata,created_at")
    .eq("organization_id", context.organizationId)
    .not("export_format", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (input?.outputType) {
    query = query.eq("export_format", input.outputType);
  }
  const { data, error } = await query;
  if (error) throw error;
  const userIds = Array.from(new Set((data ?? []).map((row) => text(row.executed_by)).filter(Boolean)));
  const profilesResult = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, first_name, last_name, email")
        .in("id", userIds)
    : { data: [], error: null };
  if (profilesResult.error) throw profilesResult.error;
  const profileMap = new Map<string, Record<string, unknown>>();
  for (const profile of profilesResult.data ?? []) {
    profileMap.set(text(profile.id), profile);
  }
  const rows = (data ?? []).map((row) => {
    const executionMetadata =
      row.execution_metadata && typeof row.execution_metadata === "object"
        ? (row.execution_metadata as Record<string, unknown>)
        : {};
    const reportMode = deriveHistoryMode(text(row.domain_key), executionMetadata);
    const filters =
      executionMetadata.filters && typeof executionMetadata.filters === "object"
        ? (executionMetadata.filters as Record<string, unknown>)
        : {};
    const outputType = text(row.export_format || "unknown").toUpperCase();
    const reportLabel = text(executionMetadata.output_label) || text(row.domain_key) || "Report";
    return {
      id: text(row.id),
      reportMode,
      reportName: reportLabel,
      filterCriteria: summarizeFilters(filters),
      outputType,
      builtBy:
        profileLabel(profileMap.get(text(row.executed_by))) || text(row.executed_by) || "Unknown",
      generatedAt: text(row.created_at),
      rowCount: toNumber(row.row_count),
      downloadHref: `/api/reports/history/${text(row.id)}/download`
    };
  });
  return input?.reportMode ? rows.filter((row) => row.reportMode === input.reportMode) : rows;
}

export async function downloadReportRunById(reportRunId: string) {
  const context = await requireStaffPermission("can_run_reports");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_runs")
    .select("id,domain_key,export_format,execution_metadata,row_count")
    .eq("organization_id", context.organizationId)
    .eq("id", reportRunId)
    .single();
  if (error) throw error;
  const metadata =
    data.execution_metadata && typeof data.execution_metadata === "object"
      ? (data.execution_metadata as Record<string, unknown>)
      : {};
  const reportTypeRaw = text(data.domain_key);
  if (!isReportType(reportTypeRaw)) {
    throw new Error("Stored report type is no longer supported.");
  }
  const exportFormat = lower(data.export_format);
  if (exportFormat === "pdf") {
    const dataUrl = text(metadata.file_data_url);
    const fileName = text(metadata.file_name) || `${reportTypeRaw}-report.pdf`;
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error("Stored PDF artifact is unavailable.");
    }
    const contentType = match[1] || "application/pdf";
    const binary = Buffer.from(match[2], "base64");
    return { fileName, contentType, data: binary };
  }
  if (exportFormat !== "csv" && exportFormat !== "excel") {
    throw new Error("Stored report format is unsupported.");
  }
  const selectedColumns = Array.isArray(metadata.selected_columns)
    ? metadata.selected_columns.map((entry) => text(entry)).filter(Boolean)
    : defaultColumnsForType(reportTypeRaw);
  const filters =
    metadata.filters && typeof metadata.filters === "object"
      ? (metadata.filters as ReportFilters)
      : {};
  const sort =
    metadata.sort && typeof metadata.sort === "object"
      ? (metadata.sort as ReportSort)
      : undefined;
  const reportResult = await runReport({
    reportType: reportTypeRaw,
    selectedColumns,
    filters,
    sort,
    exportAll: true,
    recordRun: false
  });
  if (exportFormat === "csv") {
    const headers = reportResult.selectedColumns;
    const csvRows = [
      headers.join(","),
      ...reportResult.rows.map((row) =>
        headers
          .map((header) => JSON.stringify(text((row as Record<string, unknown>)[header])))
          .join(",")
      )
    ];
    return {
      fileName: text(metadata.file_name) || `${reportTypeRaw}-report.csv`,
      contentType: "text/csv",
      data: csvRows.join("\n")
    };
  }
  const sheet = XLSX.utils.json_to_sheet(reportResult.rows as object[]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Report");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return {
    fileName: text(metadata.file_name) || `${reportTypeRaw}-report.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data: buffer
  };
}
