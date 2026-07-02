import { Suspense } from "react";
import PaymentReturnClient from "./PaymentReturnClient";

export default function PaymentReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-canvas text-sm text-ink-muted">
          Welcome back…
        </div>
      }
    >
      <PaymentReturnClient />
    </Suspense>
  );
}
