import Link from "next/link";
import Image from "next/image";
import { Card, CardHeader } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-12">
      <div className="w-full space-y-6">
        <div className="flex justify-center">
          <Image src="/HerdCoreLogo.png" alt="NerdCore Logo" width={240} height={80} priority />
        </div>
        <div className="grid w-full gap-4 md:grid-cols-2">
          <Card>
            <CardHeader
              title="Staff Console"
              subtitle="Manage donors, memberships, transactions, and reporting."
            />
            <Link className="text-sm font-semibold" href="/staff/dashboard">
              Open staff workspace
            </Link>
          </Card>
          <Card>
            <CardHeader
              title="Constituent Portal"
              subtitle="Donors and members can view profile, history, and notifications."
            />
            <Link className="text-sm font-semibold" href="/portal">
              Open portal
            </Link>
          </Card>
        </div>
      </div>
    </main>
  );
}
