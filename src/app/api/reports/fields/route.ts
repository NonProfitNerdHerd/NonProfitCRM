import { NextResponse } from "next/server";
import { getAuthorizedReportFields } from "@/lib/data/reports";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain");

  if (!domain) {
    return NextResponse.json({ message: "Domain is required" }, { status: 400 });
  }

  try {
    const { fields } = await getAuthorizedReportFields(
      domain as
        | "contacts"
        | "donations"
        | "memberships"
        | "notes"
        | "tasks"
        | "communications"
    );
    return NextResponse.json({ fields });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load fields" },
      { status: 500 }
    );
  }
}
