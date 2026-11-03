import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import {
  ONBOARDED_COOKIE,
  ONBOARDED_TTL_SECONDS,
  signOnboardedCookie,
  verifyOnboardedCookie,
} from "@/lib/auth/onboarding-cookie";
import { env } from "@/lib/config/env";

const PUBLIC_ROUTES = ["/login", "/signup", "/forgot-password"];
const ONBOARDING_ROUTE = "/onboarding";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: do nothing between createServerClient and getClaims.
  // Supabase docs say breaking this can cause hard-to-debug session bugs.
  //
  // getClaims() refreshes an expired session (writing the new cookies via
  // setAll above) and then verifies the JWT locally against the project's
  // public signing key — no round trip to Supabase Auth on every request,
  // unlike getUser(). See getAuthUser() in lib/auth/session.ts for the
  // security trade-off (same as the database's own RLS check).
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub ?? null;
  const user = userId ? { id: userId } : null;

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.includes(pathname);
  const isOnboarding = pathname === ONBOARDING_ROUTE;

  // No session + private route → bounce to /login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Already signed in + on an auth page → bounce home (the onboarding gate
  // below will redirect to /onboarding if they're not done yet).
  if (user && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Onboarding gate. A signed cookie remembers "finished" for a while so this
  // doesn't cost a database query on every request (see onboarding-cookie.ts).
  if (user && !isPublic) {
    const remembered = await verifyOnboardedCookie(
      request.cookies.get(ONBOARDED_COOKIE)?.value,
      user.id,
    );
    if (remembered) return supabaseResponse;

    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_complete")
      .eq("id", user.id)
      .maybeSingle();

    const onboardingComplete = profile?.onboarding_complete ?? false;

    if (onboardingComplete) {
      const value = await signOnboardedCookie(user.id);
      if (value) {
        supabaseResponse.cookies.set(ONBOARDED_COOKIE, value, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: env.APP_ENV !== "development",
          maxAge: ONBOARDED_TTL_SECONDS,
        });
      }
    }

    // Not done with onboarding + trying to access anything other than the
    // onboarding page → bounce to /onboarding.
    if (!onboardingComplete && !isOnboarding) {
      const url = request.nextUrl.clone();
      url.pathname = ONBOARDING_ROUTE;
      const redirect = NextResponse.redirect(url);
      redirect.cookies.delete(ONBOARDED_COOKIE);
      return redirect;
    }

    // Note: completed users are intentionally allowed onto /onboarding so they
    // can add an additional organization (or join one with a key).
  }

  return supabaseResponse;
}
