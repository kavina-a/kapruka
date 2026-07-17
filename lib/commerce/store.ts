import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CheckoutFormStep, PaymentMethodId } from "./checkout-utils";
import type {
  CartItem,
  DeliveryDetails,
  DeliveryQuote,
  GiftMessageSource,
  LocationType,
  OrderConfirmation,
  Product,
  SenderDetails,
} from "./types";
import type { GiftFinderState } from "@/lib/catalog/gift-finder-types";

export type CheckoutStep =
  | "review"
  | "delivery"
  | "confirm"
  | "creating"
  | "payment"
  | "done";

/** A single turn in the voice conversation — synced from Pipecat to the chat thread. */
export interface VoiceEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** False while the caller or bot is still speaking (live partial transcript). */
  final: boolean;
  createdAt: string;
  /** Data URL of an image the caller dropped/attached during the call, if any. */
  imageUrl?: string;
}

/** Product carousel pushed during a voice call — rendered inline in the chat thread. */
export interface VoiceProductSet {
  id: string;
  title: string;
  products: Product[];
  note?: string;
  source?: "live" | "seed";
  createdAt: string;
}

/** UI language. Kapruka is trilingual; the toggle is a deliberate decision. */
export type Lang = "en" | "si" | "ta";

/** Age-based communication tier for the buyer. Set when Ruka infers or asks. */
export type AgeGroup = "teen" | "young-adult" | "adult" | "senior";

export interface UserProfile {
  /** Buyer's first name — used by Ruka to address them personally. */
  name?: string;
  /** Broad age group of the BUYER (not the recipient). Drives Ruka's tone. */
  ageGroup?: AgeGroup;
  /** Approximate numeric age if known. */
  age?: number;
  /** Default delivery city — pre-populates delivery checks without asking. */
  city?: string;
  /** The country the buyer is ordering from (e.g. "UK", "Australia"). Triggers diaspora UX. */
  country?: string;
  /** Preferred display currency for price equivalents (default LKR). */
  displayCurrency?: "LKR" | "USD" | "GBP" | "EUR" | "AUD";
}

/** A lightweight, locally-saved recipient so repeat gifting is one tap. */
export interface SavedRecipient {
  name: string;
  phone?: string;
  city?: string;
  /** Things this recipient doesn't want. Persisted so the agent avoids re-suggesting them. */
  dislikes?: string[];
}

export interface ActiveSet {
  title: string;
  subtitle?: string;
  products: Product[];
  source?: "live" | "seed";
  note?: string;
}

export interface CheckoutError {
  message: string;
  code?: string;
  /** Product ids implicated (e.g. out of stock) so the UI can highlight them. */
  productIds?: string[];
}

interface CommerceState {
  // ---- Active browse set (shared by chat carousels + the persistent grid) ----
  activeSet: ActiveSet | null;
  setActiveSet: (set: ActiveSet) => void;

  // ---- Cart ----
  cart: CartItem[];
  addToCart: (product: Product, quantity?: number, icingText?: string) => void;
  removeFromCart: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  setIcing: (productId: string, icingText: string) => void;
  setProductPrice: (productId: string, amount: number) => void;
  clearCart: () => void;
  isInCart: (productId: string) => boolean;
  cartCount: () => number;
  cartSubtotal: () => number;

  // ---- Checkout draft (the "intent" + "cart" mandates) ----
  delivery: Partial<DeliveryDetails>;
  sender: SenderDetails;
  giftMessage: string;
  giftMessageSource: GiftMessageSource | null;
  setDelivery: (patch: Partial<DeliveryDetails>) => void;
  setSender: (patch: Partial<SenderDetails>) => void;
  setGiftMessage: (msg: string, source?: GiftMessageSource) => void;
  clearGiftMessage: () => void;

  // ---- Gift finder chip flow (structured elicitation state) ----
  giftFinderState: GiftFinderState | null;
  setGiftFinderState: (s: GiftFinderState | null) => void;
  giftFinderOpen: boolean;
  openGiftFinder: () => void;
  closeGiftFinder: () => void;
  giftFinderPrefill: Partial<GiftFinderState> | null;
  setGiftFinderPrefill: (h: Partial<GiftFinderState> | null) => void;

