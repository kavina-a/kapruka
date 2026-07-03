"use client";

import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { BrandMascot } from "@/components/brand/BrandMascot";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useCommerce } from "@/lib/commerce/store";
import { trackOrderAction } from "@/app/actions";
import type { TrackedOrder } from "@/lib/commerce/types";
import { CheckCircle2, MapPin, PackageSearch, Truck } from "lucide-react";

export function TrackDrawer() {
  const open = useCommerce((s) => s.trackOpen);
  const close = useCommerce((s) => s.closeTrack);
  const [num, setNum] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<TrackedOrder | null>(null);

  const lookup = async () => {
    if (!num.trim()) return;
    setLoading(true);
    setError(null);
    setOrder(null);
    const res = await trackOrderAction(num.trim());
    setLoading(false);
    if (res.ok) setOrder(res.data);
    else setError(res.error);
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      title={
        <div className="flex items-center gap-3">
          <BrandMascot variant="track" size={36} />
          <span>Track an order</span>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <div className="flex justify-center py-2">
          <BrandMascot variant="track" className="h-28 w-auto" />
        </div>
        <p className="text-sm text-ink-muted">
          Hi — I&apos;m on the tracking side of ChatRuka. Enter your Kapruka order number from
          your confirmation email and I&apos;ll tell you where things stand.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={num}
            onChange={(e) => setNum(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
            placeholder="Order number"
            className="flex-1 rounded-xl border border-line bg-canvas-2 px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-gold-400 focus:outline-none"
          />
          <Button variant="gold" loading={loading} onClick={lookup} icon={<PackageSearch className="size-4" />} className="shrink-0">
            Track
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </div>
        )}

        {order && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-line bg-canvas-2 p-4">
              <div>
                <div className="text-xs text-ink-faint">Order {order.orderNumber}</div>
                <div className="font-display text-lg text-ink">{order.statusDisplay || order.status}</div>
              </div>
              <Badge tone="gold">{order.amount ? `Rs ${order.amount}` : ""}</Badge>
            </div>

            <div className="rounded-2xl border border-line bg-canvas-2 p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
                <Truck className="size-3.5" /> Progress
              </div>
              <div className="space-y-2">
                {order.progress.length ? (
                  order.progress.map((p, i) => (
                    <div key={i} className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="size-3.5 shrink-0 text-brand-400" />
                        <span className="text-ink">{p.step}</span>
                      </div>
                      <span className="text-xs text-ink-faint sm:ml-auto">{p.timestamp}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-ink-muted">No status updates yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-canvas-2 p-4 text-sm">
              <div className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
                <MapPin className="size-3.5" /> Recipient
              </div>
              <div className="text-ink">{order.recipient.name}</div>
              <div className="text-ink-muted">
                {order.recipient.address}, {order.recipient.city}
              </div>
              <div className="mt-1 text-ink-muted">Delivery: {order.deliveryDate}</div>
            </div>

            {order.items.length > 0 && (
              <div className="rounded-2xl border border-line bg-canvas-2 p-4 text-sm text-ink-muted">
                {order.items.map((i) => (
                  <div key={i.productId} className="flex justify-between py-0.5">
                    <span>
                      {i.quantity}× {i.name}
                    </span>
                    <span>Rs {i.sellingPrice}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
