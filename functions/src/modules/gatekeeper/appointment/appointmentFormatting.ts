import {
  Language
} from "./appointmentTypes";

export function clean(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

export function formatAppointmentDate(
  value: string,
  lang: Language
): string {
  const match =
    value.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (!match) {
    return value;
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        12
      )
    );

  return new Intl.DateTimeFormat(
    lang === "es"
      ? "es-US"
      : "en-US",
    {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone:
        "America/Los_Angeles"
    }
  ).format(date);
}

export function formatAppointmentTime(
  value: string
): string {
  const match =
    value.match(
      /^(\d{1,2}):(\d{2})$/
    );

  if (!match) {
    return value;
  }

  let hour =
    Number(match[1]);

  const minute =
    match[2];

  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23
  ) {
    return value;
  }

  const period =
    hour >= 12
      ? "PM"
      : "AM";

  hour =
    hour % 12 || 12;

  return `${hour}:${minute} ${period}`;
}

export function escapeHtml(
  value: unknown
): string {
  return String(
    value ?? ""
  )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
