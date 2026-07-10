import * as functions from "firebase-functions";
import { Resend } from "resend";

type EntryType =
  | "appointment"
  | "trial"
  | "join"
  | "unlimited"
  | "family_wellness";

type ProgramTrack =
  | "zero2hero"
  | "path2legend"
  | "road2greatness"
  | "quest2mastery"
  | "adult_fitness"
  | "fitness";

type Lang = "en" | "es";

function normalizeTrack(programTrack: ProgramTrack): ProgramTrack {
  if (programTrack === "fitness") return "adult_fitness";

  // Backward compatibility for older links and saved requests.
  if (programTrack === "road2greatness") return "path2legend";

  return programTrack;
}

function isFitnessTrack(programTrack: ProgramTrack) {
  return normalizeTrack(programTrack) === "adult_fitness";
}

function isSolvangTrack(programTrack: ProgramTrack) {
  const track = normalizeTrack(programTrack);

  return (
    track === "road2greatness" ||
    track === "quest2mastery" ||
    track === "adult_fitness"
  );
}

function getTrackLabel(programTrack: ProgramTrack, lang: Lang) {
  const track = normalizeTrack(programTrack);

  const labels = {
    zero2hero: {
      en: "Zero2Hero™ — Wrestling or Kickboxing (Ages 6–13)",
      es: "Zero2Hero™ — Lucha o Kickboxing (Edades 6–13)"
    },

    path2legend: {
      en: "Path2Legend™ — Wrestling or Boxing (Ages 14+)",
      es: "Path2Legend™ — Lucha o Boxeo (Edades 14+)"
    },

    road2greatness: {
      en: "Path2Legend™ — Boxing (Ages 14+)",
      es: "Path2Legend™ — Boxeo (Edades 14+)"
    },

    quest2mastery: {
      en: "Quest2Mastery™ MMA (Ages 16+ · Coming Soon)",
      es: "Quest2Mastery™ MMA (Edades 16+ · Próximamente)"
    },

    adult_fitness: {
      en: "Kickboxing, Fitness & Self-Defense (Ages 12+)",
      es: "Kickboxing, Fitness y Defensa Personal (Edades 12+)"
    },

    fitness: {
      en: "Kickboxing, Fitness & Self-Defense (Ages 12+)",
      es: "Kickboxing, Fitness y Defensa Personal (Edades 12+)"
    }
  };

  return labels[track]?.[lang] || labels.zero2hero[lang];
}

function getLocationBlock(programTrack: ProgramTrack, lang: Lang) {
  const track = normalizeTrack(programTrack);

  if (track === "zero2hero") {
    return lang === "es"
      ? `Ubicaciones:
Lompoc High School Wrestling Room — Room IA-1
515 W College Ave
Lompoc, CA 93436

Solvang
320 Alisal Road
Suite 106
Solvang, CA`
      : `Practice Locations:
Lompoc High School Wrestling Room — Room IA-1
515 W College Ave
Lompoc, CA 93436

Solvang
320 Alisal Road
Suite 106
Solvang, CA`;
  }

  if (track === "path2legend") {
    return lang === "es"
      ? `Ubicación:
Lompoc High School Wrestling Room — Room IA-1
515 W College Ave
Lompoc, CA 93436`
      : `Practice Location:
Lompoc High School Wrestling Room — Room IA-1
515 W College Ave
Lompoc, CA 93436`;
  }

  return lang === "es"
    ? `Ubicación:
320 Alisal Road
Suite 106
Solvang, CA`
    : `Practice Location:
320 Alisal Road
Suite 106
Solvang, CA`;
}

