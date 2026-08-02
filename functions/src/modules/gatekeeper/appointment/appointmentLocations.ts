import {
  AppointmentLocation
} from "./appointmentTypes";

export function isSupportedLocation(
  location: string
): location is AppointmentLocation {
  return (
    location === "lompoc" ||
    location === "solvang"
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
    solvang: "Solvang"
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

  return [
    "320 Alisal Road",
    "Suite 106",
    "Solvang, CA 93463"
  ].join("\n");
}
