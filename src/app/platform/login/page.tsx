"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toEmail(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return trimmed.includes("@")
      ? trimmed
      : `${trimmed.toLowerCase()}@nonprofitcrm.local`;
  }

  async function withTimeout<T>(promise: Promise<T>, ms = 15000): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Request timed out. Please try again.")), ms);
    });
    return Promise.race([promise, timeout]);
  }

  async function onPasswordSignIn(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const email = toEmail(identifier);
    if (!email || !password) {
      setError("Username/email and password are required.");
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error: signInError } = await withTimeout(
        supabase.auth.signInWithPassword({
          email,
          password
        })
      );

      if (signInError) {
        setError(signInError.message);
        return;
      }

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("must_change_password")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.must_change_password) {
          router.replace("/change-password");
          router.refresh();
          return;
        }
      }

      const { data: platformMembership, error: platformError } = await supabase
        .from("platform_admin_memberships")
        .select("id")
        .eq("user_id", user?.id ?? "")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (platformError || !platformMembership) {
        await supabase.auth.signOut();
        setError("You do not have access to the Platform Administration console.");
        return;
      }

      router.replace("/platform/admin/tenants");
      router.refresh();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function onMagicLink() {
    setLoading(true);
    setError(null);
    setMessage(null);
    const email = toEmail(identifier);
    if (!email) {
      setError("Enter a username or email first.");
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error: signInError } = await withTimeout(
        supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/platform/admin/tenants`
          }
        })
      );
      if (signInError) {
        setError(signInError.message);
      } else {
        setMessage(`Magic link sent to ${email}. Check your inbox.`);
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Magic link failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <Card className="w-full">
        <CardHeader title="Platform Login" subtitle="Sign in to the Platform Administration console." />
        <form className="space-y-4" onSubmit={onPasswordSignIn}>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Console links</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link
                href="/platform/admin/tenants"
                className="rounded-md border border-slate-200 px-2 py-1.5 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Platform Console
              </Link>
              <Link
                href="/login"
                className="rounded-md border border-slate-200 px-2 py-1.5 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Tenant Login
              </Link>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Username or Email</label>
            <Input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              type="text"
              required
              placeholder="admin@nonprofit.org"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="Enter your password"
            />
          </div>
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in with password"}
          </Button>
          <Button
            className="w-full"
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={onMagicLink}
          >
            Send magic link instead
          </Button>
          {message ? <p className="text-sm text-green-700">{message}</p> : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </form>
      </Card>
    </main>
  );
}
