import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NonprofitCRM Platform",
  description:
    "Multi-tenant nonprofit CRM, donation, membership, reporting, and portal platform."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
