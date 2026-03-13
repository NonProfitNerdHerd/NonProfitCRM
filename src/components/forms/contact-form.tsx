"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contactSchema, type ContactInput } from "@/lib/validation/contact";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const donorStatusOptions = ["prospect", "active", "lapsed", "inactive"] as const;
const memberStatusOptions = ["none", "active", "lapsed", "cancelled"] as const;

export function ContactForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      donor_status: "prospect",
      member_status: "none",
      contains_pii: true
    }
  });

  async function onSubmit(values: ContactInput) {
    setSubmitError(null);
    const response = await fetch("/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      setSubmitError(error?.message ?? "Unable to create contact.");
      return;
    }

    const payload = await response.json();
    router.push(`/staff/contacts/${payload.id}`);
    router.refresh();
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">First Name</label>
          <Input {...register("first_name")} />
          {errors.first_name ? (
            <p className="mt-1 text-xs text-red-700">{errors.first_name.message}</p>
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Last Name</label>
          <Input {...register("last_name")} />
          {errors.last_name ? (
            <p className="mt-1 text-xs text-red-700">{errors.last_name.message}</p>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <Input type="email" {...register("email")} />
          {errors.email ? (
            <p className="mt-1 text-xs text-red-700">{errors.email.message}</p>
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Phone</label>
          <Input {...register("phone")} />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Donor Status</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            {...register("donor_status")}
          >
            {donorStatusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Member Status</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            {...register("member_status")}
          >
            {memberStatusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {submitError ? <p className="text-sm text-red-700">{submitError}</p> : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Create Contact"}
      </Button>
    </form>
  );
}
