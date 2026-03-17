import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteMailBuilderTemplate, saveMailBuilderTemplate } from "@/lib/data/mail-builder";

const templateUpdateSchema = z.object({
  name: z.string().trim().min(1),
  paperSize: z.enum(["letter", "legal", "tabloid", "a4", "a5"]),
  templateBody: z.string().trim().min(1),
  isActive: z.boolean().optional(),
  marginTopIn: z.coerce.number().min(0).max(3).optional(),
  marginLeftIn: z.coerce.number().min(0).max(3).optional(),
  marginRightIn: z.coerce.number().min(0).max(3).optional(),
  marginBottomIn: z.coerce.number().min(0).max(3).optional(),
  includeMailer: z.boolean().optional(),
  mailerType: z.enum(["label", "envelope"]).optional(),
  mailerSizeKey: z.string().trim().optional().nullable(),
  labelMarginTopIn: z.coerce.number().min(0).max(1).optional(),
  labelMarginLeftIn: z.coerce.number().min(0).max(1).optional(),
  labelMarginRightIn: z.coerce.number().min(0).max(1).optional(),
  labelMarginBottomIn: z.coerce.number().min(0).max(1).optional()
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
