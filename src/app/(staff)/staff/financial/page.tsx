import { Card, CardHeader } from "@/components/ui/card";
import { requireStaffPermission } from "@/lib/auth/guards";
import { getFinancialAnalytics } from "@/lib/data/analytics";
import { FinancialAnalyticsDashboard } from "@/components/financial/financial-analytics-dashboard";

export default async function FinancialPage() {
  await requireStaffPermission("can_view_donations");
  const analytics = await getFinancialAnalytics("30d", { recentTransactionsLimit: 10 });

  return (
    <Card>
      <CardHeader
        title="Financial Analytics"
        subtitle="Donation trends and most recent transactions"
      />
      <FinancialAnalyticsDashboard initial={analytics} />
    </Card>
  );
}
