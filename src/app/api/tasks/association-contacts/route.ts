import { NextResponse } from "next/server";
import { searchTaskAssociationContacts } from "@/lib/data/tasks";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? "";
    const results = await searchTaskAssociationContacts(query);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to search contacts" },
      { status: 500 }
    );
  }
}
