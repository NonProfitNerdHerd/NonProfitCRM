import { NextResponse } from "next/server";
import {
  createImportCenterTemplate,
  listImportCenterTemplates
} from "@/lib/import-center/template-service";
import type { ImportCenterType } from "@/lib/import-center/types";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const importTypeParam = url.searchParams.get("importType") ?? "all";
    const importType: ImportCenterType | "all" =
      importTypeParam === "contacts" || importTypeParam === "transactions" ? importTypeParam : "all";
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
    const importType: ImportCenterType =
      payload.importType === "transactions" ? "transactions" : "contacts";
    const classificationDefaults =
      payload.classification && typeof payload.classification === "object"
        ? (payload.classification as Record<string, unknown>)
        : importType === "contacts"
          ? { contactType: "person", contactCategory: "lead" }
          : {};
    const template = await createImportCenterTemplate({
      importType,
      name: payload.name ?? "Untitled Template",
      mappings: payload.mappings ?? [],
      classification: classificationDefaults,
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
