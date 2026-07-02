"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { markPaymentReturn } from "@/lib/chat/session-persist";
import { Loader2 } from "lucide-react";

export default function PaymentReturnClient() {
  const router = useRouter();
  const params = useSearchParams();
  const orderRef = params.get("orderRef") ?? "";

  useEffect(() => {
    if (orderRef) markPaymentReturn(orderRef);
    router.replace(orderRef ? `/?payment=complete&ref=${encodeURIComponent(orderRef)}` : "/");
  }, [orderRef, router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
      <Loader2 className="size-8 animate-spin text-gold-400" />
      <p className="text-sm text-ink-muted">Welcome back — picking up your conversation…</p>
    </div>
  );
}
