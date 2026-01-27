import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function redirectTo(prefix: string, req: NextRequest) {
  const url = req.nextUrl.clone();

  // If root, go straight to the section root (REAL redirect so URL changes)
  if (url.pathname === "/") {
    url.pathname = prefix;
    return NextResponse.redirect(url);
  }

  // If they somehow land on the wrong section root (ex: /member on admin),
  // force them back to the right section (REAL redirect)
  const wrongRoots = ["/member", "/admin", "/cashier"];
  for (const root of wrongRoots) {
    if (root !== prefix && (url.pathname === root || url.pathname.startsWith(root + "/"))) {
      const rest = url.pathname.slice(root.length) || "/";
      url.pathname = prefix + (rest === "/" ? "" : rest);
      return NextResponse.redirect(url);
    }
  }

  // If they’re already under the right prefix, allow
  if (url.pathname === prefix || url.pathname.startsWith(prefix + "/")) {
    return NextResponse.next();
  }

  // Otherwise, redirect /whatever -> /prefix/whatever
  url.pathname = prefix + url.pathname;
  return NextResponse.redirect(url);
}

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();

  if (host.startsWith("admin.")) return redirectTo("/admin", req);
  if (host.startsWith("cashier.")) return redirectTo("/cashier", req);
  if (host.startsWith("app.")) return redirectTo("/member", req);

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)"],
};
