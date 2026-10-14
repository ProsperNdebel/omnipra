import { NextResponse, type NextRequest } from "next/server";
import { tokenExpiry, type AuthSession } from "@/adapters/auth/gotrue";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  authEnabled,
  goTrue,
  isPublicPath,
  sessionCookieOptions,
} from "@/server/auth-config";
import { VIEWER_COOKIE } from "@/server/viewer-cookie";

/**
 * Every browser gets a stable anonymous id (claimed by the account on first sign in).
 * With sign in on, it also keeps the session fresh and sends signed out visitors to
 * /signin. Cookies are set on the request too, so this render already sees them.
 */
export async function middleware(req: NextRequest) {
  const set: [string, string, number?][] = [];
  if (!req.cookies.get(VIEWER_COOKIE))
    set.push([VIEWER_COOKIE, crypto.randomUUID()]);

  if (authEnabled()) {
    let access = req.cookies.get(ACCESS_COOKIE)?.value;
    const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
    const exp = access ? tokenExpiry(access) : null;
    const needsRefresh =
      !access || !exp || exp - 60 < Date.now() / 1000;

    if (needsRefresh) {
      if (refresh) {
        const fresh: AuthSession | null = await goTrue()
          .refresh(refresh)
          .catch(() => null);
        if (fresh) {
          access = fresh.accessToken;
          set.push(
            [ACCESS_COOKIE, fresh.accessToken],
            [REFRESH_COOKIE, fresh.refreshToken],
          );
        } else {
          access = undefined;
          set.push([ACCESS_COOKIE, "", 0], [REFRESH_COOKIE, "", 0]);
        }
      } else {
        // An expired, malformed or missing access token is not a usable session on
        // its own. Without a refresh token there is no way to recover it, so treat
        // the browser as signed out instead of letting the request reach viewerId()
        // and fail later with an unexpected 401.
        access = undefined;
        set.push([ACCESS_COOKIE, "", 0]);
      }
    }
    const path = req.nextUrl.pathname;

    // A JWT can still look unexpired after its auth user has been deleted or the
    // session has been revoked. For protected routes, verify that Supabase still
    // recognizes it before allowing the request through.
    if (access && !isPublicPath(path)) {
      const user = await goTrue().user(access).catch(() => null);
      if (!user) {
        access = undefined;
        set.push([ACCESS_COOKIE, "", 0], [REFRESH_COOKIE, "", 0]);
      }
    }

    if (!access && !isPublicPath(path)) {
      const res = path.startsWith("/api/")
        ? NextResponse.json(
            { error: "unauthorized", message: "Sign in to continue." },
            { status: 401 },
          )
        : NextResponse.redirect(
            new URL(
              `/signin?next=${encodeURIComponent(path + req.nextUrl.search)}`,
              req.url,
            ),
          );
      return withCookies(res, set);
    }
  }

  if (set.length === 0) return NextResponse.next();
  for (const [k, v, age] of set)
    if (age === 0) req.cookies.delete(k);
    else req.cookies.set(k, v);
  return withCookies(
    NextResponse.next({ request: { headers: req.headers } }),
    set,
  );
}

function withCookies(res: NextResponse, set: [string, string, number?][]) {
  for (const [k, v, age] of set)
    res.cookies.set(k, v, {
      ...sessionCookieOptions(),
      ...(age === 0 ? { maxAge: 0 } : {}),
    });
  return res;
}

export const config = {
  // Icons, the app manifest and share images are public files: no session needed.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|webmanifest|txt)$).*)",
  ],
};
