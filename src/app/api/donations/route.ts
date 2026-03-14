import { NextResponse } from "next/server";
import { donationSchema } from "@/lib/validation/donation";
import { addDonationForContact } from "@/lib/data/contact-profile";

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

    const id = await addDonationForContact({
      contactId: parsed.data.contactId,
      date: parsed.data.date,
      amount: parsed.data.amount,
      paymentType: parsed.data.paymentType,
      checkNumber: parsed.data.checkNumber,
      transactionId: parsed.data.transactionId,
      memo: parsed.data.memo
    });

    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to add donation" },
      { status: 500 }
    );
  }
}
