export const SCHEDULE_TIMEZONE = "America/Los_Angeles";

const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function timeToMinutes(value = "") {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}

export function pacificClock(now = new Date(), timezone = SCHEDULE_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value || "";
  return { day: value("weekday"), minutes: Number(value("hour")) * 60 + Number(value("minute")) };
}

export function resolveLocationScheduleLiveState(rows = [], now = new Date(), timezone = SCHEDULE_TIMEZONE) {
  const clock = pacificClock(now, timezone);
  const todayRows = rows
    .filter((row) => String(row.day || "").toLowerCase().includes(clock.day.toLowerCase()))
    .map((row) => ({ ...row, startMinutes: timeToMinutes(row.start), endMinutes: timeToMinutes(row.end) }))
    .filter((row) => row.startMinutes !== null && row.endMinutes !== null)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const active = todayRows.find((row) => clock.minutes >= row.startMinutes && clock.minutes < row.endMinutes);
  if (active) return { state: "active", row: active, todayRows, day: clock.day, minutesUntil: 0 };
  const next = todayRows.find((row) => row.startMinutes > clock.minutes);
  if (next) return { state: "next", row: next, todayRows, day: clock.day, minutesUntil: next.startMinutes - clock.minutes };
  return { state: todayRows.length ? "complete" : "empty", row: null, todayRows, day: clock.day, minutesUntil: null };
}

export function nextScheduledSession(rows = [], now = new Date(), timezone = SCHEDULE_TIMEZONE) {
  const clock = pacificClock(now, timezone);
  const todayIndex = DAY_ORDER.indexOf(clock.day);
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = DAY_ORDER[(todayIndex + offset) % 7];
    const candidates = rows.filter((row) => String(row.day || "").toLowerCase().includes(day.toLowerCase())).sort((a, b) => (timeToMinutes(a.start) ?? 9999) - (timeToMinutes(b.start) ?? 9999));
    if (candidates.length) return { day, row: candidates[0] };
  }
  return null;
}
