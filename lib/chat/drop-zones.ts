export type DropZoneKind = "composer" | "cart" | "shortlist";

/** Hit-test drop targets by bounding rect — more reliable than elementFromPoint during drags. */
export function getDropZoneAt(x: number, y: number): DropZoneKind | null {
  const zones = document.querySelectorAll<HTMLElement>("[data-drop-zone]");
  // Prefer smaller / more specific targets first (composer over main, etc.)
  const hits: Array<{ kind: DropZoneKind; area: number }> = [];

  for (const el of zones) {
    const kind = el.getAttribute("data-drop-zone") as DropZoneKind | null;
    if (!kind) continue;
    const rect = el.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      hits.push({ kind, area: rect.width * rect.height });
    }
  }

  if (!hits.length) return null;
  hits.sort((a, b) => a.area - b.area);
  return hits[0].kind;
}
