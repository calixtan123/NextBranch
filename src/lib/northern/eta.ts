import type { Timetable } from "./schemas";
import type { Train } from "./predictions";
type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
};
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "long",
  hourCycle: "h23",
});
function local(date: Date): Parts {
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    weekday: values.weekday ?? "",
  };
}
function serviceDayMatches(name: string, weekday: string): boolean {
  const day = weekday.toLowerCase();
  const n = name.toLowerCase();
  return day === "monday" ||
    day === "tuesday" ||
    day === "wednesday" ||
    day === "thursday"
    ? n.includes("monday")
    : day === "friday"
      ? n.includes("friday")
      : n.includes(day);
}
function sameDate(a: Parts, b: Parts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}
function priorDay(date: Date): Parts {
  return local(new Date(date.getTime() - 24 * 60 * 60_000));
}
/** Resolves a single service-local scheduled origin and cumulative-minute interval ETA. */
export function timetableEta(
  train: Train,
  timetable: Timetable,
  destination: string,
  now = new Date(),
): { arrival: string; seconds: number; runtimeMinutes: number } | null {
  if (timetable.lineId !== "northern") return null;
  const expected = new Date(train.expectedArrival);
  const expectedLocal = local(expected);
  const journeys: Array<{
    route: Timetable["timetable"]["routes"][number];
    departure: Date;
    intervalId: string;
  }> = [];
  for (const route of timetable.timetable.routes)
    for (const schedule of route.schedules) {
      for (const journey of schedule.knownJourneys) {
        const hour = Number(journey.hour),
          minute = Number(journey.minute);
        if (!Number.isInteger(hour) || !Number.isInteger(minute)) continue;
        const serviceDate = hour > 23 ? priorDay(expected) : expectedLocal;
        if (!serviceDayMatches(schedule.name, serviceDate.weekday)) continue;
        for (let offset = -30; offset <= 30; offset++) {
          const departure = new Date(expected.getTime() + offset * 60_000);
          const parts = local(departure);
          if (
            parts.hour === hour % 24 &&
            parts.minute === minute &&
            sameDate(parts, expectedLocal)
          )
            journeys.push({
              route,
              departure,
              intervalId: String(journey.intervalId),
            });
        }
      }
    }
  if (journeys.length !== 1) return null;
  const chosen = journeys[0]!;
  const intervals = chosen.route.stationIntervals.filter(
    (entry) => String(entry.id) === chosen.intervalId,
  );
  if (intervals.length !== 1) return null;
  const targets = intervals[0]!.intervals.filter(
    (entry) =>
      entry.stopId === destination && entry.timeToArrival !== undefined,
  );
  if (targets.length !== 1) return null;
  const runtime = targets[0]!.timeToArrival;
  if (runtime === undefined || !Number.isFinite(runtime) || runtime <= 0) return null;
  const arrival = new Date(chosen.departure.getTime() + runtime * 60_000);
  return {
    arrival: arrival.toISOString(),
    seconds: Math.round((arrival.getTime() - now.getTime()) / 1000),
    runtimeMinutes: runtime,
  };
}
/** Returns the scheduled origin-to-destination runtime used to gate live ETA. */
export function scheduledRuntime(
  train: Train,
  timetable: Timetable,
  destination: string,
): { minutes: number } | null {
  const value = timetableEta(
    train,
    timetable,
    destination,
    new Date(train.expectedArrival),
  );
  return value ? { minutes: value.runtimeMinutes } : null;
}
