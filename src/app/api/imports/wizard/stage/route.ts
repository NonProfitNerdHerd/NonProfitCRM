import { NextResponse } from "next/server";
import { stageImportBatch } from "@/lib/data/import-engine";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await stageImportBatch({
      entityType: payload.entityType,
      sourceSystem: payload.sourceSystem,
      fileName: payload.fileName,
      fileType: payload.fileType,
      headers: payload.headers ?? [],
      rows: payload.rows ?? [],
      mappings: payload.mappings ?? [],
      relationshipSettings: payload.relationshipSettings ?? [],
      importMode: payload.importMode ?? "upsert",
      matchBy: payload.matchBy ?? undefined
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to stage import batch" },
      { status: 500 }
    );
  }
}
