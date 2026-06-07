import * as functions from "firebase-functions";
import { Resend } from "resend";

type EntryType = "free_pass" | "trial" | "join";

type ProgramTrack =
  | "zero2hero"
  | "path2legend"
  | "path2legend_boxing"
  | "road2greatness"
  | "quest2mastery"
  | "adult_fitness";

type Lang = "en" | "es";

function isSolvangTrack(programTrack: ProgramTrack) {
  return (
    programTrack === "path2legend_boxing" ||
    programTrack === "road2greatness" ||
    programTrack === "quest2mastery" ||
    programTrack === "adult_fitness"
  );
}

function getTrackLabel(programTrack: ProgramTrack, lang: Lang) {
  const labels = {
    zero2hero: {
      en: "Youth Wrestling — Zero2Hero",
      es: "Lucha juvenil — Zero2Hero"
    },
    path2legend: {
      en: "Teen Wrestling — Path2Legend",
      es: "Lucha adolescente — Path2Legend"
    },
    path2legend_boxing: {
      en: "Teen Boxing — Path2Legend",
      es: "Boxeo adolescente — Path2Legend"
    },
    road2greatness: {
      en: "Adult Boxing — Road2Greatness",
      es: "Boxeo adulto — Road2Greatness"
    },
    quest2mastery: {
      en: "Quest2Mastery MMA",
      es: "Quest2Mastery MMA"
    },
    adult_fitness: {
      en: "Teen / Adult Fitness, Kickboxing & Self Defense",
      es: "Fitness para adolescentes/adultos, Kickboxing y Defensa Personal"
    }
  };

  return labels[programTrack]?.[lang] || labels.zero2hero[lang];
}

