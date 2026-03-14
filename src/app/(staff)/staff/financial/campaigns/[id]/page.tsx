import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { getCampaign } from "@/lib/data/campaigns";
import { requireStaffPermission } from "@/lib/auth/guards";
import { formatCurrency, formatDate } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function FinancialCampaignDetailPage({ params }: PageProps) {
  await requireStaffPermission("can_view_donations");
  const { id } = await params;
  const { campaign, donations, totalAmount } = await getCampaign(id);
  if (!campaign) notFound();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={campaign.name} subtitle={campaign.description ?? "No description"} />
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div>
            <p className="text-slate-500">Status</p>
            <p>{campaign.status}</p>
          </div>
          <div>
            <p className="text-slate-500">Start Date</p>
            <p>{formatDate(campaign.start_date)}</p>
          </div>
          <div>
            <p className="text-slate-500">End Date</p>
            <p>{formatDate(campaign.end_date)}</p>
          </div>
          <div>
            <p className="text-slate-500">Total Donations</p>
            <p>{formatCurrency(totalAmount)}</p>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Campaign Donations" subtitle="Donation records associated with this campaign" />
        <div className="space-y-2">
          {donations.length === 0 ? (
            <p className="text-sm text-slate-500">No donations tied to this campaign yet.</p>
          ) : (
            donations.map((donation) => {
              const donor = Array.isArray(donation.contacts)
                ? donation.contacts[0]
                : donation.contacts;
              return (
                <Link
                  key={donation.id}
                  href={`/staff/financial/donations/${donation.id}`}
                  className="block rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatCurrency(Number(donation.amount ?? 0))}
                    </p>
                    <p className="text-xs text-slate-500">{formatDate(donation.donation_date)}</p>
                  </div>
                  <p className="text-xs text-slate-600">
                    {donor?.first_name} {donor?.last_name} • {donation.payment_type}
                  </p>
                </Link>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
