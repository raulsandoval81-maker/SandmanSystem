import * as functions from "firebase-functions";
import { Resend } from "resend";

type EntryType =
  | "free_pass"
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
      en: "Zero to Hero™ Wrestling (Ages 7–13)",
      es: "Zero to Hero™ Lucha (Edades 7–13)"
    },

    path2legend: {
      en: "Path to Legend™ Wrestling (Ages 13+)",
      es: "Path to Legend™ Lucha (Edades 13+)"
    },

    road2greatness: {
      en: "Road to Greatness™ Boxing (Ages 14+)",
      es: "Road to Greatness™ Boxeo (Edades 14+)"
    },

    quest2mastery: {
      en: "Quest to Mastery™ MMA",
      es: "Quest to Mastery™ MMA"
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
Road to Greatness™ Boxing

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
Road to Greatness™ Boxing

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
      ? `Cada atleta comienza con:

• Evaluación
• Conversación
• Onboarding

Durante este proceso conoceremos al atleta, responderemos preguntas y recomendaremos el camino que mejor se adapte a sus metas.`
      : `Every athlete begins with:

• Assessment
• Conversation
• Onboarding

During this process we'll get to know the athlete, answer questions, and recommend the journey that's the best fit for their goals.`;

  const subjectBase = "Sandman Combat";

  if (entryType === "free_pass") {
    return {
      subject:
        lang === "es"
          ? `${subjectBase} — Evaluación de 1 Día`
          : `${subjectBase} — 1-Day Assessment`,

      text:
        lang === "es"
          ? `Bienvenido a Sandman Combat™.

Programa seleccionado: ${trackLabel}

Tu solicitud de Evaluación de 1 Día ha sido recibida.

La Evaluación de 1 Día está disponible solo para atletas locales. Los atletas de fuera del área deben elegir la Prueba de 3 Días.

${intakeProcess}

${waiverLink}

${locationBlock}

${scheduleBlock}

${adultFitness ? adultFitnessNote : combatNote}

${requirements}

Esta evaluación es solo una sesión de entrada. La participación continua será determinada por el coach después de la evaluación en persona.

— Sandman Combat™`
          : `Welcome to Sandman Combat™.

Selected Program: ${trackLabel}

Your 1-Day Assessment request has been received.

The 1-Day Assessment is available for local hometown athletes only. Out-of-town athletes should choose the 3-Day Trial.

${intakeProcess}

${waiverLink}

${locationBlock}

${scheduleBlock}

${adultFitness ? adultFitnessNote : combatNote}

${requirements}

This assessment is an entry session only. Ongoing participation is determined by the coach after in-person evaluation.

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

Tu solicitud de Prueba de 3 Días ha sido recibida.

La Prueba de 3 Días es ideal para atletas visitantes, familias de fuera del área y familias que desean conocer el ambiente antes de considerar membresía.

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

Your 3-Day Trial request has been received.

The 3-Day Trial is ideal for visiting athletes, out-of-town families, and families who want to experience the environment before considering membership.

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

Programas elegibles actuales:
• Zero to Hero™ Wrestling
• Path to Legend™ Wrestling
• Road to Greatness™ Boxing
• Kickboxing, Fitness y Defensa Personal

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

Current eligible programs:
• Zero to Hero™ Wrestling
• Path to Legend™ Wrestling
• Road to Greatness™ Boxing
• Kickboxing, Fitness & Self-Defense

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

Programas elegibles actuales:
• Zero to Hero™ Wrestling
• Path to Legend™ Wrestling
• Road to Greatness™ Boxing
• Kickboxing, Fitness y Defensa Personal

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

Current eligible programs:
• Zero to Hero™ Wrestling
• Path to Legend™ Wrestling
• Road to Greatness™ Boxing
• Kickboxing, Fitness & Self-Defense

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

Un coach revisará tu solicitud y determinará el siguiente paso basado en experiencia, madurez, seguridad, ajuste con la sala y ubicación apropiada.

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

A coach will review your submission and determine the next step based on experience, maturity, safety, room fit, and appropriate placement.

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

    const entryType = (data.entryType || "join") as EntryType;

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