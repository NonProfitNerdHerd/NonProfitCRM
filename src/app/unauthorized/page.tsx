import { Card, CardHeader } from "@/components/ui/card";

export default function UnauthorizedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6">
      <Card className="w-full">
        <CardHeader
          title="Unauthorized"
          subtitle="Your role does not include permission for this action."
        />
        <p className="text-sm text-slate-700">
          Request additional permissions from an administrator if this is expected.
        </p>
      </Card>
    </main>
  );
}
