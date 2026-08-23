export type AppointmentLocation =
  | "lompoc"
  | "santa-ynez-valley"
  | "elk-grove";

export type Language =
  | "en"
  | "es";

export type AdmissionsPath =
  | "new"
  | "assessment";

export type RegistrantRole =
  | "parent-guardian"
  | "adult-athlete";

export type AppointmentLead = {
  email?: string;

  academyId?: string;
  academyName?: string;
  locationId?: string;

  interestType?: "combat" | "fitness" | "both";

  registrantRole?: RegistrantRole;
  registrantName?: string;
  contactName?: string;

  parentName?: string;
  participantName?: string;
  athleteName?: string;

  lang?: Language;

  admissionsPath?: AdmissionsPath;

  appointmentDate?: string;
  appointmentTime?: string;
  appointmentLocation?: AppointmentLocation;
  appointmentCoach?: string;
  appointmentNotes?: string;

  appointmentConfirmationStatus?: string;
  appointmentConfirmationError?: string;
  appointmentEmailId?: string;
};

export type AppointmentEmail = {
  subject: string;
  text: string;
  html: string;
};
