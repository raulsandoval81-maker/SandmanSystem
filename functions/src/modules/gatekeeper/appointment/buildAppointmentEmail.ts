import {
  AppointmentEmail,
  AppointmentLead,
  Language
} from "./appointmentTypes";

import {
  clean,
  escapeHtml,
  formatAppointmentDate,
  formatAppointmentTime
} from "./appointmentFormatting";

import {
  getLocationAddress,
  getLocationName,
  isSupportedLocation
} from "./appointmentLocations";

export function buildAppointmentEmail(
  lead: AppointmentLead
): AppointmentEmail {
  const lang: Language =
    lead.lang === "es"
      ? "es"
      : "en";

  const parentName =
    clean(lead.parentName) ||
    (
      lang === "es"
        ? "Padre, madre o tutor"
        : "Parent or Guardian"
    );

  const athleteName =
    clean(lead.athleteName) ||
    (
      lang === "es"
        ? "Tu atleta"
        : "Your athlete"
    );

  const appointmentDate =
    clean(lead.appointmentDate);

  const appointmentTime =
    clean(lead.appointmentTime);

  const appointmentLocation =
    clean(
      lead.appointmentLocation
    );

  const appointmentCoach =
    clean(
      lead.appointmentCoach
    );

  const appointmentNotes =
    clean(
      lead.appointmentNotes
    );

  const admissionsPath =
    lead.admissionsPath === "assessment"
      ? "assessment"
      : "new";

  if (
    !appointmentDate ||
    !appointmentTime ||
    !appointmentLocation ||
    !appointmentCoach
  ) {
    throw new Error(
      "Appointment date, time, location, or coach is missing."
    );
  }

  if (
    !isSupportedLocation(
      appointmentLocation
    )
  ) {
    throw new Error(
      `Unsupported appointment location: ${appointmentLocation}`
    );
  }

  const formattedDate =
    formatAppointmentDate(
      appointmentDate,
      lang
    );

  const formattedTime =
    formatAppointmentTime(
      appointmentTime
    );

  const academyName =
    getLocationName(
      appointmentLocation
    );

  const academyAddress =
    getLocationAddress(
      appointmentLocation
    );


  const startingPathMessage =
    admissionsPath === "assessment"
      ? `Your athlete is scheduled for a Placement Assessment.
During your visit, the coach will observe your athlete, evaluate their current experience, and determine the most appropriate starting point within the Sandman System.`
      : `Your athlete is beginning as a New Athlete.

During your visit, your athlete will meet the coach, observe or participate as appropriate, and receive an introduction to the academy before beginning their journey.`;

  const startingPathMessageEs =
    admissionsPath === "assessment"
      ? `Tu atleta asistirá a una Evaluación de Colocación.

Durante la visita, el coach observará a tu atleta, evaluará su experiencia actual y recomendará el punto de inicio más apropiado dentro del Sistema Sandman.`
      : `Tu atleta comenzará como Atleta Nuevo.

Durante la visita, tu atleta conocerá al coach, observará o participará según corresponda y recibirá una introducción a la academia antes de comenzar su trayectoria.`;


  const addressHtml =
    academyAddress
      .split("\n")
      .map(escapeHtml)
      .join("<br>");

  const notesHtml =
    appointmentNotes
      ? `
        <div style="margin-top:24px;padding:18px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
          <div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#8a6500;margin-bottom:8px;">
            ${lang === "es" ? "Notas del Coach" : "Coach Notes"}
          </div>
          <div style="font-size:15px;line-height:1.65;color:#27272a;white-space:pre-line;">
            ${escapeHtml(appointmentNotes)}
          </div>
        </div>
      `
      : "";

  const html =
`<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${lang === "es"
    ? "Tu Cita de Admisión Está Programada"
    : "Your Admissions Appointment Is Scheduled"}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f4f5;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.08);">
          <tr>
            <td style="padding:28px 30px;background:#09090b;text-align:center;border-bottom:4px solid #d4a900;">
              <div style="font-size:24px;font-weight:900;letter-spacing:.08em;color:#facc15;">SANDMAN COMBAT</div>
              <div style="margin-top:7px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#d4d4d8;">Heroes Build Heroes™</div>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <div style="display:inline-block;padding:7px 11px;border-radius:999px;background:#ecfdf5;color:#166534;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">
                ${lang === "es" ? "Cita Confirmada" : "Appointment Confirmed"}
              </div>

              <h1 style="margin:18px 0 12px;font-size:27px;line-height:1.25;color:#18181b;">
                ${lang === "es"
                  ? `Hola ${escapeHtml(parentName)}`
                  : `Hello ${escapeHtml(parentName)}`}
              </h1>

              <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#52525b;">
                ${lang === "es"
                  ? "Gracias por programar tu Cita de Admisión con Sandman Combat. Esperamos conocer a tu familia, aprender más sobre tu atleta y escuchar cuáles son sus metas."
                  : "Thank you for scheduling your Sandman Combat Admissions Appointment. We look forward to meeting your family, learning more about your athlete, and hearing about your goals."}
              </p>

              <div style="padding:22px;border-radius:14px;background:#fafafa;border:1px solid #e4e4e7;">
                <div style="margin-bottom:16px;font-size:13px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#8a6500;">
                  ${lang === "es" ? "Tu Cita de Admisión" : "Your Admissions Appointment"}
                </div>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr><td style="padding:7px 0;width:34%;font-size:14px;font-weight:700;color:#71717a;">${lang === "es" ? "Atleta" : "Athlete"}</td><td style="padding:7px 0;font-size:15px;color:#18181b;">${escapeHtml(athleteName)}</td></tr>
                  <tr><td style="padding:7px 0;font-size:14px;font-weight:700;color:#71717a;">${lang === "es" ? "Fecha" : "Date"}</td><td style="padding:7px 0;font-size:15px;color:#18181b;">${escapeHtml(formattedDate)}</td></tr>
                  <tr><td style="padding:7px 0;font-size:14px;font-weight:700;color:#71717a;">${lang === "es" ? "Hora" : "Time"}</td><td style="padding:7px 0;font-size:15px;color:#18181b;">${escapeHtml(formattedTime)}</td></tr>
                  <tr><td style="padding:7px 0;font-size:14px;font-weight:700;color:#71717a;">Coach</td><td style="padding:7px 0;font-size:15px;color:#18181b;">${escapeHtml(appointmentCoach)}</td></tr>
                  <tr><td style="padding:7px 0;font-size:14px;font-weight:700;color:#71717a;">${lang === "es" ? "Academia" : "Academy"}</td><td style="padding:7px 0;font-size:15px;color:#18181b;">${escapeHtml(academyName)}</td></tr>
                  <tr><td style="padding:7px 0;vertical-align:top;font-size:14px;font-weight:700;color:#71717a;">${lang === "es" ? "Dirección" : "Address"}</td><td style="padding:7px 0;font-size:15px;line-height:1.55;color:#18181b;">${addressHtml}</td></tr>
                </table>
              </div>

              <h2 style="margin:28px 0 10px;font-size:19px;color:#18181b;">${lang === "es" ? "Qué Puedes Esperar" : "What to Expect"}</h2>
              <p style="margin:0;font-size:15px;line-height:1.7;color:#52525b;">
                ${lang === "es"
                  ? "Tu familia tendrá la oportunidad de conocer al coach, aprender sobre los estándares de la academia, hablar sobre sus metas y hacer preguntas. El coach explicará el próximo paso apropiado según las metas y la experiencia de tu atleta."
                  : "Your family will have an opportunity to meet the coach, learn about academy standards, discuss your goals, and ask questions. Your coach will explain the appropriate next step based on your athlete’s goals and experience."}
              </p>

              <h2 style="margin:28px 0 10px;font-size:19px;color:#18181b;">${lang === "es" ? "Preparando Tu Visita" : "Preparing for Your Visit"}</h2>
              <ul style="margin:0;padding-left:21px;font-size:15px;line-height:1.75;color:#52525b;">
                <li>${lang === "es" ? "Llega puntualmente a tu cita programada." : "Please arrive on time for your scheduled appointment."}</li>
                <li>${lang === "es" ? "Si tu atleta participará, debe usar ropa deportiva cómoda y una camiseta blanca sin logotipos." : "If your athlete will participate, please wear comfortable athletic clothing and a plain white T-shirt."}</li>
                <li>${lang === "es" ? "Trae una botella de agua si tu atleta participará." : "Bring a water bottle if your athlete will be participating."}</li>
                <li>${lang === "es" ? "Trae cualquier pregunta que desees conversar con el coach." : "Bring any questions you would like to discuss with the coach."}</li>
              </ul>

              ${notesHtml}

              <div style="margin-top:26px;padding:22px;border-radius:14px;background:#fffbeb;border:1px solid #fde68a;">
                <div style="font-size:15px;font-weight:900;color:#854d0e;margin-bottom:8px;">
                  ${lang === "es" ? "Reserva de la Cita de Admisión" : "Admissions Appointment Reservation"}
                </div>
                <p style="margin:0 0 10px;font-size:15px;line-height:1.65;color:#713f12;">
                  ${lang === "es"
                    ? "Una reserva de $25 para la Cita de Admisión asegura tiempo dedicado con un entrenador de Sandman. No se requiere ningún pago hoy."
                    : "A $25 Admissions Appointment Reservation secures dedicated time with a Sandman coach. No payment is required today."}
                </p>
                <p style="margin:0;font-size:15px;line-height:1.65;color:#713f12;">
                  ${lang === "es"
                    ? "La reserva de $25 se cobra al finalizar tu Cita de Admisión. Si te inscribes, los $25 completos se aplican inmediatamente al costo de tu inscripción."
                    : "The $25 reservation is collected at the conclusion of your Admissions Appointment. If you enroll, the full amount is immediately credited toward your enrollment."}
                </p>
              </div>

              <h2 style="margin:28px 0 10px;font-size:19px;color:#18181b;">${lang === "es" ? "Tu Camino de Inicio" : "Your Starting Path"}</h2>
              <p style="margin:0;font-size:15px;line-height:1.7;color:#52525b;white-space:pre-line;">${escapeHtml(lang === "es" ? startingPathMessageEs : startingPathMessage)}</p>

              <div style="margin-top:28px;padding-top:22px;border-top:1px solid #e4e4e7;">
                <div style="font-size:16px;font-weight:800;color:#18181b;">${lang === "es" ? "¿Necesitas reprogramar?" : "Need to reschedule?"}</div>
                <p style="margin:7px 0 0;font-size:15px;line-height:1.65;color:#52525b;">
                  ${lang === "es"
                    ? "Simplemente responde a este correo electrónico y con gusto te ayudaremos a encontrar otro horario."
                    : "Simply reply to this email and we will be happy to help you find another time."}
                </p>
              </div>

              <p style="margin:28px 0 0;font-size:15px;line-height:1.7;color:#52525b;">
                ${lang === "es"
                  ? "Agradecemos la oportunidad de conocer a tu familia. Esperamos conocerte."
                  : "We appreciate the opportunity to meet your family. We look forward to meeting you."}
              </p>

              <p style="margin:22px 0 0;font-size:15px;line-height:1.65;color:#18181b;">
                <strong>Combat = Character</strong><br>
                — Coach Sandoval<br>
                Sandman Combat Academy
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 30px;background:#18181b;text-align:center;font-size:12px;line-height:1.6;color:#a1a1aa;">
              Sandman Combat Academy · Heroes Build Heroes™
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  if (lang === "es") {
    return {
      subject:
        "Sandman Combat — Tu Cita de Admisión Está Programada",

      html,

      text:
`Hola ${parentName}:

Gracias por programar tu Cita de Admisión con Sandman Combat.

Esperamos conocer a tu familia, aprender más sobre tu atleta y escuchar cuáles son sus metas.

En Sandman Combat creemos que cada atleta merece un comienzo apropiado y que cada familia merece una conversación con el coach antes de comenzar.

--------------------------------------------------

TU CITA DE ADMISIÓN

Atleta:
${athleteName}

Fecha:
${formattedDate}

Hora:
${formattedTime}

Coach:
${appointmentCoach}

Academia:
${academyName}

Dirección:
${academyAddress}

--------------------------------------------------

QUÉ PUEDES ESPERAR

Durante la Cita de Admisión, tu familia tendrá la oportunidad de conocer al coach, aprender sobre los estándares de la academia, hablar sobre sus metas y hacer preguntas.

Dependiendo de la experiencia del atleta y del propósito de la cita, la visita también puede incluir la observación o participación en una práctica en vivo.

Antes de concluir, habrá tiempo para compartir pensamientos finales, comentarios o preocupaciones y hablar sobre el próximo paso apropiado.

--------------------------------------------------

• Por favor llega puntualmente a tu cita programada.

• Si tu atleta participará en una práctica o evaluación, debe usar ropa deportiva cómoda.

• Si tu atleta participará en la práctica, por favor haz que use una camiseta blanca sin logotipos.

• Trae una botella de agua si tu atleta participará.

• Te invitamos a traer cualquier pregunta que desees conversar con el coach.

${appointmentNotes ? `--------------------------------------------------

NOTAS DEL COACH

${appointmentNotes}

` : ""}--------------------------------------------------

TU CAMINO DE INICIO

${startingPathMessageEs}

--------------------------------------------------

RESERVA DE LA CITA DE ADMISIÓN

Una reserva de $25 para la Cita de Admisión asegura tiempo dedicado con un entrenador de Sandman. No se requiere ningún pago hoy.

La reserva de $25 se cobra al finalizar tu Cita de Admisión. Si te inscribes, los $25 completos se aplican inmediatamente al costo de tu inscripción.

--------------------------------------------------

¿NECESITAS REPROGRAMAR?

Si esta cita ya no funciona para tu familia, simplemente responde a este correo electrónico y con gusto te ayudaremos a encontrar otro horario.

Agradecemos la oportunidad de conocer a tu familia.

Ya sea que tu atleta esté comenzando por primera vez o llegue con experiencia previa, nuestro objetivo es proporcionar el comienzo correcto y el camino adecuado.

Esperamos conocerte.

Combat = Character

— Coach Sandoval

Sandman Academy of Combat & Fitness™
Los Héroes Forman Héroes™`
    };
  }

  return {
    subject:
      "Sandman Combat — Your Admissions Appointment Is Scheduled",

    html,

    text:
`Hello ${parentName},

Thank you for scheduling your Sandman Combat Admissions Appointment.

We look forward to meeting your family, learning more about your athlete, and hearing about your goals.

At Sandman Combat, we believe every athlete deserves a proper beginning and every family deserves a conversation with the coach before training begins.

--------------------------------------------------

YOUR ADMISSIONS APPOINTMENT

Athlete:
${athleteName}

Date:
${formattedDate}

Time:
${formattedTime}

Coach:
${appointmentCoach}

Academy:
${academyName}

Address:
${academyAddress}

--------------------------------------------------

WHAT TO EXPECT

During your Admissions Appointment, your family will have an opportunity to meet the coach, learn about academy standards, discuss your goals, and ask questions.

Your coach will guide your family through the Admissions Appointment and explain the appropriate next steps based on your athlete's goals and experience.

Before your appointment concludes, there will be time for final thoughts, remaining questions, and a discussion of the appropriate next steps.

--------------------------------------------------

PREPARING FOR YOUR VISIT

• Please arrive on time for your scheduled appointment.

• If your athlete will participate in a practice or assessment, please wear comfortable athletic clothing.

• If your athlete is participating in practice, please have them wear a plain white athletic T-shirt, if available.

• Bring a water bottle if your athlete will be participating.

• We encourage you to bring any questions you would like to discuss with the coach.

${appointmentNotes ? `--------------------------------------------------

COACH NOTES

${appointmentNotes}

` : ""}--------------------------------------------------

YOUR STARTING PATH

${startingPathMessage}

--------------------------------------------------

ADMISSIONS APPOINTMENT RESERVATION

A $25 Admissions Appointment Reservation secures dedicated time with a Sandman coach. No payment is required today.

The $25 reservation is collected at the conclusion of your Admissions Appointment. If you enroll, the full amount is immediately credited toward your enrollment.

--------------------------------------------------

NEED TO RESCHEDULE?

If this appointment no longer works for your family, simply reply to this email and we will be happy to help you find another time.

We appreciate the opportunity to meet your family.

Whether your athlete is beginning for the first time or arriving with previous experience, our goal is to provide the right beginning and the right path forward.

We look forward to meeting you.

Combat = Character

— Coach Sandoval
Sandman Academy of Combat & Fitness™
Heroes Build Heroes™`
  };
}
