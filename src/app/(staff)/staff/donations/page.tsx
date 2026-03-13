import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { listDonationsForStaff } from "@/lib/data/donations";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function DonationsPage() {
  const donations = await listDonationsForStaff();

  return (
    <Card>
      <CardHeader
        title="Donations / Transactions"
        subtitle="One-time and recurring gift tracking foundation"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="py-2">Date</th>
              <th className="py-2">Donor</th>
              <th className="py-2">Amount</th>
              <th className="py-2">Status</th>
              <th className="py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {donations.map((donation) => (
              <tr className="border-b border-slate-100" key={donation.id}>
                <td className="py-2">
                  <Link href={`/staff/donations/${donation.id}`}>
                    {formatDate(donation.donation_date)}
                  </Link>
                </td>
                <td className="py-2">
                  {donation.contacts?.first_name} {donation.contacts?.last_name}
                </td>
                <td className="py-2">{formatCurrency(donation.amount, donation.currency)}</td>
                <td className="py-2">{donation.status}</td>
                <td className="py-2">{donation.source ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