export function buildEmail(
  entryType: EntryType,
  programTrack: ProgramTrack,
  lang: Lang
) {
  const solvang = isSolvangTrack(programTrack);
  const adultFitness = programTrack === "adult_fitness";
  const trackLabel = getTrackLabel(programTrack, lang);

  const waiverLink =
    lang === "es"
      ? `Si deseas completar la exención antes de llegar, visita:

https://sandmancombat.com/waiver`
      : `If you would like to complete the waiver before arrival, please visit:

https://sandmancombat.com/waiver`;

  const locationBlock =
    lang === "es"
      ? solvang
        ? `Ubicación:
320 Alisal Road
Suite 106
Solvang, CA`
        : `Ubicación:
Lompoc High School Wrestling Room — Room IA-1
515 W College Ave
Lompoc, CA 93436`
      : solvang
        ? `Practice Location:
320 Alisal Road
Suite 106
Solvang, CA`
        : `Practice Location:
Lompoc High School Wrestling Room — Room IA-1
515 W College Ave
Lompoc, CA 93436`;

  const scheduleBlock =
    lang === "es"
      ? programTrack === "path2legend_boxing"
        ? `Horario:
Martes / Jueves

Path2Legend Boxing:
5:00 PM – 6:00 PM

El coach confirmará la ubicación apropiada después de revisar la solicitud.`
        : programTrack === "road2greatness"
          ? `Horario:
Martes / Jueves

Road2Greatness Boxing:
6:00 PM – 7:30 PM

El coach confirmará la ubicación apropiada después de revisar la solicitud.`
          : adultFitness
            ? `Horario:
Martes / Jueves

Teen / Adult Fitness:
6:00 PM – 7:00 PM

El coach confirmará la ubicación apropiada después de revisar la solicitud.`
            : programTrack === "path2legend"
              ? `Horario:
Lunes / Miércoles / Viernes

Junior High Wrestling (Edades 10–13)
4:45 PM – 6:00 PM

High School Wrestling (Edades 13–18)
6:00 PM – 7:30 PM

El coach determinará el grupo de entrenamiento más apropiado después de la evaluación.`
              : `Horario:
Lunes / Miércoles / Viernes

Youth Wrestling (Edades 7–12)
4:00 PM – 4:45 PM

El coach determinará el grupo de entrenamiento más apropiado después de la evaluación.`
      : programTrack === "path2legend_boxing"
        ? `Schedule:
Tuesday / Thursday

Path2Legend Boxing:
5:00 PM – 6:00 PM

Coach will confirm appropriate placement after reviewing your request.`
        : programTrack === "road2greatness"
          ? `Schedule:
Tuesday / Thursday

Road2Greatness Boxing:
6:00 PM – 7:30 PM

Coach will confirm appropriate placement after reviewing your request.`
          : adultFitness
            ? `Schedule:
Tuesday / Thursday

Teen / Adult Fitness:
6:00 PM – 7:00 PM

Coach will confirm appropriate placement after reviewing your request.`
            : programTrack === "path2legend"
              ? `Schedule:
Monday / Wednesday / Friday

Junior High Wrestling (Ages 10–13)
4:45 PM – 6:00 PM

High School Wrestling (Ages 13–18)
6:00 PM – 7:30 PM

Coach will determine the most appropriate training group after evaluation.`
              : `Schedule:
Monday / Wednesday / Friday

Youth Wrestling (Ages 7–12)
4:00 PM – 4:45 PM

Coach will determine the most appropriate training group after evaluation.`;

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
Adult Fitness está enfocado en condición física, Kickboxing Fitness y defensa personal. No se requiere sparring.`
    : `Note:
Teen / Adult Fitness may include conditioning, kickboxing fitness, pad work, movement drills, and self-defense instruction. No sparring is required.`;

const combatNote =
  lang === "es"
    ? `Qué esperar:

No se requiere experiencia previa.

Sandman Combat está construido sobre un sistema de progresión estructurado donde los atletas desarrollan habilidades, confianza, disciplina y liderazgo paso a paso mediante entrenamiento constante y avance ganado.`
    : `What To Expect:

No previous experience is required.

Sandman Combat is built on a structured progression system where athletes develop skills, confidence, discipline, and leadership one step at a time through consistent training and earned advancement.`;

const subjectBase = "Sandman Combat";


  if (entryType === "free_pass") {
    return {
      subject:
        lang === "es"
          ? `${subjectBase} — Evaluación de 1 Día`
          : `${subjectBase} — 1-Day Assessment`,

      text:
        lang === "es"
          ? `Bienvenido a Sandman Combat.

Programa seleccionado: ${trackLabel}

Tu solicitud de Evaluación de 1 Día ha sido recibida.

Esta evaluación permite asistir a una sesión para que el cuerpo técnico pueda evaluar movimiento, conciencia, experiencia y ubicación apropiada.

Un coach revisará al participante y determinará el grupo de entrenamiento y progresión más apropiado.

${waiverLink}

${locationBlock}

${scheduleBlock}


${
  adultFitness
    ? adultFitnessNote + "\n"
    : combatNote + "\n"
}

${requirements}
Esta evaluación es solo una sesión de entrada. La participación continua será determinada por el coach después de la evaluación en persona.

— Sandman Combat`
          : `Welcome to Sandman Combat.

Selected Program: ${trackLabel}

Your 1-Day Assessment request has been received.

This assessment allows the participant to attend one session so the coaching staff can evaluate movement, awareness, experience level, and appropriate placement.

A coach will review the participant and determine the most appropriate training group and next step.

${waiverLink}

${locationBlock}

${scheduleBlock}

${
  adultFitness
    ? adultFitnessNote + "\n"
    : combatNote + "\n"
}

${requirements}
This assessment is an entry session only. Ongoing participation is determined by the coach after in-person evaluation.

— Sandman Combat`
    };
  }

  if (entryType === "trial") {
    return {
      subject:
        lang === "es"
          ? `${subjectBase} — Pase de 3 Días`
          : `${subjectBase} — 3-Day Pass`,

      text:
        lang === "es"
          ? `Bienvenido a Sandman Combat.

Programa seleccionado: ${trackLabel}

Tu solicitud de Pase de 3 Días ha sido recibida.

Este pase permite experimentar varias sesiones, conocer al equipo de entrenamiento y entender la estructura antes de considerar membresía.

Un coach revisará al participante y determinará el grupo de entrenamiento y progresión más apropiado.

Antes de participar, se requiere una exención firmada. Algunas actividades pueden requerir membresía, licencia, sanción o cobertura de seguro.

${waiverLink}

${locationBlock}

${scheduleBlock}


${
  adultFitness
    ? adultFitnessNote + "\n"
    : combatNote + "\n"
}

${requirements}

Completar el pase no garantiza membresía. La ubicación y participación continua serán determinadas por el coach.

— Sandman Combat`
          : `Welcome to Sandman Combat.

Selected Program: ${trackLabel}

Your 3-Day Pass request has been received.

This pass allows the participant to experience multiple sessions, meet the coaching staff, and understand the structure before membership consideration.

A coach will review the participant and determine the most appropriate training group and next step.

Before participating, a signed waiver is required. Some activities may require membership, licensing, sanctioning, or insurance coverage.

${waiverLink}

${locationBlock}

${scheduleBlock}

${
  adultFitness
    ? adultFitnessNote + "\n"
    : combatNote + "\n"
}

${requirements}

Completion of the pass does not guarantee membership. Placement and continued participation are determined by the coach.

— Sandman Combat`
    };
  }

  return {
    subject:
      lang === "es"
        ? `${subjectBase} — Solicitud de Membresía Recibida`
        : `${subjectBase} — Membership Request Received`,

    text:
      lang === "es"
        ? `Bienvenido a Sandman Combat.

Programa seleccionado: ${trackLabel}

Tu solicitud de membresía ha sido recibida.

Un coach revisará tu solicitud y determinará el siguiente paso basado en experiencia, madurez, seguridad, ajuste con la sala y ubicación apropiada.

Antes de participar regularmente, se requiere una exención firmada. Algunas actividades pueden requerir membresía, licencia, sanción o cobertura de seguro.

${waiverLink}

${locationBlock}

${scheduleBlock}


${
  adultFitness
    ? adultFitnessNote + "\n"
    : combatNote + "\n"
}

${requirements}
— Sandman Combat`
        : `Welcome to Sandman Combat.

Selected Program: ${trackLabel}

Your membership request has been received.

A coach will review your submission and determine the next step based on experience, maturity, safety, room fit, and appropriate placement.

Before regular participation, a signed waiver is required. Some activities may require membership, licensing, sanctioning, or insurance coverage.

${waiverLink}

${locationBlock}

${scheduleBlock}


${
  adultFitness
    ? adultFitnessNote + "\n"
    : combatNote + "\n"
}

${requirements}
— Sandman Combat`
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