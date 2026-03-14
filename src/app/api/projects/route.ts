import { NextResponse } from "next/server";
import { createProject, listProjects, canCreateProjects } from "@/lib/data/projects";
import { projectSchema } from "@/lib/validation/crm";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status =
      (url.searchParams.get("status") as
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
        | "all"
        | null) ?? "all";
    const q = url.searchParams.get("q") ?? undefined;

    const [projects, canCreate] = await Promise.all([
      listProjects({ status, q }),
      canCreateProjects()
    ]);
    return NextResponse.json({ projects, canCreate });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load projects" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = projectSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const id = await createProject(parsed.data);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create project" },
      { status: 500 }
    );
  }
}
