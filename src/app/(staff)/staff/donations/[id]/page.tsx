import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { getDonationById } from "@/lib/data/donations";
import { formatCurrency, formatDate } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function DonationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const donation = await getDonationById(id);
  if (!donation) notFound();

  return (
    <Card>
      <CardHeader title="Donation detail" subtitle="Transaction traceability and lineage" />
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <div>
          <p className="text-slate-500">Donor</p>
          <p>
            {donation.contacts?.first_name} {donation.contacts?.last_name}
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
          <p className="text-slate-500">Source Platform</p>
          <p>{donation.source_platform ?? "-"}</p>
        </div>
        <div>
          <p className="text-slate-500">External Transaction ID</p>
          <p>{donation.external_transaction_id ?? "-"}</p>
        </div>
      </div>
    </Card>
  );
}
