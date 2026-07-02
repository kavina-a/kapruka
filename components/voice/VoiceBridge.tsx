"use client";

import { useCallback, useEffect } from "react";
import { usePipecatConversation } from "@pipecat-ai/client-react";
import { RTVIEvent, useRTVIClientEvent } from "@/lib/voice/rtvi";
import { useCommerce } from "@/lib/commerce/store";
import { pipecatMessagesToVoiceEntries } from "@/lib/voice/transcript";
import { normalizeVoiceProduct, parseVoiceServerMessage } from "@/lib/voice/serverMessage";

/**
 * Applies the voice bot's "server-message" payloads to the shared commerce
 * store, so a voice call renders the same product cards / cart / checkout as
 * the text chat. Also syncs the live conversation transcript to the store so
 * ChatPanel can display it inline in the thread. Must live inside PipecatClientProvider.
 */
export function VoiceBridge() {
  const { messages } = usePipecatConversation();
  const mergeVoiceTranscript = useCommerce((s) => s.mergeVoiceTranscript);

  // Sync Pipecat conversation turns to Zustand — includes partial (in-progress) transcripts.
  useEffect(() => {
    mergeVoiceTranscript(pipecatMessagesToVoiceEntries(messages));
  }, [messages, mergeVoiceTranscript]);

  const onServerMessage = useCallback((data: unknown) => {
    const msg = parseVoiceServerMessage(data);
    if (!msg) return;
    const store = useCommerce.getState();

    switch (msg.type) {
      case "products": {
        if (!msg.products?.length) return;
        const products = msg.products.map((p) => normalizeVoiceProduct(p));
        const title =
          msg.title ||
          (msg.occasion ? `${msg.occasion.emoji} ${msg.occasion.label}` : "ChatRuka's picks");
        const now = new Date().toISOString();

        store.setActiveSet({
          title,
          subtitle: "From your voice call",
          products,
          source: msg.source,
          note: msg.note ?? undefined,
        });
        store.openTray();
        store.appendVoiceProductSet({
          id: `voice-products-${now}`,
          title,
          products,
          note: msg.note ?? undefined,
          source: msg.source,
          createdAt: now,
        });
        break;
      }
      case "open_product": {
        if (msg.productId) store.openDetail(msg.productId);
        break;
      }
      case "add_to_cart": {
        if (msg.product) store.addToCart(normalizeVoiceProduct(msg.product), msg.quantity ?? 1);
        break;
      }
      case "open_checkout": {
        store.startCheckout();
        break;
      }
      case "show_checkout_form": {
        store.setChatCheckoutStep(msg.step);
        break;
      }
      case "suggest_gift_message": {
        if (msg.message?.trim()) {
          store.setGiftMessage(msg.message.trim(), "ai");
        }
        break;
      }
      case "track_order": {
        store.openTrack();
        break;
      }
      case "delivery_quote":
      default:
        break;
    }
  }, []);

  useRTVIClientEvent(RTVIEvent.ServerMessage, onServerMessage);
  return null;
}
