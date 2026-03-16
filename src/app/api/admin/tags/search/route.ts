import { NextResponse } from "next/server";
import { searchTags } from "@/lib/data/tags";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const activeOnly = !["false", "0", "no"].includes(
      (url.searchParams.get("activeOnly") ?? "true").toLowerCase()
    );
    const limit = Number(url.searchParams.get("limit") ?? 25);
    const tags = await searchTags({ q, activeOnly, limit });
    return NextResponse.json({ tags });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to search tags" },
      { status: 500 }
    );
  }
}

