import { NextResponse } from "next/server";
import {
  createImportCenterTemplate,
  listImportCenterTemplates
} from "@/lib/import-center/template-service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const importType = (url.searchParams.get("importType") ?? "contacts") as "contacts";
    const templates = await listImportCenterTemplates(importType);
    return NextResponse.json({ templates });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load templates." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const template = await createImportCenterTemplate({
      importType: payload.importType ?? "contacts",
      name: payload.name ?? "Untitled Template",
      mappings: payload.mappings ?? [],
      classification: payload.classification ?? {
        contactType: "person",
        contactCategory: "lead"
      },
      tagDelimiter: payload.tagDelimiter ?? null,
      duplicateHandling: payload.duplicateHandling ?? "skip",
      rerunMatching: payload.rerunMatching ?? {
        enabled: false,
        sourceMatchColumn: null,
        destinationMatchField: null,
        onMatchBehavior: "update_blank_only",
        onNoMatchBehavior: "create_new",
        ignoreBlankOverwrites: true,
        missingKeyBehavior: "skip_row"
      }
    });
    return NextResponse.json(template);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to create template." },
      { status: 500 }
    );
  }
}
