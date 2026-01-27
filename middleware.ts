import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function rewriteTo(prefix: string, req: NextRequest) {
  const url = req.nextUrl.clone();

  if (url.pathname === "/") {
    url.pathname = prefix;
    return NextResponse.rewrite(url);
  }

  if (url.pathname.startsWith(prefix)) {
    return NextResponse.next();
  }

  url.pathname = prefix + url.pathname;
  return NextResponse.rewrite(url);
}

export function middleware(req: NextRequest) {
  const host = (
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    ""
  ).toLowerCase();

  if (host.startsWith("admin.")) return rewriteTo("/admin", req);
  if (host.startsWith("cashier.")) return rewriteTo("/cashier", req);
  if (host.startsWith("app.")) return rewriteTo("/member", req);

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)"],
};
