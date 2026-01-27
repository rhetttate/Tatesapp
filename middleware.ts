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

function withDebug(res: NextResponse, host: string, pathname: string) {
  res.headers.set("x-debug-host", host);
  res.headers.set("x-debug-path", pathname);
  return res;
}

function rewriteTo(prefix: string, req: NextRequest, host: string) {
  const url = req.nextUrl.clone();

  if (url.pathname === "/") {
    url.pathname = prefix;
    return withDebug(NextResponse.rewrite(url), host, url.pathname);
  }

  if (url.pathname === prefix || url.pathname.startsWith(prefix + "/")) {
    return withDebug(NextResponse.next(), host, url.pathname);
  }

  url.pathname = prefix + url.pathname;
  return withDebug(NextResponse.rewrite(url), host, url.pathname);
}

export function middleware(req: NextRequest) {
  const host = getHost(req);

  // IMPORTANT: match exact subdomains (not startsWith)
  if (host === "admin.tatessupermarket.com") return rewriteTo("/admin", req, host);
  if (host === "cashier.tatessupermarket.com") return rewriteTo("/cashier", req, host);
  if (host === "app.tatessupermarket.com") return rewriteTo("/member", req, host);

  // if someone uses other domains, do nothing
  return withDebug(NextResponse.next(), host, req.nextUrl.pathname);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)"],
};
