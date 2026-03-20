import { Card, CardHeader } from "@/components/ui/card";
import { GivingFuelReviewDetail } from "@/components/givingfuel/giving-fuel-review-detail";
import { requireGivingFuelOperationalAccess } from "@/lib/data/givingfuel-webhook";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export default async function GivingFuelReviewDetailPage({ params }: RouteProps) {
  await requireGivingFuelOperationalAccess();
  const { id } = await params;

  return (
    <Card>
      <CardHeader
        title="Giving Fuel Review Detail"
        subtitle="Validate campaign and donor assignments before final transaction acceptance"
      />
      <GivingFuelReviewDetail importId={id} />
    </Card>
  );
}
