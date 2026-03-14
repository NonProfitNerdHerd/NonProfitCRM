import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { getDonationById } from "@/lib/data/donations";
import { formatCurrency, formatDate } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function FinancialDonationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const donation = await getDonationById(id);
  if (!donation) notFound();
  const donor = Array.isArray(donation.contacts) ? donation.contacts[0] : donation.contacts;
  const campaign = Array.isArray(donation.campaigns) ? donation.campaigns[0] : donation.campaigns;

  return (
    <Card>
      <CardHeader title="Donation detail" subtitle="Transaction traceability and lineage" />
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <div>
          <p className="text-slate-500">Donor</p>
          <p>
            {donor?.first_name} {donor?.last_name}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Amount</p>
          <p>{formatCurrency(donation.amount, donation.currency)}</p>
        </div>
        <div>
          <p className="text-slate-500">Date</p>
          <p>{formatDate(donation.donation_date)}</p>
        </div>
        <div>
          <p className="text-slate-500">Status</p>
          <p>{donation.status}</p>
        </div>
        <div>
          <p className="text-slate-500">Campaign</p>
          <p>
            {campaign ? (
              <Link href={`/staff/financial/campaigns/${donation.campaign_id as string}`}>
                {campaign.name as string}
              </Link>
            ) : (
              "-"
            )}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Payment Type</p>
          <p>{(donation.payment_type as string) ?? "-"}</p>
        </div>
        <div>
          <p className="text-slate-500">Reference</p>
          <p>
            {(donation.check_number as string) ||
              (donation.transaction_id as string) ||
              (donation.external_transaction_id as string) ||
              "-"}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Source Platform</p>
          <p>{donation.source_platform ?? "-"}</p>
        </div>
        <div>
          <p className="text-slate-500">External Transaction ID</p>
          <p>{donation.external_transaction_id ?? "-"}</p>
        </div>
        <div>
          <p className="text-slate-500">Created By</p>
          <p>{(donation.created_by as string) ?? "-"}</p>
        </div>
        <div>
          <p className="text-slate-500">Entered At</p>
          <p>{formatDate(donation.created_at as string)}</p>
        </div>
      </div>
    </Card>
  );
}
