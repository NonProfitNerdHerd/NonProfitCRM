import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { requireRoleKeys } from "@/lib/auth/guards";

const LINK_CARD_CLASSES =
  "block rounded-md border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:bg-brand-50";

export default async function MergeCenterPage() {
  await requireRoleKeys(["administrator", "data_steward"]);

  return (
    <Card>
      <CardHeader
        title="Merge Center"
        subtitle="Review and run merge workflows for deduplication and data quality."
      />
      <div className="grid gap-3 md:grid-cols-2">
        <Link href="/staff/admin/contacts/merge" className={LINK_CARD_CLASSES}>
          <p className="text-sm font-semibold text-slate-900">Contact Merge</p>
          <p className="text-xs text-slate-600">Find and merge duplicate contact records with audit traceability.</p>
        </Link>
      </div>
    </Card>
  );
}
