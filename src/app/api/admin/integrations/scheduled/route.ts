import { NextResponse } from "next/server";
import { IntegrationSchedulerService } from "@/lib/integrations/integration-scheduler-service";
import { integrationsApiPaused } from "@/lib/data/integrations";

function authorized(request: Request) {
  const expected = process.env.INTEGRATION_SCHEDULER_TOKEN;
  if (!expected) return false;
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  return Boolean(token && token === expected);
}

export async function POST(request: Request) {
  try {
    if (integrationsApiPaused()) {
      return NextResponse.json(
        { message: "Integrations API is temporarily disabled." },
        { status: 503 }
      );
    }
    if (!authorized(request)) {
      return NextResponse.json({ message: "Unauthorized scheduler call." }, { status: 401 });
    }
    const scheduler = new IntegrationSchedulerService();
    const results = await scheduler.runScheduledJobs();
    return NextResponse.json({
      ok: true,
      total: results.length,
      results
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Scheduled integration run failed." },
      { status: 500 }
    );
  }
}
