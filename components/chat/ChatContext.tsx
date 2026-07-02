"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { FileUIPart } from "ai";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useCommerce } from "@/lib/commerce/store";
import type { CommerceContext, LocationType, Product } from "@/lib/commerce/types";
import {
  consumePaymentReturn,
  loadChatSession,
  saveChatSession,
} from "@/lib/chat/session-persist";

type ChatHelpers = ReturnType<typeof useChat>;

interface ChatContextValue {
  messages: ChatHelpers["messages"];
  status: ChatHelpers["status"];
  error: ChatHelpers["error"];
  stop: ChatHelpers["stop"];
  sendText: (text: string) => void;
  /** Send a message that may include image files for vision / reverse search. */
  sendWithFiles: (text: string, files: FileUIPart[]) => void;
  /** Start a fresh gift — clears the conversation thread. */
  reset: () => void;
}

const ChatCtx = createContext<ChatContextValue | null>(null);

interface SearchOutput {
  ok: boolean;
  source?: "live" | "seed";
  note?: string;
  occasion?: { id: string; label: string; emoji: string } | null;
  products?: Product[];
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const userProfile = useCommerce((s) => s.userProfile);
  const cart = useCommerce((s) => s.cart);
  const cartSubtotal = useCommerce((s) => s.cartSubtotal);
  const delivery = useCommerce((s) => s.delivery);
  const sender = useCommerce((s) => s.sender);
  const giftMessage = useCommerce((s) => s.giftMessage);
  const giftMessageSource = useCommerce((s) => s.giftMessageSource);
  const chatCheckoutStep = useCommerce((s) => s.chatCheckoutStep);
  const activeSet = useCommerce((s) => s.activeSet);
  const savedRecipients = useCommerce((s) => s.savedRecipients);