function getScheduleBlock(programTrack: ProgramTrack, lang: Lang) {
  const track = normalizeTrack(programTrack);

  if (lang === "es") {
    if (track === "zero2hero") {
      return `Horario:
Zero to Hero™ Wrestling

Lompoc:
Lunes / Miércoles
4:45 PM – 6:00 PM

Solvang:
Martes / Jueves
4:45 PM – 6:00 PM

Los atletas pueden asistir a cualquiera de las ubicaciones con aprobación del coach y según disponibilidad.

Sesiones adicionales de viernes o sábado pueden ofrecerse en un horario rotativo. Los fines de semana de competencia tienen prioridad.`;
    }

    if (track === "path2legend") {
      return `Horario:
Path to Legend™ Wrestling

Lompoc:
Lunes / Miércoles
6:00 PM – 7:30 PM

Edad típica: 13+

El rango de edad es una guía general. La colocación final será determinada por el cuerpo técnico según madurez, experiencia, tamaño, seguridad y preparación.

Sesiones adicionales de viernes o sábado pueden ofrecerse en un horario rotativo. Los fines de semana de competencia tienen prioridad.`;
    }

    if (track === "road2greatness") {
      return `Horario:
Path2Legend™ Boxing

Solvang:
Martes / Jueves
6:00 PM – 7:30 PM

Edad típica: 14+

Sesiones adicionales de viernes o sábado pueden ofrecerse en un horario rotativo. Los fines de semana de competencia tienen prioridad.`;
    }

    if (track === "adult_fitness") {
      return `Horario:
Kickboxing, Fitness y Defensa Personal

Solvang:
Martes / Jueves
6:00 PM – 7:00 PM

Esta clase desarrolla condición física, confianza, movimiento, fundamentos de kickboxing y defensa personal práctica mediante entrenamiento estructurado.

Sesiones adicionales de viernes o sábado pueden ofrecerse en un horario rotativo.`;
    }

    return `Horario:
El coach confirmará el horario apropiado después de revisar la solicitud.`;
  }

  if (track === "zero2hero") {
    return `Schedule:
Zero to Hero™ Wrestling

Lompoc:
Monday / Wednesday
4:45 PM – 6:00 PM

Solvang:
Tuesday / Thursday
4:45 PM – 6:00 PM

Athletes may attend either location with coach approval and subject to availability.

Additional Friday or Saturday sessions may be offered on a rotating schedule. Competition weekends take priority.`;
  }

  if (track === "path2legend") {
    return `Schedule:
Path to Legend™ Wrestling

Lompoc:
Monday / Wednesday
6:00 PM – 7:30 PM

Typical Age: 13+

Age ranges are general guidelines. Final placement is determined by the coaching staff based on maturity, experience, size, safety, and readiness.

Additional Friday or Saturday sessions may be offered on a rotating schedule. Competition weekends take priority.`;
  }

  if (track === "road2greatness") {
    return `Schedule:
Path2Legend™ Boxing

Solvang:
Tuesday / Thursday
6:00 PM – 7:30 PM

Typical Age: 14+

Additional Friday or Saturday sessions may be offered on a rotating schedule. Competition weekends take priority.`;
  }

  if (track === "adult_fitness") {
    return `Schedule:
Kickboxing, Fitness & Self-Defense

Solvang:
Tuesday / Thursday
6:00 PM – 7:00 PM

This class builds conditioning, confidence, movement, kickboxing fundamentals, and practical self-defense through structured coach-led training.

Additional Friday or Saturday sessions may be offered on a rotating schedule.`;
  }

  return `Schedule:
Coach will confirm the appropriate schedule after reviewing your request.`;
}

