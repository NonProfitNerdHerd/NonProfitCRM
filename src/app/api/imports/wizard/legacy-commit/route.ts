import { NextResponse } from "next/server";
import Papa from "papaparse";
import { processCsvImport } from "@/lib/data/imports";

type MappingEntry = {
  sourceHeader: string;
  targetField: string;
  ignore?: boolean;
};

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const entityType = String(payload.entityType ?? "");
    const domain =
      entityType === "contact" ? "contacts" : entityType === "donations" ? "donations" : null;
    if (!domain) {
      return NextResponse.json(
        {
          message:
            "Legacy fallback import currently supports Contacts and Donations only. Run DB migrations 202603130017+ for full import engine support."
        },
        { status: 400 }
      );
    }

    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const mappings = (Array.isArray(payload.mappings) ? payload.mappings : []) as MappingEntry[];
    const mappingConfig: Record<string, string> = {};
    for (const mapping of mappings) {
      if (mapping.ignore || !mapping.targetField || !mapping.sourceHeader) continue;
      mappingConfig[mapping.targetField] = mapping.sourceHeader;
    }

    const csvText = Papa.unparse(rows, { header: true });
    const result = await processCsvImport({
      domain: domain as "contacts" | "donations",
      sourcePlatform: String(payload.sourceSystem ?? "Spreadsheet / Manual"),
      fileName: String(payload.fileName ?? "legacy-import.csv"),
      csvText,
      mapping: mappingConfig
    });

    return NextResponse.json({
      ...result,
      legacyFallback: true
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Legacy import commit failed" },
      { status: 500 }
    );
  }
}
