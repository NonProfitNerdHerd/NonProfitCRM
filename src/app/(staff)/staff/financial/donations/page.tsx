import { Card } from "@/components/ui/card";
import { listDonationsForStaff } from "@/lib/data/donations";
import { listCampaigns } from "@/lib/data/campaigns";
import { DonationsManagement } from "@/components/donations/donations-management";

type PageProps = {
  searchParams: Promise<{
    campaignId?: string;
    paymentType?: string;
    dateFrom?: string;
    dateTo?: string;
    donor?: string;
    tagIds?: string;
  }>;
};

export default async function FinancialDonationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [donations, campaigns] = await Promise.all([
    listDonationsForStaff({
      campaignId: params.campaignId,
      paymentType: params.paymentType,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      donorQuery: params.donor,
      tagIds: params.tagIds
        ? params.tagIds
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : []
    }),
    listCampaigns({ status: "Active" })
  ]);

  return (
    <Card>
      <DonationsManagement
        initialDonations={donations as Array<Record<string, unknown>>}
        campaigns={campaigns.map((campaign) => {
          const isChild = Boolean(campaign.is_child);
          const prefix = isChild ? "-- " : "- ";
          return {
            id: String(campaign.id),
            name: String(campaign.name),
            label: `${prefix}${String(campaign.name)}`
          };
        })}
        detailBasePath="/staff/financial/donations"
        campaignBasePath="/staff/financial/campaigns"
      />
    </Card>
  );
}
