import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function rewriteTo(prefix: string, req: NextRequest) {
  const url = req.nextUrl.clone();

  // If they hit the subdomain root, send them to the section root
  if (url.pathname === "/") {
    url.pathname = prefix;
    return NextResponse.rewrite(url);
  }

  // If they're already in that section, do nothing
  if (url.pathname === prefix || url.pathname.startsWith(prefix + "/")) {
    return NextResponse.next();
  }

  // Otherwise, prefix their path (so /sale becomes /cashier/sale, etc.)
  url.pathname = prefix + url.pathname;
  return NextResponse.rewrite(url);
}

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();

  // subdomain -> app section mapping
  if (host.startsWith("admin.")) return rewriteTo("/admin", req);
  if (host.startsWith("cashier.")) return rewriteTo("/cashier", req);

  // app.tatessupermarket.com -> main public site (no rewrite)
  // If you want app.* to go to /member instead, see note below.
  if (host.startsWith("app.")) return rewriteTo("/member", req);

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)"],
};
