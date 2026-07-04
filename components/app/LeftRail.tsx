"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell,
  FileText,
  Globe,
  Info,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { BrandMascot } from "@/components/brand/BrandMascot";
import { RukaAvatar } from "@/components/brand/RukaAvatar";
import { useRukaChat } from "@/components/chat/ChatContext";
import { sessionTitleFromMessages } from "@/lib/chat/session-title";
import { useCommerce } from "@/lib/commerce/store";
import { useT } from "@/lib/i18n";
import { OCCASIONS } from "@/lib/catalog/occasions";
import { cn } from "@/lib/utils";
import type { OrderRecord, PriceAlert } from "@/lib/commerce/types";
import { ProfileSheet } from "@/components/onboarding/ProfileSheet";

const RAIL_OCCASIONS = ["birthday", "romance", "mother", "cakes", "flowers", "corporate"];

import { AppInfoModal, type InfoKey } from "@/components/app/AppInfoModal";

export function LeftRail() {
  const { messages, reset, sendText, sessions, sessionId, switchSession } = useRukaChat();
  const openVoice = useCommerce((s) => s.openVoice);
  const savedRecipients = useCommerce((s) => s.savedRecipients);
  const setDelivery = useCommerce((s) => s.setDelivery);
  const lang = useCommerce((s) => s.lang);
  const setLang = useCommerce((s) => s.setLang);
  const clientId = useCommerce((s) => s.clientId);
  const userProfile = useCommerce((s) => s.userProfile);
  const { t } = useT();
  const [info, setInfo] = useState<InfoKey | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [orderHistory, setOrderHistory] = useState<OrderRecord[]>([]);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);

  // Fetch gift history once clientId is available (only if MongoDB is configured).
  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/orders?clientId=${encodeURIComponent(clientId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setOrderHistory(data.records ?? []);
      })
      .catch(() => {});
  }, [clientId]);

  // Fetch price alerts.
  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/price-alerts?clientId=${encodeURIComponent(clientId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setPriceAlerts(data.alerts ?? []);
      })
      .catch(() => {});
  }, [clientId]);

  const triggeredAlerts = priceAlerts.filter((a) => a.triggered);
  const activeAlerts = priceAlerts.filter((a) => !a.triggered);

  const dismissAlert = async (productId: string) => {
    setPriceAlerts((prev) => prev.filter((a) => a.productId !== productId));
    await fetch(`/api/price-alerts?clientId=${encodeURIComponent(clientId)}&productId=${encodeURIComponent(productId)}`, {
      method: "DELETE",
    }).catch(() => {});
  };

  // Keep the document language honest with the toggle.
  useEffect(() => {
    document.documentElement.lang = lang === "si" ? "si" : lang === "ta" ? "ta" : "en";
  }, [lang]);

  const currentTitle = useMemo(
    () => sessionTitleFromMessages(messages, t("newConversation")),
    [messages, t],
  );

  const chatSessions = useMemo(() => {
    const list = sessions.map((s) => ({ ...s }));
    if (!sessionId) {
      if (messages.length) {
        list.unshift({
          sessionId: "local",
          title: currentTitle,
          updatedAt: new Date().toISOString(),
        });
      }
      return list;
    }

    const idx = list.findIndex((s) => s.sessionId === sessionId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], title: currentTitle || list[idx].title };
    } else {
      list.unshift({
        sessionId,
        title: currentTitle,
        updatedAt: new Date().toISOString(),
      });
    }
    return list;
  }, [sessions, sessionId, messages.length, currentTitle]);

  const railOccasions = OCCASIONS.filter((o) => RAIL_OCCASIONS.includes(o.id));

  const pickRecipient = (name: string, phone?: string, city?: string) => {
    setDelivery({ recipientName: name, recipientPhone: phone, city });
    const lastOrder = orderHistory.find(
      (r) => r.recipient.toLowerCase() === name.toLowerCase(),
    );
    const historyHint = lastOrder
      ? ` Last time I sent ${lastOrder.items[0] ?? "a gift"} — want to try something different?`
      : "";
    sendText(
      `I'd like to send a gift to ${name}${city ? ` in ${city}` : ""}.${historyHint} What do you suggest?`,
    );
  };

  return (
    <>
      <div className="relative hidden w-14 shrink-0 lg:block">
        <aside className="group absolute inset-y-0 left-0 z-30 flex w-14 flex-col overflow-hidden border-r border-line bg-canvas transition-[width] duration-200 ease-out hover:w-64 hover:shadow-xl">
          {/* Brand */}
          <div className="flex items-center gap-3 px-[14px] py-3">
            <RukaAvatar size={28} glow />
            <span className="whitespace-nowrap font-display text-base text-ink opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              ChatRuka
            </span>
          </div>

          <div className="px-2">
            <RailButton
              icon={<Plus className="size-5" />}
              label={t("newGift")}
              title={t("newGift")}
              onClick={reset}
              accent
            />
          </div>

          <div className="scroll-soft flex-1 overflow-y-auto overflow-x-hidden">
            <Divider />
            <SectionHeader>{t("thisSession")}</SectionHeader>
            <div className="px-2">
              {chatSessions.length > 0 ? (
                chatSessions.map((s) => {
                  const active = s.sessionId === sessionId;
                  return (
                    <button
                      key={s.sessionId}
                      type="button"
                      onClick={() => {
                        if (active) return;
                        switchSession(s.sessionId);
                      }}
                      title={s.title}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-[10px] py-2 text-left text-sm transition",
                        active
                          ? "bg-canvas-2 text-ink"
                          : "text-ink-muted hover:bg-canvas-2 hover:text-ink",
                      )}
                    >
                      <span className="grid size-5 shrink-0 place-items-center">
                        <Sparkles
                          className={cn("size-4", active ? "text-gold-400" : "text-ink-faint")}
                        />
                      </span>
                      <span className="truncate whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        {s.title}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="flex items-center gap-3 rounded-lg bg-canvas-2 px-[10px] py-2 text-sm text-ink">
                  <span className="grid size-5 shrink-0 place-items-center">
                    <Sparkles className="size-4 text-gold-400" />
                  </span>
                  <span className="truncate whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                    {currentTitle}
                  </span>
                </div>
              )}
            </div>

            <Divider />
            <SectionHeader>{t("occasions")}</SectionHeader>
            <div className="px-2">
              {railOccasions.map((o) => (
                <RailButton
                  key={o.id}
                  icon={<span className="text-base leading-none">{o.emoji}</span>}
                  label={o.label}
                  title={o.label}
                  onClick={() => sendText(`Show me ${o.label.toLowerCase()} gift ideas`)}
                />
              ))}
            </div>

            <Divider />
            <SectionHeader>{t("savedRecipients")}</SectionHeader>
            <div className="px-2">
              {savedRecipients.length > 0 ? (
                savedRecipients.map((r) => {
                  const lastOrder = orderHistory.find(
                    (o) => o.recipient.toLowerCase() === r.name.toLowerCase(),
                  );
                  const sub = lastOrder
                    ? `${lastOrder.items[0] ?? "gift"} · ${new Date(lastOrder.date).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}`
                    : r.city;
                  return (
                    <RailButton
                      key={r.name}
                      icon={<Users className="size-5" />}
                      label={r.name}
                      sub={sub}
                      title={r.name}
                      onClick={() => pickRecipient(r.name, r.phone, r.city)}
                    />
                  );
                })
              ) : (
                <p className="hidden whitespace-normal px-[10px] py-1 text-xs leading-snug text-ink-faint group-hover:block">
                  {t("noRecipients")}
                </p>
              )}
            </div>

            {/* Price alerts section */}
            {(triggeredAlerts.length > 0 || activeAlerts.length > 0) && (
              <>
                <Divider />
                <SectionHeader>
                  {triggeredAlerts.length > 0
                    ? `Price Alerts · ${triggeredAlerts.length} hit`
                    : "Price Alerts"}
                </SectionHeader>
                <div className="px-2">
                  {triggeredAlerts.map((a) => (
                    <div
                      key={a.productId}
                      className="flex w-full items-center gap-3 rounded-lg bg-gold-500/10 px-[10px] py-2 text-sm"
                    >
                      <span className="grid size-5 shrink-0 place-items-center">
                        <Bell className="size-4 text-gold-400" />
                      </span>
                      <span className="min-w-0 flex-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        <span className="block truncate whitespace-nowrap text-[12px] font-medium text-ink">
                          {a.productName}
                        </span>
                        <span className="block text-[10px] text-gold-300">
                          Now LKR {a.currentPrice?.toLocaleString()} ↓ target hit
                        </span>
                      </span>
                      <button
                        onClick={() => dismissAlert(a.productId)}
                        title="Dismiss"
                        className="shrink-0 opacity-0 transition group-hover:opacity-100 hover:text-ink"
                      >
                        <X className="size-3 text-ink-faint" />
                      </button>
                    </div>
                  ))}
                  {activeAlerts.map((a) => (
                    <RailButton
                      key={a.productId}
                      icon={<Bell className="size-5 text-ink-faint" />}
                      label={a.productName}
                      sub={`Alert at LKR ${a.targetPrice?.toLocaleString()}`}
                      title={`Price alert for ${a.productName}`}
                      onClick={() =>
                        sendText(`Show me "${a.productName}" — I have a price alert on it`)
                      }
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Footer: profile + language + trust + voice */}
          <div className="border-t border-line px-2 py-2">
            {/* Profile entry */}
            <button
              onClick={() => setProfileOpen(true)}
              title="Your profile"
              className="flex w-full items-center gap-3 rounded-lg px-[10px] py-2 text-left text-sm transition hover:bg-canvas-2"
            >
              {/* Avatar initial (collapsed) or full row (expanded) */}
              <span className="grid size-5 shrink-0 place-items-center">
                {userProfile.name ? (
                  <span className="grid size-5 place-items-center rounded-full bg-brand-700 text-[10px] font-bold text-white">
                    {userProfile.name[0].toUpperCase()}
                  </span>
                ) : (
                  <span className="grid size-5 place-items-center rounded-full border border-dashed border-line text-[10px] text-ink-faint">
                    ?
                  </span>
                )}
              </span>
              <span className="min-w-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <span className="block truncate whitespace-nowrap font-medium text-ink">
                  {userProfile.name ?? "Set up profile"}
                </span>
                {(userProfile.ageGroup || userProfile.city) && (
                  <span className="block truncate whitespace-nowrap text-[11px] text-ink-faint">
                    {[userProfile.ageGroup?.replace("-", " "), userProfile.city]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </span>
            </button>

            <div className="flex items-center gap-3 px-[10px] py-2">
              <span className="grid size-5 shrink-0 place-items-center">
                <Globe className="size-5 text-ink-muted" />
              </span>
              <div className="hidden items-center gap-1 group-hover:flex">
                <LangPill active={lang === "en"} onClick={() => setLang("en")}>
                  EN
                </LangPill>
                <LangPill active={lang === "si"} onClick={() => setLang("si")} sinhala>
                  සිං
                </LangPill>
                <LangPill active={lang === "ta"} onClick={() => setLang("ta")} tamil>
                  தமிழ்
                </LangPill>
              </div>
            </div>

            <RailButton
              icon={<Info className="size-5" />}
              label={t("howItWorks")}
              title={t("howItWorks")}
              onClick={() => setInfo("how")}
            />
            <RailButton
              icon={<ShieldCheck className="size-5" />}
              label={t("privacy")}
              title={t("privacy")}
              onClick={() => setInfo("privacy")}
            />
            <RailButton
              icon={<FileText className="size-5" />}
              label={t("terms")}
              title={t("terms")}
              onClick={() => setInfo("terms")}
            />
            <RailButton
              icon={<BrandMascot variant="call" size={20} />}
              label={t("callChatRuka")}
              title={t("callChatRuka")}
              onClick={openVoice}
              accent
            />
          </div>
        </aside>
      </div>

      <AppInfoModal info={info} onClose={() => setInfo(null)} />
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}

function RailButton({
  icon,
  label,
  sub,
  title,
  onClick,
  accent,
}: {
  icon: ReactNode;
  label: string;
  sub?: string;
  title?: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-[10px] py-2 text-left text-sm transition",
        accent
          ? "text-brand-700 hover:bg-brand-50"
          : "text-ink-muted hover:bg-canvas-2 hover:text-ink",
      )}
    >
      <span className="grid size-5 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <span className="block truncate whitespace-nowrap">{label}</span>
        {sub && (
          <span className="block truncate whitespace-nowrap text-[11px] text-ink-faint">
            {sub}
          </span>
        )}
      </span>
    </button>
  );
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="hidden whitespace-nowrap px-[14px] pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint group-hover:block">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="mx-3 my-1.5 hidden h-px bg-line group-hover:block" />;
}

function LangPill({
  active,
  onClick,
  sinhala,
  tamil,
  children,
}: {
  active: boolean;
  onClick: () => void;
  sinhala?: boolean;
  tamil?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-0.5 text-xs transition",
        sinhala && "font-sinhala",
        tamil && "font-tamil",
        active ? "bg-brand-700 text-white" : "text-ink-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
