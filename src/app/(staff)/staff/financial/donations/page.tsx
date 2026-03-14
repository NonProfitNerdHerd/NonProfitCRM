import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { listDonationsForStaff } from "@/lib/data/donations";
import { listCampaigns } from "@/lib/data/campaigns";
import { formatCurrency, formatDate } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{
    campaignId?: string;
    paymentType?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
};

export default async function FinancialDonationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [donations, campaigns] = await Promise.all([
    listDonationsForStaff({
      campaignId: params.campaignId,
      paymentType: params.paymentType,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo
    }),
    listCampaigns({ status: "All" })
  ]);

  const campaignSummary = new Map<string, { name: string; total: number }>();
  for (const donation of donations) {
    const campaign = Array.isArray(donation.campaigns)
      ? donation.campaigns[0]
      : donation.campaigns;
    const key = (donation.campaign_id as string) || "unknown";
    if (!campaignSummary.has(key)) {
      campaignSummary.set(key, { name: (campaign?.name as string) ?? "Unknown", total: 0 });
    }
    campaignSummary.get(key)!.total += Number(donation.amount ?? 0);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Donations Management" subtitle="Campaign-linked donation tracking and filters" />
        <form className="grid gap-3 md:grid-cols-5" method="get">
          <select
            name="campaignId"
            defaultValue={params.campaignId ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All Campaigns</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
          <select
            name="paymentType"
            defaultValue={params.paymentType ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All Payment Types</option>
            <option value="Cash">Cash</option>
            <option value="Check">Check</option>
            <option value="Card">Card</option>
          </select>
          <input
            name="dateFrom"
            type="date"
            defaultValue={params.dateFrom ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="dateTo"
            type="date"
            defaultValue={params.dateTo ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white" type="submit">
            Apply Filters
          </button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Donation Summary by Campaign" subtitle="Totals from filtered result set" />
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from(campaignSummary.values()).map((entry) => (
            <div key={entry.name} className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-slate-500">{entry.name}</p>
              <p className="text-lg font-semibold text-slate-900">{formatCurrency(entry.total)}</p>
            </div>
          ))}
          {campaignSummary.size === 0 ? (
            <p className="text-sm text-slate-500">No donations in current filter set.</p>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Date</th>
                <th className="py-2">Donor</th>
                <th className="py-2">Campaign</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Payment</th>
                <th className="py-2">Reference</th>
                <th className="py-2">Created By</th>
                <th className="py-2">Entered At</th>
              </tr>
            </thead>
            <tbody>
              {donations.map((donation) => {
                const donor = Array.isArray(donation.contacts)
                  ? donation.contacts[0]
                  : donation.contacts;
                const campaign = Array.isArray(donation.campaigns)
                  ? donation.campaigns[0]
                  : donation.campaigns;

                return (
                  <tr className="border-b border-slate-100" key={donation.id}>
                    <td className="py-2">
                      <Link href={`/staff/financial/donations/${donation.id}`}>
                        {formatDate(donation.donation_date)}
                      </Link>
                    </td>
                    <td className="py-2">
                      {donor?.first_name} {donor?.last_name}
                    </td>
                    <td className="py-2">
                      {campaign ? (
                        <Link href={`/staff/financial/campaigns/${donation.campaign_id as string}`}>
                          {campaign.name as string}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-2">{formatCurrency(donation.amount, donation.currency)}</td>
                    <td className="py-2">{donation.payment_type ?? "-"}</td>
                    <td className="py-2">
                      {(donation.check_number as string) || (donation.transaction_id as string) || "-"}
                    </td>
                    <td className="py-2">{(donation.created_by as string) ?? "-"}</td>
                    <td className="py-2">{formatDate(donation.created_at as string)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
