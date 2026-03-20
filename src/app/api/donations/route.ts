import { NextResponse } from "next/server";
import { donationSchema } from "@/lib/validation/donation";
import { createDonationForStaff, listDonationsForStaff } from "@/lib/data/donations";

function parseTagIds(raw: string | null) {
  if (!raw) return [] as string[];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const donations = await listDonationsForStaff({
      campaignId: url.searchParams.get("campaignId") ?? undefined,
      paymentType: url.searchParams.get("paymentType") ?? undefined,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
      contactId: url.searchParams.get("contactId") ?? undefined,
      donorQuery: url.searchParams.get("donor") ?? undefined,
      tagIds: parseTagIds(url.searchParams.get("tagIds"))
    });
    return NextResponse.json({ donations });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load donations" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
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
    if (!totalAmount) {
      return NextResponse.json(
        { message: "Total Donation Amount is required." },
        { status: 400 }
      );
    }
    if (allocations.length === 0) {
      return NextResponse.json(
        { message: "At least one campaign allocation is required." },
        { status: 400 }
      );
    }

    const id = await createDonationForStaff({
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

    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to add donation" },
      { status: 500 }
    );
  }
}
