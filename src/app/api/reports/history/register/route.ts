import { NextResponse } from "next/server";
import { z } from "zod";
import { registerPdfReportRun } from "@/lib/data/reports";
import { type ReportType } from "@/lib/reports/config";

const registerSchema = z.object({
  reportType: z.string().trim().min(1),
  outputKey: z.string().trim().min(1),
  outputLabel: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
  fileDataUrl: z.string().trim().min(1),
  rowCount: z.coerce.number().min(0).optional(),
  selectedColumns: z.array(z.string()).optional(),
  filters: z.record(z.unknown()).optional(),
  reportMode: z.string().trim().optional()
});

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const parsed = registerSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    await registerPdfReportRun({
      reportType: parsed.data.reportType as ReportType,
      outputKey: parsed.data.outputKey,
      outputLabel: parsed.data.outputLabel,
      fileName: parsed.data.fileName,
      fileDataUrl: parsed.data.fileDataUrl,
      rowCount: Number(parsed.data.rowCount ?? 0),
      selectedColumns: parsed.data.selectedColumns ?? [],
      filters: parsed.data.filters ?? {},
      reportMode: parsed.data.reportMode
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to register report output." },
      { status: 500 }
    );
  }
}
