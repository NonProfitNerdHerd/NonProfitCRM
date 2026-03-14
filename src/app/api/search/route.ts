import { NextResponse } from "next/server";
import { globalSearch } from "@/lib/data/search";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? "";
    const results = await globalSearch(query);
    return NextResponse.json({ query, results });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Search failed" },
      { status: 500 }
    );
  }
}
