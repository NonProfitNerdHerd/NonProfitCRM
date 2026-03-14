import { NextResponse } from "next/server";
import { getMembershipTypeWithMembers } from "@/lib/data/memberships";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const result = await getMembershipTypeWithMembers(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to load membership type detail"
      },
      { status: 500 }
    );
  }
}
