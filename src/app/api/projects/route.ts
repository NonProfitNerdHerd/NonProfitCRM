import { NextResponse } from "next/server";
import { z } from "zod";
import { createProject, listProjects, canCreateProjects } from "@/lib/data/projects";

const projectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.string().optional()
});

export async function GET() {
  try {
    const [projects, canCreate] = await Promise.all([
      listProjects(),
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
