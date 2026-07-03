"""Occasion calendar facts for voice prompts — keep in sync with lib/commerce/calendar.ts."""

from __future__ import annotations

from datetime import date, timedelta


def _nth_weekday_of_month(year: int, month: int, weekday: int, n: int) -> date:
    """weekday: 0=Mon in Python… we use Sunday=6 for JS parity → Python Sunday=6."""
    # Python: Monday=0, Sunday=6. JS: Sunday=0.
    py_weekday = 6 if weekday == 0 else weekday - 1
    d = date(year, month, 1)
    count = 0
    while d.month == month:
        if d.weekday() == py_weekday:
            count += 1
            if count == n:
                return d
        d += timedelta(days=1)
    raise ValueError(f"weekday {weekday} #{n} not found in {year}-{month}")


_FIXED_CULTURAL: dict[int, list[tuple[str, str, str]]] = {
    2025: [
        ("avurudu", "Sinhala & Tamil New Year (Avurudu)", "2025-04-13"),
        ("vesak", "Vesak", "2025-05-12"),
    ],
    2026: [
        ("avurudu", "Sinhala & Tamil New Year (Avurudu)", "2026-04-13"),
        ("vesak", "Vesak", "2026-05-26"),
    ],
    2027: [
        ("avurudu", "Sinhala & Tamil New Year (Avurudu)", "2027-04-14"),
        ("vesak", "Vesak", "2027-05-15"),
    ],
}


def _events_for_year(year: int) -> list[tuple[str, str, date]]:
    rows: list[tuple[str, str, date]] = [
        ("valentine", "Valentine's Day", date(year, 2, 14)),
        ("mothers_day", "Mother's Day", _nth_weekday_of_month(year, 5, 0, 2)),
        ("fathers_day", "Father's Day", _nth_weekday_of_month(year, 6, 0, 3)),
        ("christmas", "Christmas", date(year, 12, 25)),
    ]
    for eid, label, iso in _FIXED_CULTURAL.get(year, []):
        y, m, d = map(int, iso.split("-"))
        rows.append((eid, label, date(y, m, d)))
    return rows


def format_calendar_facts(today: date) -> str:
    raw: list[tuple[str, str, date]] = []
    seen: set[str] = set()
    for year in (today.year, today.year + 1):
        for eid, label, dt in _events_for_year(year):
            key = f"{eid}-{dt.isoformat()}"
            if key in seen:
                continue
            seen.add(key)
            raw.append((eid, label, dt))

    lines: list[str] = []
    for _eid, label, dt in sorted(raw, key=lambda r: r[2]):
        days = (dt - today).days
        human = dt.strftime("%a, %d %b %Y")
        if days < 0:
            ago = abs(days)
            lines.append(
                f"- {label} ({human}): PASSED {ago} day{'s' if ago != 1 else ''} ago "
                "— do NOT say it is coming up or around the corner."
            )
        elif days <= 14:
            lines.append(
                f"- {label} ({human}): UPCOMING SOON — {days} day{'s' if days != 1 else ''} away. "
                "OK to mention it is soon."
            )
        elif days <= 90:
            lines.append(
                f"- {label} ({human}): {days} days away — not imminent; "
                'do NOT say "around the corner" or "next week".'
            )
        elif days <= 120:
            lines.append(f"- {label} ({human}): {days} days away — far out; only mention if they ask.")

    today_human = today.strftime("%a, %d %b %Y")
    header = f"""# Occasion calendar (Asia/Colombo — authoritative; today is {today_human})
Use ONLY these dates when talking about when an occasion falls. Never guess from memory or because products exist in the catalogue.
- NEVER say an occasion is "coming up", "around the corner", "next week", or "just around the bend" unless it is marked UPCOMING SOON above (within 14 days).
- If an occasion is PASSED, say it already happened this year (give the date) and help them shop for the person anyway — or mention next year's date if useful.
- If unsure about a date not listed here, say you are not certain of the exact date rather than inventing one."""
    return header + "\n" + "\n".join(lines)
