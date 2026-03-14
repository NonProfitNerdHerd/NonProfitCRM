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
    const problem = error as { message?: string; details?: string; hint?: string; code?: string };
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to stage import batch",
        details: problem?.details ?? null,
        hint: problem?.hint ?? null,
        code: problem?.code ?? null
      },
      { status: 500 }
    );
  }
}
