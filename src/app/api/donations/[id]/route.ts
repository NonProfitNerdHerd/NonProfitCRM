import { NextResponse } from "next/server";
import { donationSchema } from "@/lib/validation/donation";
import { updateDonationForStaff } from "@/lib/data/donations";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const parsed = donationSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const totalAmount = parsed.data.totalAmount ?? parsed.data.amount;
    const allocations =
      parsed.data.allocations && parsed.data.allocations.length > 0
        ? parsed.data.allocations
        : parsed.data.campaignId && totalAmount
          ? [{ campaignId: parsed.data.campaignId, amount: totalAmount }]
          : [];

    if (!totalAmount || allocations.length === 0) {
      return NextResponse.json(
        { message: "Total amount and at least one allocation are required." },
        { status: 400 }
      );
    }

    await updateDonationForStaff({
      donationId: id,
      contactId: parsed.data.contactId,
      crmOrganizationId: parsed.data.crmOrganizationId ?? parsed.data.organizationId,
      organizationId: parsed.data.organizationId,
      date: parsed.data.date,
      totalAmount,
      allocations,
      paymentType: parsed.data.paymentType,
      checkNumber: parsed.data.checkNumber,
      transactionId: parsed.data.transactionId,
      memo: parsed.data.memo,
      sourceSystem: parsed.data.sourceSystem,
      externalDonationId: parsed.data.externalDonationId,
      recurring: parsed.data.recurring
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update donation" },
      { status: 500 }
    );
  }
}
