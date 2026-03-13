import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";

export default function NoOrganizationPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6">
      <Card className="w-full">
        <CardHeader
          title="No organization access"
          subtitle="Your account is valid but is not currently assigned to an organization."
        />
        <p className="text-sm text-slate-700">
          Ask your nonprofit administrator to create an active organization
          membership for your account.
        </p>
        <div className="mt-4">
          <Link href="/login">Back to sign in</Link>
        </div>
      </Card>
    </main>
  );
}
