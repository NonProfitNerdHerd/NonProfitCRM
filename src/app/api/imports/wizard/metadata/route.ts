import { NextResponse } from "next/server";
import { requireStaffPermission } from "@/lib/auth/guards";
import { IMPORT_ENTITY_CONFIG, IMPORT_MODE_OPTIONS, SOURCE_SYSTEM_OPTIONS } from "@/lib/imports/config";

export async function GET() {
  try {
    await requireStaffPermission("can_manage_imports");
    return NextResponse.json({
      entities: Object.values(IMPORT_ENTITY_CONFIG),
      sourceSystems: SOURCE_SYSTEM_OPTIONS,
      importModes: IMPORT_MODE_OPTIONS
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load import metadata" },
      { status: 500 }
    );
  }
}