  quote: DeliveryQuote | null;
  setQuote: (q: DeliveryQuote | null) => void;

  // ---- Checkout machine ----
  checkoutStep: CheckoutStep;
  setCheckoutStep: (s: CheckoutStep) => void;
  confirmation: OrderConfirmation | null;
  setConfirmation: (c: OrderConfirmation | null) => void;
  checkoutError: CheckoutError | null;
  setCheckoutError: (e: CheckoutError | null) => void;
  resetCheckout: () => void;

  // ---- In-chat checkout ----
  chatCheckoutStep: CheckoutFormStep | null;
  setChatCheckoutStep: (s: CheckoutFormStep | null) => void;
  selectedPaymentMethod: PaymentMethodId;
  setSelectedPaymentMethod: (m: PaymentMethodId) => void;

  // ---- UI surfaces ----
  detailId: string | null;
  openDetail: (productId: string) => void;
  closeDetail: () => void;

  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;

  checkoutOpen: boolean;
  startCheckout: () => void;
  closeCheckout: () => void;

  trackOpen: boolean;
  openTrack: () => void;
  closeTrack: () => void;

  /** Voice ("Call Ruka") overlay. */
  voiceOpen: boolean;
  openVoice: () => void;
  closeVoice: () => void;

  /** Voice transcript turns — session-only, not persisted. Merged across calls in one page visit. */
  voiceMessages: VoiceEntry[];
  setVoiceMessages: (messages: VoiceEntry[]) => void;
  mergeVoiceTranscript: (incoming: VoiceEntry[]) => void;
  clearVoiceMessages: () => void;

  /** Inline product carousels from voice tool pushes — session-only. */
  voiceProductSets: VoiceProductSet[];
  appendVoiceProductSet: (set: VoiceProductSet) => void;
  clearVoiceProductSets: () => void;

  // ---- Product Tray (right panel / mobile bottom sheet) ----
  trayOpen: boolean;
  openTray: () => void;
  closeTray: () => void;

  // ---- Shortlist (up to 3 curated picks) ----
  shortlist: Product[];
  addToShortlist: (p: Product) => void;
  removeFromShortlist: (id: string) => void;
  clearShortlist: () => void;

  // ---- Dismissed products (session only — not persisted) ----
  dismissedIds: string[];
  dismissProduct: (id: string) => void;
  clearDismissed: () => void;

  // ---- Drag-and-drop ----
  /** The product currently being dragged from the tray. Null when idle. */
  draggedProduct: Product | null;
  startProductDrag: (p: Product) => void;
  endProductDrag: () => void;
  /**
   * Set by the drag overlay when a card is dropped on the composer.
   * The Composer reads this, inserts a chip, then clears it.
   */
  pendingMention: Product | null;
  setPendingMention: (p: Product | null) => void;

  // ---- Preferences ----
  lang: Lang;
  setLang: (lang: Lang) => void;

  // ---- Buyer profile (drives Ruka's tone) ----
  userProfile: UserProfile;
  setUserProfile: (patch: Partial<UserProfile>) => void;

  // ---- Saved recipients (localStorage only) ----
  savedRecipients: SavedRecipient[];
  saveRecipient: (recipient: SavedRecipient) => void;
  removeRecipient: (name: string) => void;
  /** Append a dislike string for a named recipient (creates recipient entry if needed). */
  addRecipientDislike: (recipientName: string, dislike: string) => void;

  // ---- Anonymous device identity (for MongoDB history) ----
  /** UUID generated once per device; used as the anonymous "user" key in MongoDB. */
  clientId: string;
}

const DEFAULT_SENDER: SenderDetails = { name: "", anonymous: false };

