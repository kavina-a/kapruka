"use client";

import { Header } from "./Header";
import { LeftRail } from "./LeftRail";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ProductTray } from "@/components/products/ProductTray";
import { ProductDragOverlay } from "@/components/products/ProductDragOverlay";
import { ProductDetailOverlay } from "@/components/products/ProductDetailOverlay";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { CheckoutDrawer } from "@/components/checkout/CheckoutDrawer";
import { ToastProvider } from "@/components/ui/Toast";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";

export function AppShell() {
  return (
    <ToastProvider>
      <OnboardingGate>
        <div className="flex h-dvh flex-col overflow-hidden">
          <Header />

          {/*
            Three-column shell:
              [LeftRail 56px] [Chat flex-1 min-w-0] [ProductTray 352px slide-in]
            On mobile the tray is a bottom-sheet overlay, not in-flow.
          */}
          <main className="relative flex min-h-0 flex-1 overflow-hidden">
            <LeftRail />
            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              <ChatPanel />
            </section>
            <ProductTray />
          </main>

          {/* Overlays */}
          <ProductDetailOverlay />
          <CartDrawer />
          <CheckoutDrawer />

          {/* Global drag ghost — follows the cursor when a tray card is being dragged */}
          <ProductDragOverlay />
        </div>
      </OnboardingGate>
    </ToastProvider>
  );
}
