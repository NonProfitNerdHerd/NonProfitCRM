import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteMailBuilderTemplate, saveMailBuilderTemplate } from "@/lib/data/mail-builder";

const templateUpdateSchema = z.object({
  name: z.string().trim().min(1),
  paperSize: z.enum(["letter", "a4", "label_4x6"]),
  templateBody: z.string().trim().min(1),
  isActive: z.boolean().optional()
});

type Params = {
  params: Promise<{ templateId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { templateId } = await params;
    const payload = await request.json();
    const parsed = templateUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "Validation error",
          issues: parsed.error.flatten()
        },
        { status: 400 }
      );
    }
    const template = await saveMailBuilderTemplate({
      id: templateId,
      ...parsed.data
    });
    return NextResponse.json({ ok: true, template });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update mail template." },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { templateId } = await params;
    await deleteMailBuilderTemplate(templateId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to delete mail template." },
      { status: 500 }
    );
  }
}
