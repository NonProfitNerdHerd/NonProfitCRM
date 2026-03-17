import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const tenantPathPattern = /^\/([^/]+)\/(staff|portal)(\/.*)?$/;

export async function middleware(request: NextRequest) {
  try {
    const pathname = request.nextUrl.pathname;
    if (pathname === "/platform/login") {
      return NextResponse.next();
    }

    const tenantMatch = pathname.match(tenantPathPattern);
    const protectedPath =
      pathname.startsWith("/staff") ||
      pathname.startsWith("/portal") ||
      pathname.startsWith("/platform") ||
      Boolean(tenantMatch);

    if (!protectedPath) {
      return NextResponse.next();
    }

    const { response, user, supabase } = await updateSession(request);
    if (!user || !supabase) {
      if (pathname.startsWith("/platform")) {
        return NextResponse.redirect(new URL("/platform/login", request.url));
      }
      if (tenantMatch) {
        const tenantSlug = tenantMatch[1];
        const area = tenantMatch[2];
        const loginMode = area === "portal" ? "constituent" : "staff";
        return NextResponse.redirect(new URL(`/login?tenant=${tenantSlug}&mode=${loginMode}`, request.url));
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("default_organization_id")
      .eq("id", user.id)
      .maybeSingle();

    let defaultOrganizationId = profile?.default_organization_id ?? null;

    if (!defaultOrganizationId) {
      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      defaultOrganizationId = membership?.organization_id ?? null;
    }

    if (tenantMatch) {
      const tenantSlug = tenantMatch[1];
      const area = tenantMatch[2];
      const remainder = tenantMatch[3] ?? "";
      const { data: organization } = await supabase
        .from("organizations")
        .select("id,slug")
        .eq("slug", tenantSlug)
        .maybeSingle();

      if (!organization?.id) {
        return NextResponse.redirect(new URL("/no-organization", request.url));
      }

      if (area === "portal") {
        const { data: portalContact } = await supabase
          .from("contacts")
          .select("id")
          .eq("organization_id", organization.id)
          .eq("portal_user_id", user.id)
          .limit(1)
          .maybeSingle();
        if (!portalContact) {
          return NextResponse.redirect(new URL("/unauthorized", request.url));
        }
      } else {
        const { data: canViewDashboard } = await supabase.rpc("has_permission", {
          org_id: organization.id,
          permission_key: "can_view_dashboard"
        });
        if (!canViewDashboard) {
          return NextResponse.redirect(new URL("/unauthorized", request.url));
        }
      }

      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-tenant-id", String(organization.id));
      requestHeaders.set("x-tenant-slug", String(organization.slug));
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = `/${area}${remainder}`;
      const rewritten = NextResponse.rewrite(rewriteUrl, {
        request: {
          headers: requestHeaders
        }
      });
      rewritten.cookies.set("active_tenant_id", String(organization.id), { path: "/" });
      rewritten.cookies.set("active_tenant_slug", String(organization.slug), { path: "/" });
      return rewritten;
    }

    if (pathname.startsWith("/portal")) {
      if (!defaultOrganizationId) {
        const { data: portalContact } = await supabase
          .from("contacts")
          .select("organization_id")
          .eq("portal_user_id", user.id)
          .limit(1)
          .maybeSingle();
        defaultOrganizationId = portalContact?.organization_id ?? null;
      }
      if (!defaultOrganizationId) {
        return NextResponse.redirect(new URL("/no-organization", request.url));
      }
      const { data: organization } = await supabase
        .from("organizations")
        .select("id,slug")
        .eq("id", defaultOrganizationId)
        .maybeSingle();
      if (organization?.slug) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = `/${organization.slug}${pathname}`;
        const redirected = NextResponse.redirect(redirectUrl);
        redirected.cookies.set("active_tenant_id", String(organization.id), { path: "/" });
        redirected.cookies.set("active_tenant_slug", String(organization.slug), { path: "/" });
        return redirected;
      }
      const { data: portalContact } = await supabase
        .from("contacts")
        .select("id")
        .eq("portal_user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!portalContact) {
        return NextResponse.redirect(new URL("/unauthorized", request.url));
      }
    }

    if (pathname.startsWith("/platform")) {
      const { data: membership } = await supabase
        .from("platform_admin_memberships")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!membership) {
        return NextResponse.redirect(new URL("/unauthorized", request.url));
      }
      return response;
    }

    if (pathname.startsWith("/staff")) {
      if (!defaultOrganizationId) {
        return NextResponse.redirect(new URL("/no-organization", request.url));
      }
      const { data: organization } = await supabase
        .from("organizations")
        .select("id,slug")
        .eq("id", defaultOrganizationId)
        .maybeSingle();
      if (organization?.slug) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = `/${organization.slug}${pathname}`;
        const redirected = NextResponse.redirect(redirectUrl);
        redirected.cookies.set("active_tenant_id", String(organization.id), { path: "/" });
        redirected.cookies.set("active_tenant_slug", String(organization.slug), { path: "/" });
        return redirected;
      }

      const { data: canViewDashboard } = await supabase.rpc("has_permission", {
        org_id: defaultOrganizationId,
        permission_key: "can_view_dashboard"
      });

      if (!canViewDashboard) {
        return NextResponse.redirect(new URL("/unauthorized", request.url));
      }
    }

    return response;
  } catch {
    if (request.nextUrl.pathname.startsWith("/platform")) {
      return NextResponse.redirect(new URL("/platform/login", request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: [
    "/staff/:path*",
    "/portal/:path*",
    "/platform/:path*",
    "/:tenantSlug/staff/:path*",
    "/:tenantSlug/portal/:path*"
  ]
};
