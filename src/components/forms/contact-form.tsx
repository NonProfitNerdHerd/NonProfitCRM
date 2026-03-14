"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contactSchema, type ContactInput } from "@/lib/validation/contact";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const donorStatusOptions = ["prospect", "active", "lapsed", "inactive"] as const;
const memberStatusOptions = ["none", "active", "lapsed", "cancelled"] as const;
const communicationPreferenceOptions = [
  "Marketing Email",
  "Other Mail",
  "Phone Calls",
  "Newsletter"
] as const;

export function ContactForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      donor_status: "prospect",
      member_status: "none",
      communication_preferences: []
    }
  });
  const communicationPreferences = watch("communication_preferences") ?? [];

  useEffect(() => {
    register("communication_preferences");
  }, [register]);

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
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium">Formal Letter Name</label>
          <Input {...register("formal_letter_name")} placeholder="e.g. Mr. and Mrs. Jordan Smith" />
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
        <div>
          <label className="mb-1 block text-sm font-medium">Alternate Email</label>
          <Input type="email" {...register("alternate_email")} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Alternate Phone</label>
          <Input {...register("alternate_phone")} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Mobile Number</label>
          <Input {...register("mobile_number")} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Emergency Contact</label>
          <Input {...register("emergency_contact")} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Emergency Contact Phone Number</label>
          <Input {...register("emergency_contact_phone")} />
        </div>
      </div>

      <div className="rounded-md border border-slate-200 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-900">Physical Address</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Address Line 1</label>
            <Input {...register("address_line_1")} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Address Line 2</label>
            <Input {...register("address_line_2")} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">City</label>
            <Input {...register("city")} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">State</label>
            <Input {...register("state")} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Zip</label>
            <Input {...register("postal_code")} />
          </div>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-900">Mailing Address</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Mailing Address Line 1</label>
            <Input {...register("mailing_address_line_1")} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Mailing Address Line 2</label>
            <Input {...register("mailing_address_line_2")} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Mailing City</label>
            <Input {...register("mailing_city")} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Mailing State</label>
            <Input {...register("mailing_state")} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Mailing Zip</label>
            <Input {...register("mailing_postal_code")} />
          </div>
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
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium">Preferences - Communication</label>
          <div className="grid gap-2 rounded-md border border-slate-200 p-3 md:grid-cols-2">
            {communicationPreferenceOptions.map((option) => {
              const checked = communicationPreferences.includes(option);
              return (
                <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...communicationPreferences, option]
                        : communicationPreferences.filter((entry) => entry !== option);
                      setValue("communication_preferences", next, { shouldValidate: true });
                    }}
                  />
                  {option}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {submitError ? <p className="text-sm text-red-700">{submitError}</p> : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Create Contact"}
      </Button>
    </form>
  );
}
