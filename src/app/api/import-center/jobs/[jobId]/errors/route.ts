import { NextResponse } from "next/server";
import { listImportCenterJobErrors } from "@/lib/import-center/contact-import-service";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET(_: Request, { params }: RouteContext) {
  try {
    const { jobId } = await params;
    const rows = await listImportCenterJobErrors(jobId);
    const header = ["row_index", "error_message", "raw_row_json"];
    const lines = [
      header.join(","),
      ...rows.map((row) =>
        [
          escapeCsv(row.row_index),
          escapeCsv(row.error_message),
          escapeCsv(JSON.stringify(row.raw_row ?? {}))
        ].join(",")
      )
    ];
    const csv = lines.join("\n");

    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="import-errors-${jobId}.csv"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to export error log." },
      { status: 500 }
    );
  }
}
