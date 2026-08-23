import {
  AppointmentLocation
} from "./appointmentTypes";

export function isSupportedLocation(
  location: string
): location is AppointmentLocation {
  return (
    location === "lompoc" ||
    location === "santa-ynez-valley" ||
    location === "elk-grove"
  );
}

export function getLocationName(
  location: AppointmentLocation
): string {
  const names: Record<
    AppointmentLocation,
    string
  > = {
    lompoc: "Lompoc",
    "santa-ynez-valley": "Santa Ynez Valley",
    "elk-grove": "Elk Grove"
  };

  return names[location];
}

export function getLocationAddress(
  location: AppointmentLocation
): string {
  if (location === "lompoc") {
    return [
      "Lompoc High School Wrestling Room — Room IA-1",
      "515 W College Ave",
      "Lompoc, CA 93436"
    ].join("\n");
  }

  if (location === "elk-grove") {
    return [
      "Location details will be confirmed",
      "by the academy team."
    ].join("\n");
  }

  return [
    "320 Alisal Road",
    "Suite 106",
    "Solvang, CA 93463"
  ].join("\n");
}
