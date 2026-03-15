"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  contactSchema,
  entityTypeOptions,
  trackingStatusOptions,
  type ContactInput
} from "@/lib/validation/contact";
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

function buildOrganizationFormalLetterName(values: ContactInput) {
  const organizationName = values.organization_name?.trim() ?? "";
  const primaryName = `${values.first_name?.trim() ?? ""} ${values.last_name?.trim() ?? ""}`.trim();
  if (!organizationName && !primaryName) return "";
  if (!organizationName) return primaryName;
  if (!primaryName) return organizationName;
  return `${organizationName}\nc/o ${primaryName}`;
}

export function ContactForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formalLetterManualOverride, setFormalLetterManualOverride] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      entity_type: "person",
      tracking_status: "lead",
      donor_status: "prospect",
      member_status: "none",
      communication_preferences: []
    }
  });
  const communicationPreferences = watch("communication_preferences") ?? [];
  const entityType = watch("entity_type");
  const trackingStatus = watch("tracking_status");
  const organizationName = watch("organization_name");
  const firstName = watch("first_name");
  const lastName = watch("last_name");

  useEffect(() => {
    register("communication_preferences");
  }, [register]);

  useEffect(() => {
    if (entityType === "person" && organizationName) {
      setValue("organization_name", "", { shouldValidate: true, shouldDirty: true });
    }
  }, [entityType, organizationName, setValue]);

  useEffect(() => {
    if (entityType !== "organization") return;
    if (formalLetterManualOverride) return;
    const generated = buildOrganizationFormalLetterName({
      first_name: firstName || "",
      last_name: lastName || "",
      organization_name: organizationName || "",
      entity_type: entityType,
      tracking_status: trackingStatus || "lead"
    } as ContactInput);
    setValue("formal_letter_name", generated, { shouldDirty: true, shouldValidate: true });
  }, [
    entityType,
    formalLetterManualOverride,
    firstName,
    lastName,
    organizationName,
    setValue,
    trackingStatus
  ]);

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
      <section className="rounded-md border border-slate-200 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-900">Contact Type</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Record Type *</label>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              {...register("entity_type")}
            >
              {entityTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "person" ? "Person" : "Organization"}
                </option>
              ))}
            </select>
            {errors.entity_type ? (
              <p className="mt-1 text-xs text-red-700">{errors.entity_type.message}</p>
            ) : null}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Tracking Status *</label>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              {...register("tracking_status")}
            >
              {trackingStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "non_lead"
                    ? "Non-Lead"
                    : option.charAt(0).toUpperCase() + option.slice(1)}
                </option>
              ))}
            </select>
            {errors.tracking_status ? (
              <p className="mt-1 text-xs text-red-700">{errors.tracking_status.message}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-900">Name</p>
        <div className="grid gap-4 md:grid-cols-2">
          {entityType === "organization" ? (
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Organization Name *</label>
              <Input {...register("organization_name")} />
              {errors.organization_name ? (
                <p className="mt-1 text-xs text-red-700">{errors.organization_name.message}</p>
              ) : null}
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-sm font-medium">
              {entityType === "organization"
                ? "Primary Contact First Name *"
                : "First Name *"}
            </label>
            <Input {...register("first_name")} />
            {errors.first_name ? (
              <p className="mt-1 text-xs text-red-700">{errors.first_name.message}</p>
            ) : null}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              {entityType === "organization" ? "Primary Contact Last Name *" : "Last Name *"}
            </label>
            <Input {...register("last_name")} />
            {errors.last_name ? (
              <p className="mt-1 text-xs text-red-700">{errors.last_name.message}</p>
            ) : null}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Display / Preferred Name</label>
            <Input {...register("preferred_name")} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Formal Letter Name</label>
            <Input
              {...register("formal_letter_name")}
              placeholder="e.g. Mr. and Mrs. Jordan Smith"
            />
            {entityType === "organization" ? (
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={formalLetterManualOverride}
                  onChange={(event) => setFormalLetterManualOverride(event.target.checked)}
                />
                Manually override organization formal letter name
              </label>
            ) : null}
          </div>
        </div>
      </section>

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
        {entityType === "person" ? (
          <>
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
          </>
        ) : null}
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
        {entityType === "person" ? (
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
        ) : null}
      </div>

      {errors.tracking_status ? (
        <p className="text-xs text-red-700">{errors.tracking_status.message}</p>
      ) : null}
      {errors.organization_name ? (
        <p className="text-xs text-red-700">{errors.organization_name.message}</p>
      ) : null}
      {errors.root ? (
        <p className="text-xs text-red-700">{errors.root.message}</p>
      ) : null}

      <div className="rounded-md border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
        {entityType === "person"
          ? "Person records default to Lead unless marked as Donor or Non-Lead."
          : "Organization records default to Lead. Organization Name is required."}
      </div>

      {submitError ? <p className="text-sm text-red-700">{submitError}</p> : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Create Contact"}
      </Button>
    </form>
  );
}