export function buildEmail(
  entryType: EntryType,
  programTrack: ProgramTrack,
  lang: Lang
) {
  const track = normalizeTrack(programTrack);
  const adultFitness = isFitnessTrack(track);
  const trackLabel = getTrackLabel(track, lang);
  const locationBlock = getLocationBlock(track, lang);
  const scheduleBlock = getScheduleBlock(track, lang);

  const waiverLink =
    lang === "es"
      ? `Si deseas completar la exención antes de llegar, visita:

https://sandmancombat.com/waiver`
      : `If you would like to complete the waiver before arrival, please visit:

https://sandmancombat.com/waiver`;

  const requirements =
    lang === "es"
      ? `Requisitos:
• Exención de responsabilidad firmada
• Ropa atlética o equipo de entrenamiento
• Botella de agua
• Membresía, licencia, sanción o seguro si el programa o evento lo requiere`
      : `Requirements:
• Signed liability waiver
• Athletic clothing or training gear
• Water bottle
• Membership, licensing, sanctioning, or insurance coverage if required by the program or event`;

  const adultFitnessNote =
    lang === "es"
      ? `Nota:
Kickboxing, Fitness y Defensa Personal puede incluir condición física, fundamentos de kickboxing, trabajo con almohadillas, movimiento y defensa personal práctica. No se requiere sparring.`
      : `Note:
Kickboxing, Fitness & Self-Defense may include conditioning, kickboxing fundamentals, pad work, movement drills, and practical self-defense instruction. No sparring is required.`;

  const combatNote =
    lang === "es"
      ? `Qué esperar:

No se requiere experiencia previa.

Sandman Combat™ está construido sobre un sistema de progresión estructurado donde los atletas desarrollan habilidades, confianza, disciplina y liderazgo paso a paso mediante entrenamiento constante y avance ganado.`
      : `What To Expect:

No previous experience is required.

Sandman Combat™ is built on a structured progression system where athletes develop skills, confidence, discipline, and leadership one step at a time through consistent training and earned advancement.`;

  const intakeProcess =
    lang === "es"
      ? `Cada familia comienza con:

• Contacto
• Seguimiento del entrenador
• Cita programada

Durante la cita hablaremos sobre el programa, responderemos preguntas, revisaremos las metas de la familia y explicaremos los próximos pasos.`
      : `Every family begins with:

• Contact
• Coach follow-up
• Scheduled appointment

During the appointment we'll discuss the program, answer questions, review your family's goals, and explain the next steps.`;

  const subjectBase = "Sandman Combat";

  if (entryType === "appointment") {
    return {
      subject:
        lang === "es"
          ? `${subjectBase} — Solicitud de Cita Recibida`
          : `${subjectBase} — Appointment Request Received`,

      text:
        lang === "es"
          ? `Gracias por comunicarte con Sandman Combat™.

Programa de interés: ${trackLabel}

Recibimos tu solicitud.

Un representante de Sandman revisará tu información y se comunicará contigo para programar una cita.

${intakeProcess}

Durante la cita podremos hablar sobre:
• El programa y su estructura
• Las metas del atleta o la familia
• Horarios y disponibilidad
• Expectativas y estándares de entrenamiento
• Membresía y próximos pasos

No debes presentarte a una práctica sin una cita o confirmación previa.

— Sandman Combat™`
          : `Thank you for contacting Sandman Combat™.

Program of Interest: ${trackLabel}

We received your request.

A Sandman representative will review your information and contact you to schedule an appointment.

${intakeProcess}

During the appointment we can discuss:
• The program and its structure
• Athlete or family goals
• Scheduling and availability
• Training expectations and standards
• Membership and next steps

Please do not arrive for a practice without a scheduled appointment or prior confirmation.

— Sandman Combat™`
    };
  }

  if (entryType === "trial") {
    return {
      subject:
        lang === "es"
          ? `${subjectBase} — Prueba de 3 Días`
          : `${subjectBase} — 3-Day Trial`,

      text:
        lang === "es"
          ? `Bienvenido a Sandman Combat™.

Programa seleccionado: ${trackLabel}

Tu consulta sobre una prueba ha sido recibida.

Un coach se comunicará contigo para programar una cita antes de aprobar cualquier participación en el entrenamiento.

${intakeProcess}

Antes de participar, se requiere una exención firmada. Puede requerirse membresía adicional para continuar en clases regulares después de la prueba.

${waiverLink}

${locationBlock}

${scheduleBlock}

${adultFitness ? adultFitnessNote : combatNote}

${requirements}

Completar la prueba no garantiza membresía. La ubicación y participación continua serán determinadas por el coach.

— Sandman Combat™`
          : `Welcome to Sandman Combat™.

Selected Program: ${trackLabel}

Your trial inquiry has been received.

A coach will contact you to schedule an appointment before any training participation is approved.

${intakeProcess}

Before participating, a signed waiver is required. Additional membership may be required to continue in regular classes after the trial.

${waiverLink}

${locationBlock}

${scheduleBlock}

${adultFitness ? adultFitnessNote : combatNote}

${requirements}

Completion of the trial does not guarantee membership. Placement and continued participation are determined by the coach.

— Sandman Combat™`
    };
  }

  if (entryType === "unlimited") {
    return {
      subject:
        lang === "es"
          ? `${subjectBase} — Membresía Ilimitada para Atleta`
          : `${subjectBase} — Unlimited Athlete Membership`,

      text:
        lang === "es"
          ? `Bienvenido a Sandman Combat™.

Programa seleccionado: ${trackLabel}

Tu solicitud de Membresía Ilimitada para Atleta ha sido recibida.

Esta opción está diseñada para atletas que desean entrenar en múltiples programas elegibles de Sandman Combat™.

${intakeProcess}

Un coach revisará la solicitud, hablará contigo sobre las metas del atleta y recomendará el horario de entrenamiento más apropiado.

Programas actuales:
• Zero2Hero™ Wrestling
• Zero2Hero™ Kickboxing
• Path2Legend™ Wrestling
• Path2Legend™ Boxing

La participación en cada programa depende de edad, madurez, seguridad, disponibilidad y aprobación del coach.

${waiverLink}

${locationBlock}

${scheduleBlock}

${adultFitness ? adultFitnessNote : combatNote}

${requirements}

— Sandman Combat™`
          : `Welcome to Sandman Combat™.

Selected Program: ${trackLabel}

Your Unlimited Athlete Membership request has been received.

This option is designed for athletes who want to train across multiple eligible Sandman Combat™ programs.

${intakeProcess}

A coach will review the request, discuss the athlete's goals, and recommend the most appropriate training schedule.

Current programs:
• Zero2Hero™ Wrestling
• Zero2Hero™ Kickboxing
• Path2Legend™ Wrestling
• Path2Legend™ Boxing

Participation in each program depends on age, maturity, safety, availability, and coach approval.

${waiverLink}

${locationBlock}

${scheduleBlock}

${adultFitness ? adultFitnessNote : combatNote}

${requirements}

— Sandman Combat™`
    };
  }

  if (entryType === "family_wellness") {
    return {
      subject:
        lang === "es"
          ? `${subjectBase} — Membresía Familiar de Bienestar`
          : `${subjectBase} — Family Wellness Membership`,

      text:
        lang === "es"
          ? `Bienvenido a Sandman Combat™.

Tu solicitud de Membresía Familiar de Bienestar ha sido recibida.

Esta membresía está diseñada para familias que desean entrenar juntas.

Los atletas elegibles participan en sus caminos de Sandman Combat™, mientras los padres pueden participar en clases de Kickboxing, Fitness y Defensa Personal.

${intakeProcess}

Un coach revisará la solicitud y se comunicará contigo para hablar sobre:
• Atletas elegibles
• Metas familiares
• Horarios disponibles
• El mejor plan de membresía para tu familia

Programas actuales:
• Zero2Hero™ Wrestling
• Zero2Hero™ Kickboxing
• Path2Legend™ Wrestling
• Path2Legend™ Boxing

La participación en cada programa depende de edad, madurez, seguridad, disponibilidad y aprobación del coach.

${waiverLink}

${locationBlock}

${scheduleBlock}

${adultFitnessNote}

${requirements}

— Sandman Combat™`
          : `Welcome to Sandman Combat™.

Your Family Wellness Membership request has been received.

This membership is designed for families who want to train together.

Eligible athletes participate in their Sandman Combat™ journeys while parents may participate in Kickboxing, Fitness & Self-Defense classes.

${intakeProcess}

A coach will review the request and contact you to discuss:
• Eligible athletes
• Family goals
• Available schedules
• The best membership option for your family

Current programs:
• Zero2Hero™ Wrestling
• Zero2Hero™ Kickboxing
• Path2Legend™ Wrestling
• Path2Legend™ Boxing

Participation in each program depends on age, maturity, safety, availability, and coach approval.

${waiverLink}

${locationBlock}

${scheduleBlock}

${adultFitnessNote}

${requirements}

— Sandman Combat™`
    };
  }

  return {
    subject:
      lang === "es"
        ? `${subjectBase} — Solicitud de Membresía Recibida`
        : `${subjectBase} — Membership Request Received`,

    text:
      lang === "es"
        ? `Bienvenido a Sandman Combat™.

Programa seleccionado: ${trackLabel}

Tu solicitud de membresía ha sido recibida.

${intakeProcess}

Un coach revisará tu solicitud y se comunicará contigo para programar una cita y hablar sobre el siguiente paso apropiado.

Antes de participar regularmente, se requiere una exención firmada. Puede requerirse membresía adicional para continuar en clases regulares.

${waiverLink}

${locationBlock}

${scheduleBlock}

${adultFitness ? adultFitnessNote : combatNote}

${requirements}

— Sandman Combat™`
        : `Welcome to Sandman Combat™.

Selected Program: ${trackLabel}

Your membership request has been received.

${intakeProcess}

A coach will review your submission and contact you to schedule an appointment and discuss the appropriate next step.

Before regular participation, a signed waiver is required. Additional membership may be required to continue in regular classes.

${waiverLink}

${locationBlock}

${scheduleBlock}

${adultFitness ? adultFitnessNote : combatNote}

${requirements}

— Sandman Combat™`
  };
}

export const sendGatekeeperEmail = functions.firestore
  .document("paraParentInbox/{id}")
  .onCreate(async (snap) => {
    const data = snap.data();

    if (data.category !== "join") return;
    if (!data.parentEmail) return;

    const resendKey = functions.config().resend?.key;

    if (!resendKey) {
      console.error("Missing Resend API key");
      return;
    }

    const entryType = (data.entryType || "appointment") as EntryType;

    const programTrack = (
      data.programTrack ||
      data.track ||
      "zero2hero"
    ) as ProgramTrack;

    const lang = (data.lang || "en") as Lang;
    const email = buildEmail(entryType, programTrack, lang);

    const resend = new Resend(resendKey);

    const result = await resend.emails.send({
      from: "Sandman Combat <join@sandmancombat.com>",
      to: data.parentEmail,
      subject: email.subject,
      text: email.text
    });

    console.log("EMAIL RESULT:", JSON.stringify(result));
  });