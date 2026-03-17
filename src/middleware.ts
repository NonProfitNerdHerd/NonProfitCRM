import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  try {
    const pathname = request.nextUrl.pathname;
    const protectedPath =
      pathname.startsWith("/staff") ||
      pathname.startsWith("/portal") ||
      pathname.startsWith("/platform");

    if (!protectedPath) {
      return NextResponse.next();
    }

    const { response, user, supabase } = await updateSession(request);
    if (!user || !supabase) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (pathname.startsWith("/portal")) {
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
      const { data: profile } = await supabase
        .from("profiles")
        .select("default_organization_id")
        .eq("id", user.id)
        .maybeSingle();

      let organizationId = profile?.default_organization_id ?? null;

      if (!organizationId) {
        const { data: membership } = await supabase
          .from("organization_memberships")
          .select("organization_id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        organizationId = membership?.organization_id ?? null;
      }

      if (!organizationId) {
        return NextResponse.redirect(new URL("/no-organization", request.url));
      }

      const { data: canViewDashboard } = await supabase.rpc("has_permission", {
        org_id: organizationId,
        permission_key: "can_view_dashboard"
      });

      if (!canViewDashboard) {
        return NextResponse.redirect(new URL("/unauthorized", request.url));
      }
    }

    return response;
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/staff/:path*", "/portal/:path*", "/platform/:path*"]
};
