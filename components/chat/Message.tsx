"use client";

import type { UIMessage } from "ai";
import { RukaAvatar } from "@/components/brand/RukaAvatar";
import { ProductCarousel } from "@/components/products/ProductCarousel";
import { ProductCard } from "@/components/products/ProductCard";
import { ChatCheckoutCard } from "@/components/chat/ChatCheckoutCard";
import { YouTubeCard, type YouTubeVideo } from "@/components/chat/YouTubeCard";
import { GiftMessageCard } from "@/components/gift-message/GiftMessageCard";
import { useRukaChat } from "@/components/chat/ChatContext";
import { Badge } from "@/components/ui/Badge";
import { useCommerce } from "@/lib/commerce/store";
import type {
  DeliveryCity,
  DeliveryQuote,
  GiftDetails,
  Product,
  TrackedOrder,
} from "@/lib/commerce/types";
import { cn, formatMoney } from "@/lib/utils";
import { formatHumanDate } from "@/lib/commerce/dates";
import { stripProductEcho } from "@/lib/chat/stripProductEcho";
import { parseModeSignal, stripModeSignal, type AgentMode } from "@/lib/agent/modes";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  MapPin,
  PackageCheck,
  Truck,
  Sparkles,
  Video,
} from "lucide-react";

const TOOL_PENDING_LABEL: Record<string, string> = {
  "tool-searchGifts": "Finding gifts…",
  "tool-getGiftDetails": "Pulling up the details…",
  "tool-checkDelivery": "Checking delivery…",
  "tool-findDeliveryCities": "Looking up delivery areas…",
  "tool-listOccasions": "Browsing occasions…",
  "tool-trackOrder": "Tracking your order…",
  "tool-searchYouTubeVideos": "Finding videos…",
  "tool-visualizeProduct": "Generating a visual…",
  "tool-showCheckoutForm": "Opening checkout…",
  "tool-suggestGiftMessage": "Writing your gift message…",
  "tool-optimizeBudget": "Mapping out your options…",
  "tool-addToCart": "Adding to your basket…",
  "tool-removeFromCart": "Updating your basket…",
  // silent tools below are intentionally omitted
};

// Tool types that should render nothing at all in the thread.
const SILENT_TOOLS = new Set([
  "tool-updateBuyerProfile",
  "tool-updateCheckoutDetails",
  "tool-rememberRecipientDislike",
  "tool-setPriceAlert",
]);

function ModeBadge({ mode }: { mode: AgentMode }) {
  if (mode === "TRACK") {
    return (
      <Badge tone="forest" className="mb-1 gap-1">
        <PackageCheck className="size-3" />
        Order tracking
      </Badge>
    );
  }
  return null;
}

function MessageText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => (
        <p key={i} className={cn(i > 0 && "mt-2")}>
          {block.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
            seg.startsWith("**") && seg.endsWith("**") ? (
              <strong key={j} className="font-semibold">
                {seg.slice(2, -2)}
              </strong>
            ) : (
              <span key={j}>{seg}</span>
            ),
          )}
        </p>
      ))}
    </>
  );
}

function ToolPending({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-muted">
      <span className="flex gap-1">
        <span className="typing-dot size-1.5 rounded-full bg-gold-400" />
        <span className="typing-dot size-1.5 rounded-full bg-gold-400" style={{ animationDelay: "0.2s" }} />
        <span className="typing-dot size-1.5 rounded-full bg-gold-400" style={{ animationDelay: "0.4s" }} />
      </span>
      {label}
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function DeliveryQuoteCard({ quote }: { quote: DeliveryQuote }) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3.5",
        quote.available
          ? "border-brand-500/30 bg-brand-500/10"
          : "border-rose-500/30 bg-rose-500/10",
      )}
    >
      <div className="flex items-center gap-2">
        <Truck className={cn("size-4", quote.available ? "text-brand-400" : "text-rose-300")} />
        <span className="font-medium text-ink">
          {quote.available ? "Delivery available" : "Not deliverable"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3 sm:gap-2">
        <div>
          <div className="text-[11px] text-ink-faint">City</div>
          <div className="text-ink">{quote.city}</div>
        </div>
        <div>
          <div className="text-[11px] text-ink-faint">Date</div>
          <div className="text-ink">{formatHumanDate(quote.date)}</div>
        </div>
        <div>
          <div className="text-[11px] text-ink-faint">Delivery fee</div>
          <div className="font-semibold text-gold-300">
            {quote.available ? formatMoney(quote.rate, quote.currency) : "—"}
          </div>
        </div>
      </div>
      {quote.perishableWarning && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-gold-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {quote.perishableWarning}
        </div>
      )}
    </div>
  );
}

