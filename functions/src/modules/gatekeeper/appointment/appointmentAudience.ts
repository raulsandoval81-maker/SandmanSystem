import {
  AppointmentLead,
  Language,
  RegistrantRole
} from "./appointmentTypes";

import {
  clean
} from "./appointmentFormatting";

export type AppointmentAudience = {
  role: RegistrantRole;
  registrantName: string;
  participantName: string;

  greetingName: string;
  participantLabel: string;

  isAdultAthlete: boolean;
};

export function resolveAppointmentAudience(
  lead: AppointmentLead,
  lang: Language
): AppointmentAudience {
  const role: RegistrantRole =
    lead.registrantRole ===
      "adult-athlete"
      ? "adult-athlete"
      : "parent-guardian";

  const registrantName =
    clean(
      lead.registrantName ||
      lead.contactName ||
      lead.parentName
    ) ||
    (
      lang === "es"
        ? "Participante"
        : "Participant"
    );

  const participantName =
    clean(
      lead.participantName ||
      lead.athleteName ||
      registrantName
    );

  const isAdultAthlete =
    role === "adult-athlete";

  const greetingName =
    registrantName;

  const participantLabel =
    participantName ||
    (
      isAdultAthlete
        ? (
          lang === "es"
            ? "Tú"
            : "You"
        )
        : (
          lang === "es"
            ? "Tu atleta"
            : "Your athlete"
        )
    );

  return {
    role,
    registrantName,
    participantName:
      participantName ||
      participantLabel,
    greetingName,
    participantLabel,
    isAdultAthlete
  };
}
