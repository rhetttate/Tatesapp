import type { MetadataRoute } from "next";

// Public storefront is indexable; staff/admin areas are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/cashier", "/reset"],
    },
  };
}
