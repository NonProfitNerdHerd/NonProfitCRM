import { NextResponse } from "next/server";
import { cloneImportCenterTemplate } from "@/lib/import-center/template-service";

type RouteContext = {
  params: Promise<{ templateId: string }>;
};

export async function POST(_: Request, { params }: RouteContext) {
  try {
    const { templateId } = await params;
    const cloned = await cloneImportCenterTemplate(templateId);
    return NextResponse.json(cloned);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to clone template." },
      { status: 500 }
    );
  }
}
