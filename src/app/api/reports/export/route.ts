import { NextResponse } from "next/server";
import { exportReport } from "@/lib/data/reports";
import { requireSessionContext } from "@/lib/auth/guards";
import { logAuditEvent } from "@/lib/data/audit";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const output = await exportReport({
      domain: payload.domain,
      selectedFieldKeys: payload.selectedFieldKeys,
      format: payload.format
    });

    const context = await requireSessionContext();
    await logAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      actionType: "report_exported",
      targetEntityType: "reports",
      metadata: {
        domain: payload.domain,
        format: payload.format,
        selected_fields: payload.selectedFieldKeys
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
