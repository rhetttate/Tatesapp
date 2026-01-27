import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function forcePrefix(prefix: string, req: NextRequest) {
  const url = req.nextUrl.clone();

  // If they hit the subdomain root, go to the section root
  if (url.pathname === "/") {
    url.pathname = prefix;
    return NextResponse.rewrite(url);
  }

  // If they accidentally land on /member (or any other wrong section), force to the correct one
  const wrongRoots = ["/member", "/admin", "/cashier"];
  for (const root of wrongRoots) {
    if (root !== prefix && (url.pathname === root || url.pathname.startsWith(root + "/"))) {
      // Strip the wrong root and apply the correct one
      const rest = url.pathname.slice(root.length) || "/";
      url.pathname = prefix + (rest === "/" ? "" : rest);
      return NextResponse.rewrite(url);
    }
  }

  // If they’re already in the right section, do nothing
  if (url.pathname === prefix || url.pathname.startsWith(prefix + "/")) {
    return NextResponse.next();
  }

  // Otherwise prefix their path
  url.pathname = prefix + url.pathname;
  return NextResponse.rewrite(url);
}

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();

  // IMPORTANT: admin/cashier first
  if (host.startsWith("admin.")) return forcePrefix("/admin", req);
  if (host.startsWith("cashier.")) return forcePrefix("/cashier", req);

  // app subdomain goes to member
  if (host.startsWith("app.")) return forcePrefix("/member", req);

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)"],
};
