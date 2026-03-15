import { NextResponse } from "next/server";
import { IntegrationSchedulerService } from "@/lib/integrations/integration-scheduler-service";

function authorized(request: Request) {
  const expected = process.env.INTEGRATION_SCHEDULER_TOKEN;
  if (!expected) return false;
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  return Boolean(token && token === expected);
}

export async function POST(request: Request) {
  try {
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
