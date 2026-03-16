import { NextResponse } from "next/server";
import {
  buildVolunteerCoordinationEmptyState,
  getVolunteerCoordinationData,
  isVolunteerSchemaMissingError
} from "@/lib/volunteer-coordination/service";
import { errorResponse } from "@/app/api/volunteer-coordination/_shared";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const data = await getVolunteerCoordinationData({
      volunteerStatus: url.searchParams.get("volunteerStatus") ?? undefined,
      assignmentStatus: url.searchParams.get("assignmentStatus") ?? undefined,
      eventType: url.searchParams.get("eventType") ?? undefined,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
      burnoutOnly: url.searchParams.get("burnoutOnly") === "true",
      cautionOnly: url.searchParams.get("cautionOnly") === "true",
      tagIds: url.searchParams.getAll("tagId").filter(Boolean)
    });
    return NextResponse.json(data);
  } catch (error) {
    if (isVolunteerSchemaMissingError(error)) {
      return NextResponse.json(buildVolunteerCoordinationEmptyState());
    }
    return errorResponse(error, "Unable to load Volunteer Coordination data.");
  }
}
