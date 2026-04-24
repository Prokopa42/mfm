import type { CalculationSettings, ISODate } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function toISODate(date: Date): ISODate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

export function parseISODate(date: ISODate) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: ISODate, days: number): ISODate {
  const value = parseISODate(date);
  value.setDate(value.getDate() + days);
  return toISODate(value);
}

export function daysBetween(startDate: ISODate, endDate: ISODate) {
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_MS);
}

export function monthsBetween(startDate: ISODate, endDate: ISODate) {
  const days = daysBetween(startDate, endDate);
  return days / 30.4375;
}

export function compareDates(a: ISODate, b: ISODate) {
  return daysBetween(b, a);
}

export function isBeforeOrSame(a: ISODate, b: ISODate) {
  return compareDates(a, b) <= 0;
}

export function isAfterOrSame(a: ISODate, b: ISODate) {
  return compareDates(a, b) >= 0;
}

export function isSameDate(a: ISODate, b: ISODate) {
  return a === b;
}

export function isWeekend(date: ISODate) {
  const day = parseISODate(date).getDay();
  return day === 0 || day === 6;
}

export function adjustToPreviousBusinessDay(date: ISODate) {
  let current = date;
  while (isWeekend(current)) {
    current = addDays(current, -1);
  }
  return current;
}

export function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function paycheckDateForMonth(year: number, monthIndex: number, payday: number) {
  const day = Math.min(Math.max(1, payday), lastDayOfMonth(year, monthIndex));
  return adjustToPreviousBusinessDay(toISODate(new Date(year, monthIndex, day)));
}

export function getPaycheckCandidates(today: ISODate, settings: CalculationSettings) {
  const base = parseISODate(today);
  const values: ISODate[] = [];

  for (let monthOffset = -1; monthOffset <= 2; monthOffset += 1) {
    const date = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
    values.push(paycheckDateForMonth(date.getFullYear(), date.getMonth(), settings.payday1));
    values.push(paycheckDateForMonth(date.getFullYear(), date.getMonth(), settings.payday2));
  }

  return Array.from(new Set(values)).sort(compareDates);
}

export function getPaycheckSlotForDate(date: ISODate, settings: CalculationSettings) {
  const base = parseISODate(date);

  for (let monthOffset = -1; monthOffset <= 1; monthOffset += 1) {
    const month = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
    const year = month.getFullYear();
    const monthIndex = month.getMonth();

    if (isSameDate(paycheckDateForMonth(year, monthIndex, settings.payday1), date)) {
      return "payday1" as const;
    }

    if (isSameDate(paycheckDateForMonth(year, monthIndex, settings.payday2), date)) {
      return "payday2" as const;
    }
  }

  return null;
}

export function getNextPaycheckDate(today: ISODate, settings: CalculationSettings) {
  return getPaycheckCandidates(today, settings).find((date) => isAfterOrSame(date, today)) ?? today;
}

export function getFollowingPaycheckDate(today: ISODate, settings: CalculationSettings) {
  return getNextPaycheckDate(addDays(today, 1), settings);
}

export function getPreviousPaycheckDate(today: ISODate, settings: CalculationSettings) {
  const candidates = getPaycheckCandidates(today, settings).filter((date) => compareDates(date, today) < 0);
  return candidates[candidates.length - 1] ?? today;
}

export function getCurrentCycleBounds(today: ISODate, settings: CalculationSettings) {
  const next = getNextPaycheckDate(today, settings);
  const previous = getPreviousPaycheckDate(today, settings);
  return {
    startDate: previous,
    endDate: addDays(next, -1),
    nextPaycheckDate: next
  };
}

export function formatShortDate(date: ISODate) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short"
  }).format(parseISODate(date));
}

export function formatLongDate(date: ISODate) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short"
  }).format(parseISODate(date));
}

export function formatDateInput(date: ISODate) {
  return date;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
