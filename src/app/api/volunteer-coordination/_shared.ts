import { NextResponse } from "next/server";
import { z, type ZodSchema } from "zod";

export function toText(value: unknown) {
  return String(value ?? "").trim();
}

export function errorResponse(error: unknown, fallback: string) {
  const value = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };
  return NextResponse.json(
    {
      message: toText(value?.message) || fallback,
      details: value?.details ?? null,
      hint: value?.hint ?? null,
      code: value?.code ?? null
    },
    { status: 500 }
  );
}

export function validationErrorResponse(error: z.ZodError) {
  return NextResponse.json(
    {
      message: "Validation error",
      issues: error.flatten()
    },
    { status: 400 }
  );
}

export async function parseJsonWithSchema<T>(request: Request, schema: ZodSchema<T>) {
  const payload = await request.json();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw parsed.error;
  }
  return parsed.data;
}