export const useCommerce = create<CommerceState>()(
  persist(
    (set, get) => ({
      activeSet: null,
      setActiveSet: (activeSet) => set({ activeSet }),

      cart: [],
      addToCart: (product, quantity = 1, icingText) =>
        set((state) => {
          const existing = state.cart.find((c) => c.product.id === product.id);
          if (existing) {
            return {
              cart: state.cart.map((c) =>
                c.product.id === product.id
                  ? {
                      ...c,
                      quantity: Math.min(99, c.quantity + quantity),
                      icingText: icingText ?? c.icingText,
                    }
                  : c,
              ),
            };
          }
          return {
            cart: [...state.cart, { product, quantity: Math.min(99, quantity), icingText }],
          };
        }),
      removeFromCart: (productId) =>
        set((state) => ({ cart: state.cart.filter((c) => c.product.id !== productId) })),
      setQuantity: (productId, quantity) =>
        set((state) => ({
          cart:
            quantity <= 0
              ? state.cart.filter((c) => c.product.id !== productId)
              : state.cart.map((c) =>
                  c.product.id === productId
                    ? { ...c, quantity: Math.min(99, Math.max(1, quantity)) }
                    : c,
                ),
        })),
      setIcing: (productId, icingText) =>
        set((state) => ({
          cart: state.cart.map((c) =>
            c.product.id === productId ? { ...c, icingText } : c,
          ),
        })),
      setProductPrice: (productId, amount) =>
        set((state) => ({
          cart: state.cart.map((c) =>
            c.product.id === productId
              ? { ...c, product: { ...c.product, price: { ...c.product.price, amount } } }
              : c,
          ),
        })),
      clearCart: () => set({ cart: [] }),
      isInCart: (productId) => get().cart.some((c) => c.product.id === productId),
      cartCount: () => get().cart.reduce((n, c) => n + c.quantity, 0),
      cartSubtotal: () =>
        get().cart.reduce((sum, c) => sum + (c.product.price.amount ?? 0) * c.quantity, 0),

      delivery: { locationType: "house" as LocationType },
      sender: DEFAULT_SENDER,
      giftMessage: "",
      giftMessageSource: null,
      setDelivery: (patch) => set((state) => ({ delivery: { ...state.delivery, ...patch } })),
      setSender: (patch) => set((state) => ({ sender: { ...state.sender, ...patch } })),
      setGiftMessage: (giftMessage, source) =>
        set((state) => {
          const trimmed = giftMessage.slice(0, 300);
          if (!trimmed) return { giftMessage: "", giftMessageSource: null };
          return {
            giftMessage: trimmed,
            giftMessageSource: source ?? state.giftMessageSource ?? "user",
          };
        }),
      clearGiftMessage: () => set({ giftMessage: "", giftMessageSource: null }),

      giftFinderState: null,
      setGiftFinderState: (giftFinderState) => set({ giftFinderState }),
      giftFinderOpen: false,
      openGiftFinder: () => set({ giftFinderOpen: true }),
      closeGiftFinder: () => set({ giftFinderOpen: false }),
      giftFinderPrefill: null,
      setGiftFinderPrefill: (giftFinderPrefill) => set({ giftFinderPrefill }),

      quote: null,
      setQuote: (quote) => set({ quote }),

      checkoutStep: "review",
      setCheckoutStep: (checkoutStep) => set({ checkoutStep }),
      confirmation: null,
      setConfirmation: (confirmation) => set({ confirmation }),
      checkoutError: null,
      setCheckoutError: (checkoutError) => set({ checkoutError }),
      resetCheckout: () =>
        set({
          checkoutStep: "review",
          confirmation: null,
          checkoutError: null,
          quote: null,
          chatCheckoutStep: null,
        }),

      chatCheckoutStep: null,
      setChatCheckoutStep: (chatCheckoutStep) => set({ chatCheckoutStep }),
      selectedPaymentMethod: "card",
      setSelectedPaymentMethod: (selectedPaymentMethod) => set({ selectedPaymentMethod }),

      detailId: null,
      openDetail: (detailId) => set({ detailId }),
      closeDetail: () => set({ detailId: null }),

      cartOpen: false,
      openCart: () => set({ cartOpen: true }),
      closeCart: () => set({ cartOpen: false }),

      checkoutOpen: false,
      startCheckout: () =>
        set({
          checkoutOpen: true,
          cartOpen: false,
          checkoutStep: "review",
          checkoutError: null,
          confirmation: null,
        }),
      closeCheckout: () => set({ checkoutOpen: false }),

      trackOpen: false,
      openTrack: () => set({ trackOpen: true }),
      closeTrack: () => set({ trackOpen: false }),

      voiceOpen: false,
      openVoice: () => set({ voiceOpen: true }),
      closeVoice: () => set({ voiceOpen: false }),

      voiceMessages: [],
      setVoiceMessages: (voiceMessages) => set({ voiceMessages }),
      mergeVoiceTranscript: (incoming) =>
        set((state) => {
          const map = new Map(state.voiceMessages.map((e) => [e.id, e]));
          for (const e of incoming) map.set(e.id, e);
          return {
            voiceMessages: [...map.values()].sort(
              (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
            ),
          };
        }),
      clearVoiceMessages: () => set({ voiceMessages: [] }),

      voiceProductSets: [],
      appendVoiceProductSet: (productSet) =>
        set((state) => {
          const map = new Map(state.voiceProductSets.map((s) => [s.id, s]));
          map.set(productSet.id, productSet);
          return {
            voiceProductSets: [...map.values()].sort(
              (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
            ),
          };
        }),
      clearVoiceProductSets: () => set({ voiceProductSets: [] }),

      trayOpen: false,
      openTray: () => set({ trayOpen: true }),
      closeTray: () => set({ trayOpen: false }),

      shortlist: [],
      addToShortlist: (p) =>
        set((state) => {
          if (state.shortlist.length >= 3) return {};
          if (state.shortlist.some((s) => s.id === p.id)) return {};
          return { shortlist: [...state.shortlist, p] };
        }),
      removeFromShortlist: (id) =>
        set((state) => ({ shortlist: state.shortlist.filter((p) => p.id !== id) })),
      clearShortlist: () => set({ shortlist: [] }),

      dismissedIds: [],
      dismissProduct: (id) =>
        set((state) => ({
          dismissedIds: state.dismissedIds.includes(id)
            ? state.dismissedIds
            : [...state.dismissedIds, id],
        })),
      clearDismissed: () => set({ dismissedIds: [] }),

      draggedProduct: null,
      startProductDrag: (p) => set({ draggedProduct: p }),
      endProductDrag: () => set({ draggedProduct: null }),
      pendingMention: null,
      setPendingMention: (p) => set({ pendingMention: p }),

      lang: "en",
      setLang: (lang) => set({ lang }),

      userProfile: {},
      setUserProfile: (patch) =>
        set((state) => ({ userProfile: { ...state.userProfile, ...patch } })),

      savedRecipients: [],
      saveRecipient: (recipient) =>
        set((state) => {
          const name = recipient.name.trim();
          if (!name) return {};
          const rest = state.savedRecipients.filter(
            (r) => r.name.toLowerCase() !== name.toLowerCase(),
          );
          return { savedRecipients: [{ ...recipient, name }, ...rest].slice(0, 8) };
        }),
      removeRecipient: (name) =>
        set((state) => ({
          savedRecipients: state.savedRecipients.filter(
            (r) => r.name.toLowerCase() !== name.toLowerCase(),
          ),
        })),

      addRecipientDislike: (recipientName, dislike) =>
        set((state) => {
          const trimmedName = recipientName.trim();
          const trimmedDislike = dislike.trim().toLowerCase();
          if (!trimmedName || !trimmedDislike) return {};
          const existing = state.savedRecipients.find(
            (r) => r.name.toLowerCase() === trimmedName.toLowerCase(),
          );
          if (existing) {
            const already = existing.dislikes?.map((d) => d.toLowerCase()) ?? [];
            if (already.includes(trimmedDislike)) return {};
            return {
              savedRecipients: state.savedRecipients.map((r) =>
                r.name.toLowerCase() === trimmedName.toLowerCase()
                  ? { ...r, dislikes: [...(r.dislikes ?? []), trimmedDislike] }
                  : r,
              ),
            };
          }
          // Recipient not yet saved — create a stub with just the dislike
          return {
            savedRecipients: [
              { name: trimmedName, dislikes: [trimmedDislike] },
              ...state.savedRecipients,
            ].slice(0, 8),
          };
        }),

      clientId: crypto.randomUUID(),
    }),
    {
      name: "chatruka-commerce-v1",
      partialize: (state) => ({
        cart: state.cart,
        delivery: state.delivery,
        sender: state.sender,
        giftMessage: state.giftMessage,
        giftMessageSource: state.giftMessageSource,
        lang: state.lang,
        savedRecipients: state.savedRecipients,
        clientId: state.clientId,
        userProfile: state.userProfile,
        shortlist: state.shortlist,
      }),
    },
  ),
);
