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
  // ✅ On Vercel the real host is often in x-forwarded-host
  const host =
    (req.headers.get("x-forwarded-host") ??
      req.headers.get("host") ??
      "")
      .toLowerCase()
      .split(",")[0]        // in case multiple hosts are present
      .trim()
      .split(":")[0];       // strip port

  // subdomain -> app section mapping
  if (host.startsWith("admin.")) return rewriteTo("/admin", req);
  if (host.startsWith("cashier.")) return rewriteTo("/cashier", req);

  // app.tatessupermarket.com -> member page
  if (host.startsWith("app.")) return rewriteTo("/member", req);

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)"],
};

