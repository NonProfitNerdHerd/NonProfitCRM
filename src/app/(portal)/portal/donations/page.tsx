import { Card, CardHeader } from "@/components/ui/card";
import { listPortalDonations } from "@/lib/data/donations";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function PortalDonationsPage() {
  const donations = await listPortalDonations();

  return (
    <Card>
      <CardHeader title="My Donations" subtitle="Your personal giving history" />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="py-2">Date</th>
              <th className="py-2">Amount</th>
              <th className="py-2">Status</th>
              <th className="py-2">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {donations.map((donation) => (
              <tr className="border-b border-slate-100" key={donation.id}>
                <td className="py-2">{formatDate(donation.donation_date ?? undefined)}</td>
                <td className="py-2">{formatCurrency(donation.amount, donation.currency ?? undefined)}</td>
                <td className="py-2">{donation.status}</td>
                <td className="py-2">{donation.receipt_number ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
