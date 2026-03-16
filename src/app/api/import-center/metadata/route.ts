import { NextResponse } from "next/server";
import { getImportCenterMetadataByType } from "@/lib/import-center/contact-import-service";
import type { ImportCenterType } from "@/lib/import-center/types";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const importTypeParam = url.searchParams.get("importType") ?? "all";
    const importType: ImportCenterType | "all" =
      importTypeParam === "contacts" || importTypeParam === "transactions" ? importTypeParam : "all";
    const metadata = await getImportCenterMetadataByType(importType);
    return NextResponse.json(metadata);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load Import Center metadata." },
      { status: 500 }
    );
  }
}
