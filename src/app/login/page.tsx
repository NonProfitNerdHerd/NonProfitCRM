"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loginMode, setLoginMode] = useState<"tenant_admin" | "staff" | "constituent">(() => {
    if (typeof window === "undefined") return "staff";
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "platform" || mode === "tenant") return "tenant_admin";
    if (mode === "portal" || mode === "constituent") return "constituent";
    return "staff";
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      } else {
        const {
          data: { user }
        } = await supabase.auth.getUser();
        let mustChangePassword = false;
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("must_change_password")
            .eq("id", user.id)
            .maybeSingle();
          mustChangePassword = Boolean(profile?.must_change_password);
        }

        if (mustChangePassword) {
          router.replace("/change-password");
          router.refresh();
          return;
        }

        if (loginMode === "tenant_admin") {
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
          return;
        }

        if (loginMode === "constituent") {
          const { data: portalContact, error: portalError } = await supabase
            .from("contacts")
            .select("id")
            .eq("portal_user_id", user?.id ?? "")
            .limit(1)
            .maybeSingle();

          if (portalError || !portalContact) {
            await supabase.auth.signOut();
            setError("You do not have access to the Constituent Console.");
            return;
          }
          router.replace("/portal/profile");
          router.refresh();
          return;
        }

        router.replace("/staff/dashboard");
        router.refresh();
      }
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
            emailRedirectTo:
              loginMode === "tenant_admin"
                ? `${window.location.origin}/platform/admin/tenants`
                : loginMode === "constituent"
                  ? `${window.location.origin}/portal/profile`
                  : `${window.location.origin}/staff/dashboard`
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
        <CardHeader
          title="Sign in"
          subtitle="Choose a console and sign in."
        />
        <form className="space-y-4" onSubmit={onPasswordSignIn}>
          <div className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Console links
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Link
                href="/platform/admin/tenants"
                className="rounded-md border border-slate-200 px-2 py-1.5 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Tenant Console
              </Link>
              <Link
                href="/staff/dashboard"
                className="rounded-md border border-slate-200 px-2 py-1.5 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Staff Console
              </Link>
              <Link
                href="/portal/profile"
                className="rounded-md border border-slate-200 px-2 py-1.5 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Constituent Console
              </Link>
            </div>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Sign in destination
            </p>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="login-mode"
                  checked={loginMode === "tenant_admin"}
                  onChange={() => setLoginMode("tenant_admin")}
                />
                Tenant Console
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="login-mode"
                  checked={loginMode === "staff"}
                  onChange={() => setLoginMode("staff")}
                />
                Staff Console
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="login-mode"
                  checked={loginMode === "constituent"}
                  onChange={() => setLoginMode("constituent")}
                />
                Constituent Console
              </label>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Username or Email
            </label>
            <Input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              type="text"
              required
              placeholder="IJRebout or you@nonprofit.org"
            />
            <p className="mt-1 text-xs text-slate-500">
              Username values are mapped to @nonprofitcrm.local for test login.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
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
          <div className="text-right">
            <Link href="/forgot-password" className="text-xs font-medium text-brand-700">
              Forgot password?
            </Link>
          </div>
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
