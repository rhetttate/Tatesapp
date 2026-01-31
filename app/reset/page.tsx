import { Suspense } from "react";
import ResetClient from "./ResetClient";

export const dynamic = "force-dynamic";

export default function ResetPage() {
  return (
    <Suspense fallback={<div style={{ padding: 18 }}>Loading…</div>}>
      <ResetClient />
    </Suspense>
  );
}
