"use client";

import { useRef, useState, useCallback, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Square, ImagePlus, X, ShoppingBag } from "lucide-react";
import type { FileUIPart } from "ai";
import { useRukaChat } from "./ChatContext";
import { useCommerce } from "@/lib/commerce/store";
import type { Product } from "@/lib/commerce/types";
import { attachImageFile, fileToFileUIPart, imageFromClipboard } from "@/lib/chat/image-files";
import { formatProductMentions } from "@/lib/chat/product-mentions";
import { useT } from "@/lib/i18n";
import { cn, formatMoney } from "@/lib/utils";

async function loadImageFile(file: File): Promise<{ part: FileUIPart; previewUrl: string }> {
  const part = await fileToFileUIPart(file);
  return { part, previewUrl: part.url };
}

export function Composer({ autoFocus = false }: { autoFocus?: boolean }) {
  const { sendText, sendWithFiles, status, stop } = useRukaChat();
  const { t } = useT();
  const [value, setValue] = useState("");
  const [pendingImage, setPendingImage] = useState<{ part: FileUIPart; previewUrl: string } | null>(null);
  // Products mentioned via drag-and-drop
  const [mentions, setMentions] = useState<Product[]>([]);
  // Glow state when drag enters this drop zone
  const [dropActive, setDropActive] = useState(false);

  const pendingMention = useCommerce((s) => s.pendingMention);
  const setPendingMention = useCommerce((s) => s.setPendingMention);
  const draggedProduct = useCommerce((s) => s.draggedProduct);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Consume a pending mention (set by the drag overlay) → add chip
  useEffect(() => {
    if (!pendingMention) return;
    setMentions((prev) => {
      // Deduplicate by id
      if (prev.some((p) => p.id === pendingMention.id)) return prev;
      return [...prev, pendingMention];
    });
    setPendingMention(null);
    // Focus the textarea so user can immediately type their question
    requestAnimationFrame(() => taRef.current?.focus());
  }, [pendingMention, setPendingMention]);

  // Light up the drop zone while a product drag is in progress
  useEffect(() => {
    if (!draggedProduct) setDropActive(false);
  }, [draggedProduct]);

  const removeMention = (id: string) =>
    setMentions((prev) => prev.filter((p) => p.id !== id));

  const busy = status === "submitted" || status === "streaming";

  const resize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    if (!value.trim() && !pendingImage && !mentions.length) return;

    // Build the text, prepending any product mentions
    const mentionText = formatProductMentions(mentions);
    const bodyText = value.trim();
    const finalText = mentionText && bodyText
      ? `${mentionText} — ${bodyText}`
      : mentionText || bodyText;

    if (pendingImage) {
      sendWithFiles(finalText, [pendingImage.part]);
      setPendingImage(null);
    } else {
      sendText(finalText);
    }

    setValue("");
    setMentions([]);
    requestAnimationFrame(() => {
      if (taRef.current) taRef.current.style.height = "auto";
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    // Backspace at empty input removes the last mention chip
    if (e.key === "Backspace" && !value && mentions.length) {
      setMentions((prev) => prev.slice(0, -1));
    }
  };

  const onImagePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setPendingImage(await loadImageFile(file));
  }, []);

  const onPaste = useCallback(async (e: React.ClipboardEvent) => {
    const file = imageFromClipboard(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    await attachImageFile(file, setPendingImage);
    requestAnimationFrame(() => taRef.current?.focus());
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);

    // Product drops are handled by ProductDragOverlay — ignore here.
    if (draggedProduct) return;

    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) {
      await attachImageFile(file, setPendingImage);
      requestAnimationFrame(() => taRef.current?.focus());
    }
  }, [draggedProduct]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (draggedProduct) return;
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setDropActive(true);
    }
  }, [draggedProduct]);

  const clearImage = () => setPendingImage(null);

  const hasPending = !!pendingImage || mentions.length > 0;
  const canSend = !!value.trim() || hasPending;

  return (
    // data-drop-zone is detected by ProductDragOverlay to identify this as a drop target.
    <form
      onSubmit={submit}
      className="relative"
      data-drop-zone="composer"
      onDragOver={onDragOver}
      onDragLeave={() => setDropActive(false)}
      onDrop={onDrop}
      onPointerEnter={() => draggedProduct && setDropActive(true)}
      onPointerLeave={() => setDropActive(false)}
    >
      {/* Image preview chip */}
      {pendingImage && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl border border-line bg-canvas-2 px-3 py-2">
          <img
            src={pendingImage.previewUrl}
            alt="Upload preview"
            className="size-14 rounded-xl object-cover"
          />
          <div className="flex-1 text-xs text-ink-muted">
            Image attached — I&apos;ll find something like this
          </div>
          <button
            type="button"
            onClick={clearImage}
            aria-label="Remove image"
            className="grid size-7 shrink-0 place-items-center rounded-full text-ink-faint hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Product mention chips */}
      <AnimatePresence initial={false}>
        {mentions.length > 0 && (
          <motion.div
            key="mention-chips"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-2 flex flex-wrap gap-1.5 overflow-hidden"
          >
            {mentions.map((p) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="flex items-center gap-1.5 rounded-full border border-brand-300/40 bg-brand-50 py-1 pl-1.5 pr-2 text-xs text-brand-700"
              >
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" className="size-5 rounded-full object-cover" />
                ) : (
                  <ShoppingBag className="size-3.5 text-brand-400" />
                )}
                <span className="max-w-[160px] truncate font-medium">{p.name}</span>
                <span className="text-brand-400/70">
                  {p.price.amount != null ? formatMoney(p.price.amount, p.price.currency) : ""}
                </span>
                <button
                  type="button"
                  onClick={() => removeMention(p.id)}
                  aria-label={`Remove ${p.name}`}
                  className="ml-0.5 grid size-8 place-items-center rounded-full text-brand-400 hover:bg-brand-100 hover:text-brand-700"
                >
                  <X className="size-3" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main input row */}
      <div
        className={cn(
          "flex items-end gap-2 rounded-3xl border bg-canvas-2 p-2 shadow-sm transition-all duration-150",
          hasPending ? "pl-3" : "pl-4",
          dropActive
            ? "border-gold-400 shadow-[0_0_0_3px_rgba(255,210,0,0.18)]"
            : draggedProduct
              ? "border-gold-400/40"
              : "border-line focus-within:border-gold-400",
        )}
      >
        {/* Image upload button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onImagePick}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          aria-label="Attach image"
          title="Upload an image to find similar products"
          className="grid size-11 shrink-0 place-items-center rounded-full text-ink-faint transition hover:text-gold-400 disabled:opacity-30"
        >
          <ImagePlus className="size-4.5" />
        </button>

        <textarea
          ref={taRef}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            resize();
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={1}
          placeholder={
            mentions.length > 0
              ? "Ask something about this… (or just hit send)"
              : pendingImage
                ? "Describe what you're looking for (optional)…"
                : draggedProduct
                  ? "Drop here to ask about this gift…"
                  : t("composerPlaceholder")
          }
          className="max-h-40 flex-1 resize-none bg-transparent py-2 text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
        />

        {busy ? (
          <button
            type="button"
            onClick={stop}
            aria-label="Stop"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-canvas-3 text-ink hover:bg-line-strong"
          >
            <Square className="size-4 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-gold-500 text-ink-dark transition enabled:hover:bg-gold-400 disabled:opacity-40"
          >
            <ArrowUp className="size-5" />
          </button>
        )}
      </div>

      {/* Drop zone hint overlay — shown when dragging a product */}
      <AnimatePresence>
        {draggedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-3xl"
          >
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                dropActive
                  ? "bg-gold-500 text-ink-dark"
                  : "bg-canvas-3/80 text-ink-muted",
              )}
            >
              {dropActive
                  ? draggedProduct
                    ? "Release to mention"
                    : "Release to attach image"
                  : draggedProduct
                    ? "Drag gifts here to ask about them"
                    : "Paste or drop an image here"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
