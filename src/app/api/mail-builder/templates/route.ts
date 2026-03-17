import { NextResponse } from "next/server";
import { z } from "zod";
import { listMailBuilderTemplates, saveMailBuilderTemplate } from "@/lib/data/mail-builder";

const templateSaveSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  paperSize: z.enum(["letter", "a4", "label_4x6"]),
  templateBody: z.string().trim().min(1),
  isActive: z.boolean().optional()
});

export async function GET() {
  try {
    const templates = await listMailBuilderTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load mail templates." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = templateSaveSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "Validation error",
          issues: parsed.error.flatten()
        },
        { status: 400 }
      );
    }

    const template = await saveMailBuilderTemplate(parsed.data);
    return NextResponse.json({ ok: true, template });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to save mail template." },
      { status: 500 }
    );
  }
}
