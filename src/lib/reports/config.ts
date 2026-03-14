import { type PermissionKey } from "@/types/database";

export type ReportType = "contacts" | "campaigns" | "donors" | "projects" | "memberships";

export type SortDirection = "asc" | "desc";

export type ReportColumn = {
  key: string;
  label: string;
  defaultSelected?: boolean;
  sortable?: boolean;
  dataType?: "text" | "number" | "date" | "currency";
};

export type ReportFilter = {
  key: string;
  label: string;
  type: "text" | "select" | "date" | "number";
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
};

export type ReportTypeDefinition = {
  key: ReportType;
  label: string;
  description: string;
  requiredPermission: PermissionKey;
  columns: ReportColumn[];
  filters: ReportFilter[];
  defaultSort: { field: string; direction: SortDirection };
};

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" }
];

const ACK_OPTIONS = [
  { label: "Pending", value: "Pending" },
  { label: "Sent", value: "Sent" },
  { label: "Not Required", value: "Not Required" }
];

export const REPORT_TYPE_DEFINITIONS: Record<ReportType, ReportTypeDefinition> = {
  contacts: {
    key: "contacts",
    label: "Contact Reports",
    description: "Contact records with donor and membership rollups.",
    requiredPermission: "can_view_contacts",
    defaultSort: { field: "name", direction: "asc" },
    columns: [
      { key: "name", label: "Name", defaultSelected: true, sortable: true },
      { key: "contactType", label: "Contact Type", defaultSelected: true, sortable: true },
      { key: "email", label: "Email", defaultSelected: true, sortable: true },
      { key: "phone", label: "Phone", defaultSelected: true, sortable: true },
      { key: "address", label: "Address", sortable: false },
      { key: "city", label: "City", defaultSelected: true, sortable: true },
      { key: "state", label: "State", defaultSelected: true, sortable: true },
      { key: "zip", label: "Zip", sortable: true },
      { key: "lastActivityDate", label: "Last Activity Date", dataType: "date", sortable: true },
      { key: "membershipType", label: "Membership Type", sortable: true },
      { key: "membershipStatus", label: "Membership Status", sortable: true },
      { key: "totalDonations", label: "Total Donations", dataType: "currency", sortable: true },
      { key: "numberOfDonations", label: "Number of Donations", dataType: "number", sortable: true },
      { key: "createdDate", label: "Created Date", dataType: "date", sortable: true },
      { key: "modifiedDate", label: "Modified Date", dataType: "date", sortable: true }
    ],
    filters: [
      { key: "freeText", label: "Free Text Search", type: "text", placeholder: "Name, email, phone..." },
      {
        key: "contactType",
        label: "Contact Type",
        type: "select",
        options: [
          { label: "Personal", value: "Personal" },
          { label: "Organization", value: "Organization" }
        ]
      },
      { key: "membershipType", label: "Membership Type", type: "text" },
      {
        key: "membershipStatus",
        label: "Membership Status",
        type: "select",
        options: [
          { label: "Active", value: "active" },
          { label: "Lapsed", value: "lapsed" },
          { label: "Cancelled", value: "cancelled" },
          { label: "None", value: "none" }
        ]
      },
      {
        key: "donorKind",
        label: "Donor vs Non-Donor",
        type: "select",
        options: [
          { label: "Donor", value: "donor" },
          { label: "Non-Donor", value: "non-donor" }
        ]
      },
      {
        key: "hasEmail",
        label: "Has Email",
        type: "select",
        options: [
          { label: "Has Email", value: "yes" },
          { label: "Missing Email", value: "no" }
        ]
      },
      {
        key: "hasPhone",
        label: "Has Phone",
        type: "select",
        options: [
          { label: "Has Phone", value: "yes" },
          { label: "Missing Phone", value: "no" }
        ]
      },
      { key: "lastActivityDateFrom", label: "Last Activity Date From", type: "date" },
      { key: "lastActivityDateTo", label: "Last Activity Date To", type: "date" },
      { key: "createdDateFrom", label: "Created Date From", type: "date" },
      { key: "createdDateTo", label: "Created Date To", type: "date" },
      { key: "modifiedDateFrom", label: "Modified Date From", type: "date" },
      { key: "modifiedDateTo", label: "Modified Date To", type: "date" },
      { key: "state", label: "State", type: "text" },
      { key: "city", label: "City", type: "text" },
      { key: "zip", label: "Zip", type: "text" }
    ]
  },
  campaigns: {
    key: "campaigns",
    label: "Campaign Reports",
    description: "Campaign performance, funding, and acknowledgement tracking.",
    requiredPermission: "can_view_donations",
    defaultSort: { field: "totalDonations", direction: "desc" },
    columns: [
      { key: "campaignName", label: "Campaign Name", defaultSelected: true, sortable: true },
      { key: "status", label: "Status", defaultSelected: true, sortable: true },
      { key: "startDate", label: "Start Date", dataType: "date", sortable: true },
      { key: "endDate", label: "End Date", dataType: "date", sortable: true },
      { key: "totalDonations", label: "Total Donations", dataType: "currency", defaultSelected: true, sortable: true },
      { key: "numberOfDonors", label: "Number of Donors", dataType: "number", defaultSelected: true, sortable: true },
      { key: "numberOfGifts", label: "Number of Gifts", dataType: "number", sortable: true },
      { key: "averageGift", label: "Average Gift", dataType: "currency", defaultSelected: true, sortable: true },
      { key: "pendingAcknowledgements", label: "Pending Acknowledgements", dataType: "number", defaultSelected: true, sortable: true },
      { key: "lastDonationDate", label: "Last Donation Date", dataType: "date", sortable: true }
    ],
    filters: [
      { key: "freeText", label: "Free Text Search", type: "text" },
      { key: "campaignStatus", label: "Campaign Status", type: "select", options: STATUS_OPTIONS },
      { key: "minAmount", label: "Minimum Amount", type: "number" },
      { key: "maxAmount", label: "Maximum Amount", type: "number" },
      { key: "donationDateFrom", label: "Donation Date From", type: "date" },
      { key: "donationDateTo", label: "Donation Date To", type: "date" },
      { key: "paymentType", label: "Payment Type", type: "select", options: [
        { label: "Cash", value: "Cash" },
        { label: "Check", value: "Check" },
        { label: "Card", value: "Card" }
      ] },
      { key: "acknowledgementStatus", label: "Acknowledgement Status", type: "select", options: ACK_OPTIONS },
      { key: "createdDateFrom", label: "Created Date From", type: "date" },
      { key: "createdDateTo", label: "Created Date To", type: "date" }
    ]
  },
  donors: {
    key: "donors",
    label: "Donor Reports",
    description: "Donor giving and acknowledgement metrics.",
    requiredPermission: "can_view_donations",
    defaultSort: { field: "totalGiving", direction: "desc" },
    columns: [
      { key: "donorName", label: "Donor Name", defaultSelected: true, sortable: true },
      { key: "firstGiftDate", label: "First Gift Date", dataType: "date", defaultSelected: true, sortable: true },
      { key: "lastGiftDate", label: "Last Gift Date", dataType: "date", defaultSelected: true, sortable: true },
      { key: "totalGiving", label: "Total Giving", dataType: "currency", defaultSelected: true, sortable: true },
      { key: "givingInSelectedPeriod", label: "Giving In Selected Period", dataType: "currency", defaultSelected: true, sortable: true },
      { key: "numberOfGifts", label: "Number of Gifts", dataType: "number", defaultSelected: true, sortable: true },
      { key: "largestGift", label: "Largest Gift", dataType: "currency", sortable: true },
      { key: "pendingAcknowledgements", label: "Pending Acknowledgements", dataType: "number", sortable: true },
      { key: "acknowledgementStatusSummary", label: "Acknowledgement Status Summary", sortable: false },
      { key: "address", label: "Address", sortable: true },
      { key: "mailingAddress", label: "Mailing Address", sortable: true },
      { key: "mailingCity", label: "Mailing City", sortable: true },
      { key: "mailingState", label: "Mailing State", sortable: true },
      { key: "mailingZip", label: "Mailing Zip", sortable: true },
      { key: "city", label: "City", sortable: true },
      { key: "state", label: "State", sortable: true },
      { key: "zip", label: "Zip", sortable: true }
    ],
    filters: [
      { key: "freeText", label: "Free Text Search", type: "text" },
      { key: "donationDateFrom", label: "Donation Date From", type: "date" },
      { key: "donationDateTo", label: "Donation Date To", type: "date" },
      { key: "lastGiftDateFrom", label: "Last Gift Date From", type: "date" },
      { key: "lastGiftDateTo", label: "Last Gift Date To", type: "date" },
      { key: "minTotalGiving", label: "Minimum Total Giving", type: "number" },
      { key: "maxTotalGiving", label: "Maximum Total Giving", type: "number" },
      { key: "minNumberOfGifts", label: "Minimum Number of Gifts", type: "number" },
      { key: "maxNumberOfGifts", label: "Maximum Number of Gifts", type: "number" },
      {
        key: "donorSegment",
        label: "First-Time vs Returning",
        type: "select",
        options: [
          { label: "First-Time", value: "First-Time" },
          { label: "Returning", value: "Returning" }
        ]
      },
      { key: "acknowledgementStatus", label: "Acknowledgement Status", type: "select", options: ACK_OPTIONS },
      { key: "state", label: "State", type: "text" },
      { key: "city", label: "City", type: "text" },
      { key: "zip", label: "Zip", type: "text" }
    ]
  },
  projects: {
    key: "projects",
    label: "Project Reports",
    description: "Project progress and task rollups.",
    requiredPermission: "can_view_dashboard",
    defaultSort: { field: "projectName", direction: "asc" },
    columns: [
      { key: "projectName", label: "Project Name", defaultSelected: true, sortable: true },
      { key: "projectStatus", label: "Project Status", defaultSelected: true, sortable: true },
      { key: "startDate", label: "Start Date", dataType: "date", defaultSelected: true, sortable: true },
      { key: "endDate", label: "End Date", dataType: "date", defaultSelected: true, sortable: true },
      { key: "projectManager", label: "Project Manager", defaultSelected: true, sortable: true },
      { key: "assignedStaff", label: "Assigned Staff", sortable: false },
      { key: "numberOfTasks", label: "Number of Tasks", dataType: "number", defaultSelected: true, sortable: true },
      { key: "overdueTasks", label: "Overdue Tasks", dataType: "number", defaultSelected: true, sortable: true },
      { key: "completionStatus", label: "Completion Status", sortable: true },
      { key: "createdDate", label: "Created Date", dataType: "date", sortable: true },
      { key: "modifiedDate", label: "Modified Date", dataType: "date", sortable: true }
    ],
    filters: [
      { key: "freeText", label: "Free Text Search", type: "text" },
      { key: "projectStatus", label: "Project Status", type: "text" },
      { key: "projectManager", label: "Project Manager", type: "text" },
      { key: "assignedStaff", label: "Assigned Staff", type: "text" },
      { key: "projectStartDateFrom", label: "Project Start Date From", type: "date" },
      { key: "projectStartDateTo", label: "Project Start Date To", type: "date" },
      { key: "projectEndDateFrom", label: "Project End Date From", type: "date" },
      { key: "projectEndDateTo", label: "Project End Date To", type: "date" },
      {
        key: "activeCompleted",
        label: "Active vs Completed",
        type: "select",
        options: [
          { label: "Active", value: "Active" },
          { label: "Completed", value: "Completed" }
        ]
      },
      {
        key: "taskRollupStatus",
        label: "Task Rollup / Task Status",
        type: "select",
        options: [
          { label: "On Track", value: "On Track" },
          { label: "At Risk", value: "At Risk" },
          { label: "Completed", value: "Completed" }
        ]
      }
    ]
  },
  memberships: {
    key: "memberships",
    label: "Membership Reports",
    description: "Membership lifecycle and renewal visibility.",
    requiredPermission: "can_view_member_records",
    defaultSort: { field: "memberName", direction: "asc" },
    columns: [
      { key: "memberName", label: "Member Name", defaultSelected: true, sortable: true },
      { key: "membershipType", label: "Membership Type", defaultSelected: true, sortable: true },
      { key: "membershipStatus", label: "Membership Status", defaultSelected: true, sortable: true },
      { key: "startDate", label: "Start Date", dataType: "date", defaultSelected: true, sortable: true },
      { key: "endDate", label: "End Date", dataType: "date", defaultSelected: true, sortable: true },
      { key: "renewalDate", label: "Renewal Date", dataType: "date", sortable: true },
      { key: "renewalStatus", label: "Renewal Status", defaultSelected: true, sortable: true },
      { key: "address", label: "Address", sortable: true },
      { key: "mailingAddress", label: "Mailing Address", sortable: true },
      { key: "location", label: "Location", sortable: true },
      { key: "city", label: "City", sortable: true },
      { key: "state", label: "State", sortable: true },
      { key: "mailingCity", label: "Mailing City", sortable: true },
      { key: "mailingState", label: "Mailing State", sortable: true },
      { key: "zip", label: "Zip", sortable: true },
      { key: "mailingZip", label: "Mailing Zip", sortable: true }
    ],
    filters: [
      { key: "freeText", label: "Free Text Search", type: "text" },
      { key: "membershipType", label: "Membership Type", type: "text" },
      {
        key: "membershipStatus",
        label: "Membership Status",
        type: "select",
        options: [
          { label: "Active", value: "active" },
          { label: "Lapsed", value: "lapsed" },
          { label: "Cancelled", value: "cancelled" }
        ]
      },
      { key: "startDateFrom", label: "Start Date From", type: "date" },
      { key: "startDateTo", label: "Start Date To", type: "date" },
      { key: "endDateFrom", label: "End Date From", type: "date" },
      { key: "endDateTo", label: "End Date To", type: "date" },
      { key: "expiringWithinDays", label: "Expiring Within X Days", type: "number" },
      {
        key: "renewalStatus",
        label: "Renewal Status",
        type: "select",
        options: [
          { label: "Current", value: "Current" },
          { label: "Expiring Soon", value: "Expiring Soon" },
          { label: "Expired", value: "Expired" },
          { label: "Inactive", value: "Inactive" }
        ]
      },
      { key: "state", label: "State", type: "text" },
      { key: "city", label: "City", type: "text" },
      { key: "zip", label: "Zip", type: "text" }
    ]
  }
};

export function defaultColumnsForType(reportType: ReportType) {
  const columns = REPORT_TYPE_DEFINITIONS[reportType].columns;
  const defaults = columns.filter((column) => column.defaultSelected).map((column) => column.key);
  return defaults.length > 0 ? defaults : columns.slice(0, 6).map((column) => column.key);
}