function CityResults({ cities }: { cities: DeliveryCity[] }) {
  if (!cities.length) {
    return <ErrorNote text="I couldn't find that as a delivery city. Want to try a nearby town?" />;
  }
  return (
    <div className="rounded-2xl border border-line bg-canvas-2 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-ink-muted">
        <MapPin className="size-3.5 text-brand-400" /> We deliver to these:
      </div>
      <div className="flex flex-wrap gap-1.5">
        {cities.slice(0, 10).map((c) => (
          <Badge key={c.name} tone="forest">
            {c.name}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function TrackedOrderCard({ order }: { order: TrackedOrder }) {
  return (
    <div className="rounded-2xl border border-line bg-canvas-2 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PackageCheck className="size-4 text-brand-400" />
          <span className="font-medium text-ink">Order {order.orderNumber}</span>
        </div>
        <Badge tone="gold">{order.statusDisplay || order.status}</Badge>
      </div>
      <div className="mt-3 space-y-2">
        {order.progress.map((p, i) => (
          <div key={i} className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-center sm:gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 shrink-0 text-brand-400" />
              <span className="text-ink">{p.step}</span>
            </div>
            <span className="text-xs text-ink-faint sm:ml-auto">{p.timestamp}</span>
          </div>
        ))}
      </div>
      {order.items.length > 0 && (
        <div className="mt-3 border-t border-line pt-2 text-xs text-ink-muted">
          {order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
        </div>
      )}
      {(order.hasDeliveryPhoto || order.hasDeliveryVideo) && (
        <div className="mt-2 flex items-center gap-2">
          {order.hasDeliveryPhoto && (
            <span className="inline-flex items-center gap-1 rounded-full border border-brand-400/30 bg-brand-500/10 px-2 py-0.5 text-[11px] font-medium text-brand-400">
              <Camera className="size-3" /> Delivery photo available
            </span>
          )}
          {order.hasDeliveryVideo && (
            <span className="inline-flex items-center gap-1 rounded-full border border-gold-400/30 bg-gold-500/10 px-2 py-0.5 text-[11px] font-medium text-gold-300">
              <Video className="size-3" /> Delivery video available
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function asCard(p: GiftDetails | Product): Product {
  return p as Product;
}

function VisualizeProductCard({
  imageUrl,
  description,
}: {
  imageUrl: string;
  description: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-canvas-2">
      <div className="relative">
        <img
          src={imageUrl}
          alt={description}
          className="w-full object-cover"
          style={{ maxHeight: "320px" }}
        />
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-gold-400/30 bg-canvas/80 px-2.5 py-1 text-xs font-medium text-gold-300 backdrop-blur-sm">
          <Sparkles className="size-3" />
          AI-generated visual
        </div>
      </div>
      <div className="px-4 py-3">
        <p className="text-sm text-ink-muted">{description}</p>
      </div>
    </div>
  );
}

interface BudgetStrategy {
  label: string;
  description: string;
  approach: "single" | "combo";
  searches: Array<{ maxPrice: number; occasionId?: string; sort: string }>;
}

function BudgetOptimizerCard({
  budget,
  strategies,
}: {
  budget: number;
  strategies: BudgetStrategy[];
}) {
  const { sendText } = useRukaChat();
  return (
    <div className="rounded-2xl border border-line bg-canvas-2 p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <Sparkles className="size-3.5 text-gold-400" />
        <span className="text-[12px] font-semibold text-ink-muted uppercase tracking-wide">
          Best ways to spend LKR {budget.toLocaleString()}
        </span>
      </div>
      <div className="space-y-2">
        {strategies.map((s) => (
          <button
            key={s.label}
            onClick={() =>
              sendText(
                s.approach === "combo"
                  ? `Let's go with the "${s.label}" option — show me both parts`
                  : `Let's go with "${s.label}" — show me options`,
              )
            }
            className="block w-full rounded-xl border border-line bg-canvas p-2.5 text-left transition hover:border-brand-400/40 hover:bg-brand-500/5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink">{s.label}</span>
              {s.approach === "combo" && (
                <span className="rounded-full bg-gold-500/15 px-2 py-0.5 text-[10px] font-semibold text-gold-300">
                  COMBO
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{s.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function SuggestGiftMessageResult({ message }: { message: string }) {
  const { sendText } = useRukaChat();
  return (
    <GiftMessageCard
      message={message}
      source="ai"
      variant="chat"
      onTweak={() =>
        sendText(
          `Can you tweak the gift message? Right now it says: "${message.trim()}". I'd like something a bit different.`,
        )
      }
    />
  );
}

export function Message({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const setActiveSet = useCommerce((s) => s.setActiveSet);

  const hasProductCards = message.parts.some((part) => {
    if (!("state" in part) || part.state !== "output-available") return false;
    if (part.type === "tool-searchGifts") {
      const out = part.output as { ok?: boolean; products?: Product[] };
      return Boolean(out?.ok && out.products?.length);
    }
    if (part.type === "tool-getGiftDetails") {
      const out = part.output as { ok?: boolean; product?: Product };
      return Boolean(out?.ok && out.product);
    }
    return false;
  });

  if (isUser) {
    const text = message.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n");
    const images = message.parts
      .filter((p) => p.type === "file" && (p as { mediaType?: string }).mediaType?.startsWith("image/"))
      .map((p) => (p as { url: string }).url);

    if (!text.trim() && !images.length) return null;
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] space-y-2">
          {images.map((src, i) => (
            <div key={i} className="flex justify-end">
              <img
                src={src}
                alt="Uploaded image"
                className="max-h-60 max-w-full rounded-2xl object-cover shadow-sm"
              />
            </div>
          ))}
          {text.trim() && (
            <div className="rounded-3xl rounded-br-lg bg-brand-700 px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-sm">
              <MessageText text={text} />
            </div>
          )}
        </div>
      </div>
    );
  }

  const assistantMode = message.parts.reduce<AgentMode | null>((found, part) => {
    if (found) return found;
    if (part.type === "text") {
      const { mode } = parseModeSignal((part as { text: string }).text);
      return mode ?? found;
    }
    if (
      part.type === "tool-trackOrder" &&
      "state" in part &&
      part.state === "output-available"
    ) {
      return "TRACK";
    }
    return found;
  }, null);

  const avatarVariant = assistantMode === "TRACK" ? "track" : "chat";

  return (
    <div className="flex gap-3">
      <RukaAvatar size={34} variant={avatarVariant} className="mt-0.5 shrink-0" glow />
      <div className="min-w-0 flex-1 space-y-2.5">
        {message.parts.map((part, idx) => {
          // Plain text
          if (part.type === "text") {
            const rawText = part.text;
            const { mode } = parseModeSignal(rawText);
            const displayText = stripModeSignal(
              hasProductCards ? stripProductEcho(rawText) : rawText,
            );
            if (!displayText.trim()) return null;
            return (
              <div key={idx} className="max-w-prose space-y-1">
                {mode && <ModeBadge mode={mode} />}
                <div className="text-[15px] leading-relaxed text-ink">
                  <MessageText text={displayText} />
                </div>
              </div>
            );
          }

          // Tool calls
          if (typeof part.type === "string" && part.type.startsWith("tool-")) {
            // Silent tools never render anything — they only update client state.
            if (SILENT_TOOLS.has(part.type)) return null;

            const toolPart = part as {
              type: string;
              state?: string;
              output?: unknown;
            };
            const state = toolPart.state;

            if (state === "input-streaming" || state === "input-available") {
              return (
                <ToolPending
                  key={idx}
                  label={TOOL_PENDING_LABEL[part.type] ?? "Working on it…"}
                />
              );
            }

            if (state === "output-error") {
              return (
                <ErrorNote key={idx} text="That didn't go through — mind trying once more?" />
              );
            }

            if (state === "output-available") {
              const out = toolPart.output as Record<string, unknown> & { ok?: boolean };

              if (part.type === "tool-searchGifts") {
                if (!out?.ok) {
                  return (
                    <ErrorNote
                      key={idx}
                      text={(out?.error as string) ?? "I couldn't find anything for that."}
                    />
                  );
                }
                const products = (out.products as Product[]) ?? [];
                if (!products.length) {
                  // Agent text carries the steer — avoid robotic duplicate UI copy.
                  return null;
                }
                return (
                  <ProductCarousel
                    key={idx}
                    products={products}
                    note={out.note as string | undefined}
                    source={out.source as "live" | "seed" | undefined}
                  />
                );
              }

              if (part.type === "tool-getGiftDetails") {
                if (!out?.ok) return <ErrorNote key={idx} text={(out?.error as string) ?? "Couldn't load that."} />;
                const product = out.product as GiftDetails;
                return (
                  <div key={idx} className="w-40 sm:w-44">
                    <ProductCard product={asCard(product)} />
                  </div>
                );
              }

              if (part.type === "tool-checkDelivery") {
                if (!out?.ok) return <ErrorNote key={idx} text={(out?.error as string) ?? "Couldn't check delivery."} />;
                return <DeliveryQuoteCard key={idx} quote={out.quote as DeliveryQuote} />;
              }

              if (part.type === "tool-findDeliveryCities") {
                if (!out?.ok) return <ErrorNote key={idx} text={(out?.error as string) ?? "Couldn't look that up."} />;
                return <CityResults key={idx} cities={(out.cities as DeliveryCity[]) ?? []} />;
              }

              if (part.type === "tool-trackOrder") {
                if (!out?.ok) return <ErrorNote key={idx} text={(out?.error as string) ?? "I couldn't find that order."} />;
                return <TrackedOrderCard key={idx} order={out.order as TrackedOrder} />;
              }

              if (part.type === "tool-listOccasions") {
                const occasions = (out.occasions as Array<{ id: string; label: string; emoji: string }>) ?? [];
                return (
                  <div key={idx} className="flex flex-wrap gap-1.5">
                    {occasions.map((o) => (
                      <button
                        key={o.id}
                        onClick={() =>
                          setActiveSet({
                            title: `${o.emoji} ${o.label}`,
                            products: [],
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas-2 px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
                      >
                        <span>{o.emoji}</span>
                        {o.label}
                      </button>
                    ))}
                  </div>
                );
              }

              if (part.type === "tool-optimizeBudget") {
                if (!out?.ok) return null;
                return (
                  <BudgetOptimizerCard
                    key={idx}
                    budget={out.budget as number}
                    strategies={(out.strategies as BudgetStrategy[]) ?? []}
                  />
                );
              }

              if (part.type === "tool-searchYouTubeVideos") {
                if (!out?.ok) {
                  return (
                    <ErrorNote
                      key={idx}
                      text={(out?.error as string) ?? "Couldn't load videos for that."}
                    />
                  );
                }
                return (
                  <YouTubeCard
                    key={idx}
                    videos={(out.videos as YouTubeVideo[]) ?? []}
                    contextNote={(out.contextNote as string) ?? "Here are some relevant videos"}
                  />
                );
              }

              if (part.type === "tool-visualizeProduct") {
                if (!out?.ok) {
                  return (
                    <ErrorNote
                      key={idx}
                      text={(out?.error as string) ?? "Couldn't generate a visual for that."}
                    />
                  );
                }
                return (
                  <VisualizeProductCard
                    key={idx}
                    imageUrl={out.imageUrl as string}
                    description={out.description as string}
                  />
                );
              }

              if (part.type === "tool-showCheckoutForm") {
                if (!out?.ok) {
                  return <ErrorNote key={idx} text="Couldn't open checkout — try again?" />;
                }
                return (
                  <ChatCheckoutCard
                    key={idx}
                    initialStep={out.step as "review" | "collect" | "confirm" | "payment"}
                    highlightFields={(out.highlightFields as string[]) ?? []}
                  />
                );
              }

              if (part.type === "tool-suggestGiftMessage") {
                if (!out?.ok) {
                  return (
                    <ErrorNote
                      key={idx}
                      text={(out?.error as string) ?? "Couldn't write a message for that."}
                    />
                  );
                }
                return (
                  <SuggestGiftMessageResult
                    key={idx}
                    message={out.message as string}
                  />
                );
              }

              if (part.type === "tool-addToCart") {
                if (!out?.ok) {
                  return (
                    <ErrorNote
                      key={idx}
                      text={(out?.error as string) ?? "Couldn't add that to your basket."}
                    />
                  );
                }
                return null;
              }

              if (part.type === "tool-removeFromCart") {
                if (!out?.ok) {
                  return (
                    <ErrorNote
                      key={idx}
                      text={(out?.error as string) ?? "Couldn't remove that from your basket."}
                    />
                  );
                }
                return null;
              }
            }
            return null;
          }

          return null;
        })}
      </div>
    </div>
  );
}
