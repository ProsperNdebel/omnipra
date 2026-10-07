import { NextResponse, type NextRequest } from "next/server";
import { VIEWER_COOKIE } from "@/server/viewer-cookie";

/** Give every browser a stable anonymous id. Set on the request too, so the first render already sees it. */
export function middleware(req: NextRequest) {
  if (req.cookies.get(VIEWER_COOKIE)) return NextResponse.next();

  const id = crypto.randomUUID();
  req.cookies.set(VIEWER_COOKIE, id);
  const res = NextResponse.next({ request: { headers: req.headers } });
  res.cookies.set(VIEWER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
