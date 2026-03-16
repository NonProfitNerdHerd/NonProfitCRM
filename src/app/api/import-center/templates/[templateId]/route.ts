import { NextResponse } from "next/server";
import {
  deleteImportCenterTemplate,
  updateImportCenterTemplate
} from "@/lib/import-center/template-service";

type RouteContext = {
  params: Promise<{ templateId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { templateId } = await params;
    const payload = await request.json();
    const updated = await updateImportCenterTemplate(templateId, {
      name: payload.name,
      mappings: payload.mappings,
      classification: payload.classification,
      tagDelimiter: payload.tagDelimiter,
      duplicateHandling: payload.duplicateHandling,
      isActive: payload.isActive
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update template." },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: RouteContext) {
  try {
    const { templateId } = await params;
    const response = await deleteImportCenterTemplate(templateId);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to delete template." },
      { status: 500 }
    );
  }
}
