import { NextResponse } from "next/server";
import { exportReport } from "@/lib/data/reports";
import { requireSessionContext } from "@/lib/auth/guards";
import { logAuditEvent } from "@/lib/data/audit";
import { type ReportType } from "@/lib/reports/config";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const output = await exportReport({
      reportType: payload.reportType as ReportType,
      selectedColumns: (payload.selectedColumns ?? []) as string[],
      filters: payload.filters ?? {},
      sort: payload.sort ?? undefined,
      format: payload.format
    });

    const context = await requireSessionContext();
    await logAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      actionType: "report_exported",
      targetEntityType: "reports",
      metadata: {
        report_type: payload.reportType,
        format: payload.format,
        selected_columns: payload.selectedColumns ?? []
      }
    });

    return new NextResponse(output.data, {
      headers: {
        "content-type": output.contentType,
        "content-disposition": `attachment; filename="${output.fileName}"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}
