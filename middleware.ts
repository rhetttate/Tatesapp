import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function getHost(req: NextRequest) {
  const raw =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    req.nextUrl.host ||
    "";

  // sometimes x-forwarded-host can be "admin...., somethingelse"
  return raw.split(",")[0].trim().toLowerCase();
}

function rewriteTo(prefix: string, req: NextRequest) {
  const url = req.nextUrl.clone();

  if (url.pathname === "/") {
    url.pathname = prefix;
    return NextResponse.rewrite(url);
  }

  if (url.pathname === prefix || url.pathname.startsWith(prefix + "/")) {
    return NextResponse.next();
  }

  url.pathname = prefix + url.pathname;
  return NextResponse.rewrite(url);
}

export function middleware(req: NextRequest) {
  const host = getHost(req);

  // IMPORTANT: match exact subdomains (not startsWith)
  if (host === "admin.tatessupermarket.com") return rewriteTo("/admin", req);
  if (host === "cashier.tatessupermarket.com") return rewriteTo("/cashier", req);
  if (host === "app.tatessupermarket.com") return rewriteTo("/member", req);

  // if someone uses other domains, do nothing
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)"],
};
