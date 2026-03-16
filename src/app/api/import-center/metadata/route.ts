import { NextResponse } from "next/server";
import { getImportCenterMetadata } from "@/lib/import-center/contact-import-service";

export async function GET() {
  try {
    const metadata = await getImportCenterMetadata();
    return NextResponse.json(metadata);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load Import Center metadata." },
      { status: 500 }
    );
  }
}
