import { NextResponse } from "next/server";
import { processCsvImport } from "@/lib/data/imports";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await processCsvImport({
      domain: body.domain,
      sourcePlatform: body.sourcePlatform,
      fileName: body.fileName,
      csvText: body.csvText,
      mapping: body.mapping
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Import failed"
      },
      { status: 500 }
    );
  }
}
