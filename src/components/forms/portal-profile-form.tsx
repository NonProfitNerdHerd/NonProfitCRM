"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { portalProfileSchema, type PortalProfileInput } from "@/lib/validation/portal-profile";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function PortalProfileForm({
  initialValues
}: {
  initialValues: {
    preferred_name: string | null;
    email: string | null;
    phone: string | null;
    communication_preferences: Record<string, unknown> | null;
  };
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<PortalProfileInput>({
    resolver: zodResolver(portalProfileSchema),
    defaultValues: {
      preferred_name: initialValues.preferred_name ?? "",
      email: initialValues.email ?? "",
      phone: initialValues.phone ?? "",
      contact_by_email:
        Boolean(initialValues.communication_preferences?.contact_by_email) ?? true,
      contact_by_sms: Boolean(initialValues.communication_preferences?.contact_by_sms)
    }
  });

  async function onSubmit(values: PortalProfileInput) {
    setError(null);
    setMessage(null);
    const response = await fetch("/api/portal/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values)
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.message ?? "Unable to update profile.");
      return;
    }
    setMessage("Profile updated.");
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Preferred Name</label>
          <Input {...register("preferred_name")} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <Input type="email" {...register("email")} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Phone</label>
        <Input {...register("phone")} />
      </div>
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register("contact_by_email")} />
          Contact by email
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register("contact_by_sms")} />
          Contact by SMS
        </label>
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save profile"}
      </Button>
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
