import { NextResponse } from "next/server";

export function toApiErrorPayload(error: unknown, fallback: string) {
  const value = error as { message?: string; details?: string; hint?: string; code?: string };
  return {
    message: value?.message || fallback,
    details: value?.details ?? null,
    hint: value?.hint ?? null,
    code: value?.code ?? null
  };
}

export function apiErrorResponse(error: unknown, fallback: string, status = 500) {
  return NextResponse.json(toApiErrorPayload(error, fallback), { status });
}
