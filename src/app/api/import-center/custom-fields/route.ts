import { NextResponse } from "next/server";
import {
  createContactCustomField,
  listContactCustomFields
} from "@/lib/import-center/custom-fields-service";

export async function GET() {
  try {
    const customFields = await listContactCustomFields();
    return NextResponse.json({ customFields });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load custom fields." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const field = await createContactCustomField({
      label: payload.label,
      internalKey: payload.internalKey,
      dataType: payload.dataType ?? "text"
    });
    return NextResponse.json(field);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to create custom field." },
      { status: 500 }
    );
  }
}
