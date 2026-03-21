import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { requireRoleKeys } from "@/lib/auth/guards";
import { getGivingFuelModuleStateForCurrentUser } from "@/lib/data/givingfuel-webhook";

const LINK_CARD_CLASSES =
  "block rounded-md border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:bg-brand-50";

export default async function DataToolsPage() {
  await requireRoleKeys(["administrator", "data_steward"]);
  const givingFuelState = await getGivingFuelModuleStateForCurrentUser().catch(() => ({
    allowModuleAccess: false
  }));

  return (
    <Card>
      <CardHeader
        title="Data Tools"
        subtitle="Centralized tools for imports, taxonomy management, role references, and merge workflows."
      />
      <div className="grid gap-3 md:grid-cols-2">
        <Link href="/staff/import-center" className={LINK_CARD_CLASSES}>
          <p className="text-sm font-semibold text-slate-900">Import Center</p>
          <p className="text-xs text-slate-600">Run contacts and transactions import workflows.</p>
        </Link>
        <Link href="/staff/import-center/jobs" className={LINK_CARD_CLASSES}>
          <p className="text-sm font-semibold text-slate-900">Import Jobs</p>
          <p className="text-xs text-slate-600">
            Monitor running imports, review failures, stop jobs, and retry failed rows.
          </p>
        </Link>
        <Link href="/staff/data-tools/bulk-tag-contacts" className={LINK_CARD_CLASSES}>
          <p className="text-sm font-semibold text-slate-900">Bulk Tag Contacts</p>
          <p className="text-xs text-slate-600">Preview and execute bulk tag assignment/removal jobs.</p>
        </Link>
        <Link href="/staff/admin/tags" className={LINK_CARD_CLASSES}>
          <p className="text-sm font-semibold text-slate-900">Tags</p>
          <p className="text-xs text-slate-600">Manage tag hierarchy and integration mappings.</p>
        </Link>
        <Link href="/staff/admin/roles" className={LINK_CARD_CLASSES}>
          <p className="text-sm font-semibold text-slate-900">Roles</p>
          <p className="text-xs text-slate-600">Review role hierarchy and permission matrix.</p>
        </Link>
        <Link href="/staff/admin/contacts/merge" className={LINK_CARD_CLASSES}>
          <p className="text-sm font-semibold text-slate-900">Contact Merge</p>
          <p className="text-xs text-slate-600">Merge duplicate contacts with audit traceability.</p>
        </Link>
        {givingFuelState.allowModuleAccess ? (
          <Link href="/staff/data-tools/giving-fuel" className={LINK_CARD_CLASSES}>
            <p className="text-sm font-semibold text-slate-900">Giving Fuel</p>
            <p className="text-xs text-slate-600">
              Review and approve webhook-intake donation transactions from GivingFuel.
            </p>
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