  const recipientDislikes = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const r of savedRecipients) {
      if (r.dislikes?.length) map[r.name.toLowerCase()] = r.dislikes;
    }
    return Object.keys(map).length > 0 ? map : undefined;
  }, [savedRecipients]);

  const commerceContext = useMemo<CommerceContext>(
    () => ({
      cart: cart.map((c) => ({ id: c.product.id, name: c.product.name, quantity: c.quantity })),
      subtotal: cartSubtotal(),
      delivery,
      sender,
      giftMessage,
      giftMessageSource,
      chatCheckoutStep,
      recipientDislikes,
      shownProducts: activeSet?.products?.map((p) => ({ id: p.id, name: p.name })),
    }),
    [cart, cartSubtotal, delivery, sender, giftMessage, giftMessageSource, chatCheckoutStep, recipientDislikes, activeSet],
  );

  const commerceContextRef = useRef(commerceContext);
  commerceContextRef.current = commerceContext;
  const userProfileRef = useRef(userProfile);
  userProfileRef.current = userProfile;
  const lang = useCommerce((s) => s.lang);
  const langRef = useRef(lang);
  langRef.current = lang;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          userProfile: userProfileRef.current,
          commerceContext: commerceContextRef.current,
          lang: langRef.current,
        }),
      }),
    [],
  );

  const chat = useChat({ transport });
  const setActiveSet = useCommerce((s) => s.setActiveSet);
  const setUserProfile = useCommerce((s) => s.setUserProfile);
  const addRecipientDislike = useCommerce((s) => s.addRecipientDislike);
  const setDelivery = useCommerce((s) => s.setDelivery);
  const setSender = useCommerce((s) => s.setSender);
  const setGiftMessage = useCommerce((s) => s.setGiftMessage);
  const setChatCheckoutStep = useCommerce((s) => s.setChatCheckoutStep);
  const addToCart = useCommerce((s) => s.addToCart);
  const removeFromCart = useCommerce((s) => s.removeFromCart);
  const lastSyncedRef = useRef<string | null>(null);
  const restoredRef = useRef(false);
  /**
   * Tracks every tool call ID whose side-effect has already been applied to client state.
   * Without this, each streaming chunk re-runs the sync effect over ALL historical messages,
   * causing addToCart to increment quantity on every chunk (→ 297 items with 3 products).
   * Also pre-populated from session-restored messages so the persisted Zustand cart
   * (localStorage) is never doubled on page reload.
   */
  const processedToolCallsRef = useRef(new Set<string>());

  // Restore chat after returning from Kapruka payment.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const paymentRef = consumePaymentReturn();
    const snapshot = loadChatSession();
    if (snapshot?.messages?.length) {
      // Pre-mark all cart tool call IDs from restored messages as already-processed.
      // The Zustand cart is persisted separately in localStorage and is already correct —
      // replaying these tool calls would double (or 99×) the quantities.
      for (const msg of snapshot.messages) {
        if (msg.role !== "assistant") continue;
        const parts = (msg as { parts?: Array<Record<string, unknown>> }).parts ?? [];
        for (const part of parts) {
          if (
            (part.type === "tool-addToCart" || part.type === "tool-removeFromCart") &&
            part.state === "output-available" &&
            typeof part.toolCallId === "string"
          ) {
            processedToolCallsRef.current.add(part.toolCallId);
          }
        }
      }
      chat.setMessages(snapshot.messages);
    }
    if (paymentRef) {
      // Brief delay so messages mount before the assistant-style follow-up could be added by UI.
      sessionStorage.setItem("chatruka-payment-welcome", paymentRef);
    }
  }, [chat]);

  // Persist conversation while shopping (survives payment redirect / tab navigation).
  useEffect(() => {
    if (chat.messages.length) saveChatSession(chat.messages);
  }, [chat.messages]);

  // Mirror tool outputs into shared client state.
  useEffect(() => {
    let latest: { id: string; out: SearchOutput } | null = null;
    for (const message of chat.messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (!("state" in part) || part.state !== "output-available") continue;

        // searchGifts → update browse grid
        if (part.type === "tool-searchGifts") {
          const out = part.output as SearchOutput;
          if (out?.ok && out.products?.length) {
            latest = { id: (part as { toolCallId: string }).toolCallId, out };
          }
        }

        const toolCallId = (part as { toolCallId?: string }).toolCallId;

        // updateBuyerProfile → persist buyer's name/city/country to their profile
        if (part.type === "tool-updateBuyerProfile" && toolCallId && !processedToolCallsRef.current.has(toolCallId)) {
          processedToolCallsRef.current.add(toolCallId);
          const out = part.output as { ok?: boolean; name?: string; city?: string; country?: string };
          if (out?.ok) {
            const patch: { name?: string; city?: string; country?: string } = {};
            if (out.name) patch.name = out.name;
            if (out.city) patch.city = out.city;
            if (out.country) patch.country = out.country;
            if (Object.keys(patch).length > 0) setUserProfile(patch);
          }
        }

        // rememberRecipientDislike → persist dislike for a named recipient
        if (part.type === "tool-rememberRecipientDislike" && toolCallId && !processedToolCallsRef.current.has(toolCallId)) {
          processedToolCallsRef.current.add(toolCallId);
          const out = part.output as { ok?: boolean; recipientName?: string; dislike?: string };
          if (out?.ok && out.recipientName && out.dislike) {
            addRecipientDislike(out.recipientName, out.dislike);
          }
        }

        // updateCheckoutDetails → sync delivery form from conversation
        if (part.type === "tool-updateCheckoutDetails" && toolCallId && !processedToolCallsRef.current.has(toolCallId)) {
          processedToolCallsRef.current.add(toolCallId);
          const out = part.output as {
            ok?: boolean;
            recipientName?: string;
            recipientPhone?: string;
            address?: string;
            city?: string;
            locationType?: string;
            date?: string;
            instructions?: string;
            senderName?: string;
            anonymous?: boolean;
            giftMessage?: string;
          };
          if (out?.ok) {
            const deliveryPatch: Record<string, string> = {};
            if (out.recipientName) deliveryPatch.recipientName = out.recipientName;
            if (out.recipientPhone) deliveryPatch.recipientPhone = out.recipientPhone;
            if (out.address) deliveryPatch.address = out.address;
            if (out.city) deliveryPatch.city = out.city;
            if (out.locationType) deliveryPatch.locationType = out.locationType as LocationType;
            if (out.date) deliveryPatch.date = out.date;
            if (out.instructions) deliveryPatch.instructions = out.instructions;
            if (Object.keys(deliveryPatch).length) setDelivery(deliveryPatch);

            const senderPatch: { name?: string; anonymous?: boolean } = {};
            if (out.senderName) senderPatch.name = out.senderName;
            if (out.anonymous !== undefined) senderPatch.anonymous = out.anonymous;
            if (Object.keys(senderPatch).length) setSender(senderPatch);

            if (out.giftMessage) setGiftMessage(out.giftMessage, "user");
          }
        }

        // suggestGiftMessage → apply AI-drafted card message
        if (part.type === "tool-suggestGiftMessage" && toolCallId && !processedToolCallsRef.current.has(toolCallId)) {
          processedToolCallsRef.current.add(toolCallId);
          const out = part.output as { ok?: boolean; message?: string };
          if (out?.ok && out.message) setGiftMessage(out.message, "ai");
        }

        // showCheckoutForm → set in-chat checkout step
        if (part.type === "tool-showCheckoutForm" && toolCallId && !processedToolCallsRef.current.has(toolCallId)) {
          processedToolCallsRef.current.add(toolCallId);
          const out = part.output as { ok?: boolean; step?: string };
          if (out?.ok && out.step) {
            setChatCheckoutStep(out.step as "review" | "collect" | "confirm" | "payment");
          }
        }

        // addToCart → mirror into the shared basket (MUST be deduplicated — store increments qty)
        if (part.type === "tool-addToCart" && toolCallId && !processedToolCallsRef.current.has(toolCallId)) {
          processedToolCallsRef.current.add(toolCallId);
          const out = part.output as {
            ok?: boolean;
            product?: Product;
            quantity?: number;
            icingText?: string;
          };
          if (out?.ok && out.product) {
            addToCart(out.product, out.quantity ?? 1, out.icingText);
          }
        }

        // removeFromCart → mirror out of the shared basket
        if (part.type === "tool-removeFromCart" && toolCallId && !processedToolCallsRef.current.has(toolCallId)) {
          processedToolCallsRef.current.add(toolCallId);
          const out = part.output as { ok?: boolean; productId?: string };
          if (out?.ok && out.productId) {
            removeFromCart(out.productId);
          }
        }
      }
    }
    if (latest && latest.id !== lastSyncedRef.current) {
      lastSyncedRef.current = latest.id;
      const { out } = latest;
      setActiveSet({
        title: out.occasion ? `${out.occasion.emoji} ${out.occasion.label}` : "ChatRuka's picks",
        subtitle: out.occasion ? "Curated for the occasion" : "Updated from your chat",
        products: out.products!,
        source: out.source,
        note: out.note,
      });
    }
  }, [chat.messages, setActiveSet, setUserProfile, setDelivery, setSender, setGiftMessage, setChatCheckoutStep, addToCart, removeFromCart, addRecipientDislike]);

  const value = useMemo<ChatContextValue>(
    () => ({
      messages: chat.messages,
      status: chat.status,
      error: chat.error,
      stop: chat.stop,
      sendText: (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        chat.sendMessage({ text: trimmed });
      },
      sendWithFiles: (text: string, files: FileUIPart[]) => {
        if (!text.trim() && !files.length) return;
        if (files.length) {
          chat.sendMessage({ text: text.trim() || "What is this?", files });
        } else {
          chat.sendMessage({ text: text.trim() });
        }
      },
      reset: () => {
        chat.setMessages([]);
        lastSyncedRef.current = null;
        processedToolCallsRef.current.clear();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chat],
  );

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

export function useRukaChat(): ChatContextValue {
  const ctx = useContext(ChatCtx);
  if (!ctx) throw new Error("useRukaChat must be used within ChatProvider");
  return ctx;
}
