"use client";

import { useState } from "react";
import { FileText, Globe, Info, Menu, Plus, ShieldCheck, Users } from "lucide-react";
import { BrandMascot } from "@/components/brand/BrandMascot";
import { useRukaChat } from "@/components/chat/ChatContext";
import { AppInfoModal, type InfoKey } from "@/components/app/AppInfoModal";
import { ProfileSheet } from "@/components/onboarding/ProfileSheet";
import { Drawer } from "@/components/ui/Drawer";
import { OCCASIONS } from "@/lib/catalog/occasions";
import { useCommerce } from "@/lib/commerce/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const MENU_OCCASIONS = ["birthday", "romance", "mother", "cakes", "flowers", "corporate"];

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<InfoKey | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const { reset, sendText } = useRukaChat();
  const openVoice = useCommerce((s) => s.openVoice);
  const savedRecipients = useCommerce((s) => s.savedRecipients);
  const setDelivery = useCommerce((s) => s.setDelivery);
  const lang = useCommerce((s) => s.lang);
  const setLang = useCommerce((s) => s.setLang);
  const userProfile = useCommerce((s) => s.userProfile);
  const { t } = useT();

  const occasions = OCCASIONS.filter((o) => MENU_OCCASIONS.includes(o.id));

  const close = () => setOpen(false);

  const pickRecipient = (name: string, phone?: string, city?: string) => {
    setDelivery({ recipientName: name, recipientPhone: phone, city });
    sendText(`I'd like to send a gift to ${name}${city ? ` in ${city}` : ""}. What do you suggest?`);
    close();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="grid size-11 shrink-0 place-items-center rounded-full text-white ring-1 ring-white/20 transition hover:bg-brand-600 lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <Drawer open={open} onClose={close} side="bottom" title="Menu">
        <div className="space-y-5 px-4 pb-6 pt-2 pb-safe">
          <button
            type="button"
            onClick={() => {
              reset();
              close();
            }}
            className="flex w-full min-h-11 items-center gap-3 rounded-xl bg-brand-700 px-4 py-3 text-left text-sm font-semibold text-white"
          >
            <Plus className="size-5 shrink-0" />
            {t("newGift")}
          </button>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              {t("occasions")}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {occasions.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    sendText(`Show me ${o.label.toLowerCase()} gift ideas`);
                    close();
                  }}
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-canvas-2 px-3 py-2.5 text-left text-sm text-ink"
                >
                  <span className="text-base">{o.emoji}</span>
                  <span className="truncate">{o.label}</span>
                </button>
              ))}
            </div>
          </section>

          {savedRecipients.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                {t("savedRecipients")}
              </h3>
              <div className="space-y-1">
                {savedRecipients.map((r) => (
                  <button
                    key={r.name}
                    type="button"
                    onClick={() => pickRecipient(r.name, r.phone, r.city)}
                    className="flex w-full min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-ink hover:bg-canvas-3"
                  >
                    <Users className="size-4 shrink-0 text-brand-400" />
                    <span className="truncate">{r.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <button
            type="button"
            onClick={() => {
              setProfileOpen(true);
              close();
            }}
            className="flex w-full min-h-11 items-center gap-3 rounded-xl border border-line bg-canvas-2 px-4 py-3 text-left text-sm"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-bold text-white">
              {userProfile.name ? userProfile.name[0].toUpperCase() : "?"}
            </span>
            <span>
              <span className="block font-medium text-ink">
                {userProfile.name ?? "Set up profile"}
              </span>
              {userProfile.city && (
                <span className="block text-xs text-ink-faint">{userProfile.city}</span>
              )}
            </span>
          </button>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              <Globe className="size-3.5" />
              {t("language")}
            </h3>
            <div className="flex gap-2">
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
          </section>

          <div className="grid grid-cols-1 gap-1 border-t border-line pt-3 sm:grid-cols-3">
            <MenuLink icon={<Info className="size-4" />} label={t("howItWorks")} onClick={() => setInfo("how")} />
            <MenuLink icon={<ShieldCheck className="size-4" />} label={t("privacy")} onClick={() => setInfo("privacy")} />
            <MenuLink icon={<FileText className="size-4" />} label={t("terms")} onClick={() => setInfo("terms")} />
          </div>

          <button
            type="button"
            onClick={() => {
              openVoice();
              close();
            }}
            className="flex w-full min-h-11 items-center justify-center gap-2 rounded-full border border-gold-400/50 bg-gold-400/15 px-4 py-3 text-sm font-semibold text-brand-700"
          >
            <BrandMascot variant="call" size={24} />
            {t("callChatRuka")}
          </button>
        </div>
      </Drawer>

      <AppInfoModal info={info} onClose={() => setInfo(null)} />
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
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
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 flex-1 rounded-xl border px-4 text-sm font-medium transition",
        sinhala && "font-sinhala",
        tamil && "font-tamil",
        active
          ? "border-brand-500 bg-brand-700 text-white"
          : "border-line bg-canvas-2 text-ink-muted",
      )}
    >
      {children}
    </button>
  );
}

function MenuLink({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-ink-muted hover:bg-canvas-3 hover:text-ink sm:justify-start"
    >
      {icon}
      {label}
    </button>
  );
}
