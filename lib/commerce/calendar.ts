import { colomboToday, formatHumanDate, toISODate } from "@/lib/commerce/dates";

export interface CalendarEvent {
  id: string;
  label: string;
  /** YYYY-MM-DD in Asia/Colombo */
  date: string;
  /** Signed days from reference today (negative = already passed). */
  daysUntil: number;
  status: "past" | "soon" | "upcoming" | "later";
}

function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86_400_000);
}

/** Nth weekday of a month (weekday: 0=Sun … 6=Sat). */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): string {
  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCMonth() !== month - 1) break;
    if (d.getUTCDay() === weekday) {
      count++;
      if (count === n) return toISODate(d);
    }
  }
  throw new Error(`Could not find weekday ${weekday} #${n} in ${year}-${month}`);
}

/** Fixed lunar / cultural dates we maintain per year (Asia/Colombo). */
const FIXED_CULTURAL: Record<number, Array<{ id: string; label: string; date: string }>> = {
  2025: [
    { id: "avurudu", label: "Sinhala & Tamil New Year (Avurudu)", date: "2025-04-13" },
    { id: "vesak", label: "Vesak", date: "2025-05-12" },
  ],
  2026: [
    { id: "avurudu", label: "Sinhala & Tamil New Year (Avurudu)", date: "2026-04-13" },
    { id: "vesak", label: "Vesak", date: "2026-05-26" },
  ],
  2027: [
    { id: "avurudu", label: "Sinhala & Tamil New Year (Avurudu)", date: "2027-04-14" },
    { id: "vesak", label: "Vesak", date: "2027-05-15" },
  ],
};

function eventsForYear(year: number): Array<{ id: string; label: string; date: string }> {
  return [
    { id: "valentine", label: "Valentine's Day", date: `${year}-02-14` },
    { id: "mothers_day", label: "Mother's Day", date: nthWeekdayOfMonth(year, 5, 0, 2) },
    { id: "fathers_day", label: "Father's Day", date: nthWeekdayOfMonth(year, 6, 0, 3) },
    { id: "christmas", label: "Christmas", date: `${year}-12-25` },
    ...(FIXED_CULTURAL[year] ?? []),
  ];
}

function classify(daysUntil: number): CalendarEvent["status"] {
  if (daysUntil < 0) return "past";
  if (daysUntil <= 14) return "soon";
  if (daysUntil <= 90) return "upcoming";
  return "later";
}

/** Occasion calendar facts for the current year ± next year, relative to today. */
export function getCalendarEvents(referenceToday?: string): CalendarEvent[] {
  const today = referenceToday ?? colomboToday();
  const year = Number(today.slice(0, 4));
  const raw = [...eventsForYear(year), ...eventsForYear(year + 1)];

  const seen = new Set<string>();
  const events: CalendarEvent[] = [];
  for (const e of raw) {
    const key = `${e.id}-${e.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const daysUntil = daysBetween(today, e.date);
    events.push({
      ...e,
      daysUntil,
      status: classify(daysUntil),
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

function describeEvent(e: CalendarEvent): string {
  const human = formatHumanDate(e.date);
  if (e.status === "past") {
    const ago = Math.abs(e.daysUntil);
    return `- ${e.label} (${human}): PASSED ${ago} day${ago === 1 ? "" : "s"} ago — do NOT say it is coming up or around the corner.`;
  }
  if (e.status === "soon") {
    return `- ${e.label} (${human}): UPCOMING SOON — ${e.daysUntil} day${e.daysUntil === 1 ? "" : "s"} away. OK to mention it is soon.`;
  }
  if (e.status === "upcoming") {
    return `- ${e.label} (${human}): ${e.daysUntil} days away — not imminent; do NOT say "around the corner" or "next week".`;
  }
  return `- ${e.label} (${human}): ${e.daysUntil} days away — far out; only mention the date if they ask.`;
}

/** Injected into chat/voice system prompts — the model must treat this as ground truth for dates. */
export function formatCalendarFactsBlock(referenceToday?: string): string {
  const today = referenceToday ?? colomboToday();
  const events = getCalendarEvents(today);
  const relevant = events.filter((e) => e.status !== "later" || e.daysUntil <= 120);

  const lines = relevant.map(describeEvent);
  return `# Occasion calendar (Asia/Colombo — authoritative; today is ${formatHumanDate(today)})
Use ONLY these dates when talking about when an occasion falls. Never guess from memory or because products exist in the catalogue.
- NEVER say an occasion is "coming up", "around the corner", "next week", or "just around the bend" unless it is marked UPCOMING SOON above (within 14 days).
- If an occasion is PASSED, say it already happened this year (give the date) and help them shop for the person anyway — or mention next year's date if useful.
- If unsure about a date not listed here, say you are not certain of the exact date rather than inventing one.
${lines.join("\n")}`;
}
