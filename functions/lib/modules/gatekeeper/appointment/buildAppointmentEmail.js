"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAppointmentEmail = buildAppointmentEmail;
const appointmentFormatting_1 = require("./appointmentFormatting");
const appointmentLocations_1 = require("./appointmentLocations");
const appointmentAudience_1 = require("./appointmentAudience");
function buildAppointmentEmail(lead) {
    const lang = lead.lang === "es"
        ? "es"
        : "en";
    const audience = (0, appointmentAudience_1.resolveAppointmentAudience)(lead, lang);
    const { greetingName, participantName, isAdultAthlete } = audience;
    const appointmentDate = (0, appointmentFormatting_1.clean)(lead.appointmentDate);
    const appointmentTime = (0, appointmentFormatting_1.clean)(lead.appointmentTime);
    const appointmentLocation = (0, appointmentFormatting_1.clean)(lead.appointmentLocation);
    const appointmentCoach = (0, appointmentFormatting_1.clean)(lead.appointmentCoach);
    const appointmentNotes = (0, appointmentFormatting_1.clean)(lead.appointmentNotes);
    const admissionsPath = lead.admissionsPath === "assessment"
        ? "assessment"
        : "new";
    const respondingAcademyName = (0, appointmentFormatting_1.clean)(lead.academyName) ||
        "Academy";
    const interestType = lead.interestType === "fitness"
        ? "fitness"
        : lead.interestType === "both"
            ? "both"
            : "combat";
    const isFitnessOnly = interestType === "fitness";
    if (!appointmentDate ||
        !appointmentTime ||
        !appointmentLocation ||
        !appointmentCoach) {
        throw new Error("Appointment date, time, location, or coach is missing.");
    }
    if (!(0, appointmentLocations_1.isSupportedLocation)(appointmentLocation)) {
        throw new Error(`Unsupported appointment location: ${appointmentLocation}`);
    }
    const formattedDate = (0, appointmentFormatting_1.formatAppointmentDate)(appointmentDate, lang);
    const formattedTime = (0, appointmentFormatting_1.formatAppointmentTime)(appointmentTime);
    const academyName = (0, appointmentLocations_1.getLocationName)(appointmentLocation);
    const academyAddress = (0, appointmentLocations_1.getLocationAddress)(appointmentLocation);
    /* =========================================================
       PERSONALIZED VISIT OVERVIEW
    ========================================================= */
    const visitOverviewMessage = isAdultAthlete
        ? (admissionsPath === "assessment"
            ? `Your visit includes your scheduled Admissions Appointment.

Because you requested a Placement Assessment, the visit may include training so the coach can evaluate your current level. The academy team will guide the order of your visit based on the schedule and circumstances.

You will have time to discuss your goals, ask questions, and review program and membership options.`
            : `Your visit includes your scheduled Admissions Appointment.

The academy team will guide the order of your visit based on the day's schedule and the purpose of your appointment.

You will have time to discuss your goals, ask questions, and review program and membership options.`)
        : (admissionsPath === "assessment"
            ? `Your visit includes your scheduled Admissions Appointment.

Because your athlete requested a Placement Assessment, the visit may include training so the coach can evaluate their current level. The academy team will guide the order of the visit based on the schedule and circumstances.

You will have time to discuss your athlete's goals, ask questions, and review program and membership options.`
            : `Your visit includes your scheduled Admissions Appointment.

The academy team will guide the order of your family's visit based on the day's schedule and the purpose of the appointment.

You will have time to discuss your athlete's goals, ask questions, and review program and membership options.`);
    const fitnessPreparationMessage = `Come ready to train in comfortable athletic clothing.

Bring a water bottle and any questions you would like to discuss with the academy team.`;
    const fitnessPreparationMessageEs = `Ven preparado para entrenar con ropa deportiva cómoda.

Trae una botella de agua y cualquier pregunta que quieras conversar con el equipo de la academia.`;
    const fitnessVisitOverviewMessage = `Your visit includes a scheduled Fitness drop-in session.

The drop-in fee is $15. If you decide to join, that $15 will be applied toward your enrollment or membership.

Please arrive 10 minutes early to complete any needed paperwork and for a brief meet-and-greet before training.

Your coach has been informed of your visit and will be expecting you.

You will have time to ask questions, learn more about the fitness program, and discuss next steps if you decide you would like to continue.`;
    const fitnessVisitOverviewMessageEs = `Tu visita incluye una sesión programada de Fitness con pase de un día.

La tarifa de la sesión es de $15. Si decides inscribirte, esos $15 se aplicarán a tu inscripción o membresía.

Por favor llega 10 minutos antes para completar cualquier documento necesario y para una breve presentación antes del entrenamiento.

Tu entrenador ha sido informado de tu visita y estará esperándote.

Tendrás tiempo para hacer preguntas, conocer más sobre el programa de Fitness y hablar sobre los próximos pasos si decides continuar.`;
    const visitOverviewMessageEs = isAdultAthlete
        ? (admissionsPath === "assessment"
            ? `Tu visita incluye tu Cita de Admisión programada.

Como solicitaste una Evaluación de Colocación, la visita puede incluir entrenamiento para que el entrenador evalúe tu nivel actual. El equipo de la academia guiará el orden de tu visita según el horario y las circunstancias.

Tendrás tiempo para hablar sobre tus metas, hacer preguntas y revisar opciones de programas y membresías.`
            : `Tu visita incluye tu Cita de Admisión programada.

El equipo de la academia guiará el orden de tu visita según el horario del día y el propósito de tu cita.

Tendrás tiempo para hablar sobre tus metas, hacer preguntas y revisar opciones de programas y membresías.`)
        : (admissionsPath === "assessment"
            ? `Tu visita incluye tu Cita de Admisión programada.

Como tu atleta solicitó una Evaluación de Colocación, la visita puede incluir entrenamiento para que el entrenador evalúe su nivel actual. El equipo de la academia guiará el orden de la visita según el horario y las circunstancias.

Tendrán tiempo para hablar sobre las metas de tu atleta, hacer preguntas y revisar opciones de programas y membresías.`
            : `Tu visita incluye tu Cita de Admisión programada.

El equipo de la academia guiará el orden de la visita de tu familia según el horario del día y el propósito de la cita.

Tendrán tiempo para hablar sobre las metas de tu atleta, hacer preguntas y revisar opciones de programas y membresías.`);
    /* =========================================================
       STARTING PATH
    ========================================================= */
    const startingPathMessage = isAdultAthlete
        ? (admissionsPath === "assessment"
            ? `You requested a Placement Assessment.

During your complimentary class, the coach will evaluate your demonstrated skill, movement, experience, and readiness to help determine the most appropriate starting point within the Sandman System.

Prior training is considered, but placement is based on the coach's evaluation.`
            : `You are beginning as a New Athlete.

Your coach will use the visit to learn more about you, observe how you move and respond to instruction, and help recommend the appropriate starting program and path forward.`)
        : (admissionsPath === "assessment"
            ? `Your athlete requested a Placement Assessment.

During the complimentary class, the coach will evaluate your athlete's demonstrated skill, movement, experience, and readiness to help determine the most appropriate starting point within the Sandman System.

Prior training is considered, but placement is based on the coach's evaluation.`
            : `Your athlete is beginning as a New Athlete.

Your coach will use the visit to learn more about your athlete, observe how they move and respond to instruction, and help recommend the appropriate starting program and path forward.`);
    const startingPathMessageEs = isAdultAthlete
        ? (admissionsPath === "assessment"
            ? `Solicitaste una Evaluación de Colocación.

Durante tu clase de cortesía, el entrenador evaluará tu habilidad demostrada, movimiento, experiencia y preparación para ayudar a determinar el punto de inicio más apropiado dentro del Sistema Sandman.

Se considera la experiencia previa, pero la colocación se basa en la evaluación del entrenador.`
            : `Comenzarás como Atleta Nuevo.

Tu entrenador utilizará la visita para conocerte mejor, observar cómo te mueves y respondes a la instrucción, y ayudar a recomendar el programa y camino inicial más apropiados.`)
        : (admissionsPath === "assessment"
            ? `Tu atleta solicitó una Evaluación de Colocación.

Durante la clase de cortesía, el entrenador evaluará la habilidad demostrada, movimiento, experiencia y preparación de tu atleta para ayudar a determinar el punto de inicio más apropiado dentro del Sistema Sandman.

Se considera la experiencia previa, pero la colocación se basa en la evaluación del entrenador.`
            : `Tu atleta comenzará como Atleta Nuevo.

El entrenador utilizará la visita para conocer mejor a tu atleta, observar cómo se mueve y responde a la instrucción, y ayudar a recomendar el programa y camino inicial más apropiados.`);
    /* =========================================================
       HTML HELPERS
    ========================================================= */
    const addressHtml = academyAddress
        .split("\n")
        .map(appointmentFormatting_1.escapeHtml)
        .join("<br>");
    const notesHtml = appointmentNotes
        ? `
        <div style="margin-top:24px;padding:18px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
          <div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#8a6500;margin-bottom:8px;">
            ${lang === "es"
            ? "Notas de la Cita"
            : "Appointment Notes"}
          </div>

          <div style="font-size:15px;line-height:1.65;color:#27272a;white-space:pre-line;">
            ${(0, appointmentFormatting_1.escapeHtml)(appointmentNotes)}
          </div>
        </div>
      `
        : "";
    /* =========================================================
       HTML EMAIL
    ========================================================= */
    const html = `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >
  <title>${lang === "es"
        ? "Tu Cita de Admisión Está Programada"
        : "Your Admissions Appointment Is Scheduled"}</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f4f4f5;
    font-family:Arial,Helvetica,sans-serif;
    color:#18181b;
  "
>
  <table
    role="presentation"
    width="100%"
    cellspacing="0"
    cellpadding="0"
    border="0"
    style="background:#f4f4f5;"
  >
    <tr>
      <td
        align="center"
        style="padding:24px 12px;"
      >
        <table
          role="presentation"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          border="0"
          style="
            max-width:640px;
            background:#ffffff;
            border-radius:18px;
            overflow:hidden;
            box-shadow:0 8px 28px rgba(0,0,0,.08);
          "
        >

          <tr>
            <td
              style="
                padding:28px 30px;
                background:#09090b;
                text-align:center;
                border-bottom:4px solid #d4a900;
              "
            >
              <div
                style="
                  font-size:22px;
                  font-weight:900;
                  letter-spacing:.06em;
                  color:#facc15;
                "
              >
                SANDMAN ACADEMY OF COMBAT &amp; FITNESS
              </div>

              <div
                style="
                  margin-top:7px;
                  font-size:13px;
                  letter-spacing:.14em;
                  text-transform:uppercase;
                  color:#d4d4d8;
                "
              >
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:30px;">

              <div
                style="
                  display:inline-block;
                  padding:7px 11px;
                  border-radius:999px;
                  background:#ecfdf5;
                  color:#166534;
                  font-size:12px;
                  font-weight:800;
                  letter-spacing:.06em;
                  text-transform:uppercase;
                "
              >
                ${lang === "es"
        ? "Cita Confirmada"
        : "Appointment Confirmed"}
              </div>

              <h1
                style="
                  margin:18px 0 12px;
                  font-size:27px;
                  line-height:1.25;
                  color:#18181b;
                "
              >
                ${lang === "es"
        ? `Hola ${(0, appointmentFormatting_1.escapeHtml)(greetingName)}`
        : `Hello ${(0, appointmentFormatting_1.escapeHtml)(greetingName)}`}
              </h1>

              <p
                style="
                  margin:0 0 24px;
                  font-size:16px;
                  line-height:1.7;
                  color:#52525b;
                "
              >
                ${lang === "es"
        ? (isAdultAthlete
            ? `Tu visita con ${respondingAcademyName} está programada. Esperamos conocerte, aprender más sobre tu experiencia y escuchar cuáles son tus metas.`
            : `La visita de tu familia con ${respondingAcademyName} está programada. Esperamos conocer a tu atleta, aprender más sobre su experiencia y escuchar cuáles son sus metas.`)
        : (isAdultAthlete
            ? `Your visit with ${respondingAcademyName} is scheduled. We look forward to meeting you, learning more about your experience, and hearing about your goals.`
            : `Your family's visit with ${respondingAcademyName} is scheduled. We look forward to meeting your athlete, learning more about their experience, and hearing about their goals.`)}
              </p>

              <div
                style="
                  padding:22px;
                  border-radius:14px;
                  background:#fafafa;
                  border:1px solid #e4e4e7;
                "
              >
                <div
                  style="
                    margin-bottom:16px;
                    font-size:13px;
                    font-weight:900;
                    letter-spacing:.12em;
                    text-transform:uppercase;
                    color:#8a6500;
                  "
                >
                  ${lang === "es"
        ? "Tu Visita Programada"
        : "Your Scheduled Visit"}
                </div>

                <table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                >
                  <tr>
                    <td style="padding:7px 0;width:34%;font-size:14px;font-weight:700;color:#71717a;">
                      ${isAdultAthlete
        ? (lang === "es"
            ? "Participante"
            : "Participant")
        : (lang === "es"
            ? "Atleta"
            : "Athlete")}
                    </td>

                    <td style="padding:7px 0;font-size:15px;color:#18181b;">
                      ${(0, appointmentFormatting_1.escapeHtml)(participantName)}
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:7px 0;font-size:14px;font-weight:700;color:#71717a;">
                      ${lang === "es" ? "Fecha" : "Date"}
                    </td>

                    <td style="padding:7px 0;font-size:15px;color:#18181b;">
                      ${(0, appointmentFormatting_1.escapeHtml)(formattedDate)}
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:7px 0;font-size:14px;font-weight:700;color:#71717a;">
                      ${lang === "es" ? "Hora" : "Time"}
                    </td>

                    <td style="padding:7px 0;font-size:15px;color:#18181b;">
                      ${(0, appointmentFormatting_1.escapeHtml)(formattedTime)}
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:7px 0;font-size:14px;font-weight:700;color:#71717a;">
                      Coach
                    </td>

                    <td style="padding:7px 0;font-size:15px;color:#18181b;">
                      ${(0, appointmentFormatting_1.escapeHtml)(appointmentCoach)}
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:7px 0;font-size:14px;font-weight:700;color:#71717a;">
                      ${lang === "es" ? "Academia" : "Academy"}
                    </td>

                    <td style="padding:7px 0;font-size:15px;color:#18181b;">
                      ${(0, appointmentFormatting_1.escapeHtml)(academyName)}
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:7px 0;vertical-align:top;font-size:14px;font-weight:700;color:#71717a;">
                      ${lang === "es" ? "Dirección" : "Address"}
                    </td>

                    <td style="padding:7px 0;font-size:15px;line-height:1.55;color:#18181b;">
                      ${addressHtml}
                    </td>
                  </tr>
                </table>
              </div>

              <h2
                style="
                  margin:28px 0 10px;
                  font-size:19px;
                  color:#18181b;
                "
              >
                ${lang === "es"
        ? "Qué Puedes Esperar"
        : "What to Expect"}
              </h2>

              <p
                style="
                  margin:0;
                  font-size:15px;
                  line-height:1.7;
                  color:#52525b;
                  white-space:pre-line;
                "
              >
                ${(0, appointmentFormatting_1.escapeHtml)(lang === "es"
        ? visitOverviewMessageEs
        : visitOverviewMessage)}
              </p>

              <h2
                style="
                  margin:28px 0 10px;
                  font-size:19px;
                  color:#18181b;
                "
              >
                ${lang === "es"
        ? "Preparando Tu Visita"
        : "Preparing for Your Visit"}
              </h2>

              ${isFitnessOnly
        ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#27272a;white-space:pre-line;">${(0, appointmentFormatting_1.escapeHtml)(lang === "es"
            ? fitnessPreparationMessageEs
            : fitnessPreparationMessage)}</p>`
        : ""}

              <ul
                style="
                  margin:0;
                  ${isFitnessOnly ? "display:none;" : ""}
                  padding-left:21px;
                  font-size:15px;
                  line-height:1.75;
                  color:#52525b;
                "
              >
                <li>
                  ${lang === "es"
        ? "Por favor llega de 10 a 15 minutos antes de la hora programada."
        : "Please arrive 10–15 minutes before your scheduled time."}
                </li>

                <li>
                  ${lang === "es"
        ? (isAdultAthlete
            ? "Llega preparado para entrenar con ropa deportiva cómoda y, si está disponible, una camiseta deportiva blanca sin logotipos."
            : "Haz que tu atleta llegue preparado para entrenar con ropa deportiva cómoda y, si está disponible, una camiseta deportiva blanca sin logotipos.")
        : (isAdultAthlete
            ? "Please arrive ready to train in comfortable athletic clothing and, if available, a plain white athletic T-shirt."
            : "Please have your athlete arrive ready to train in comfortable athletic clothing and, if available, a plain white athletic T-shirt.")}
                </li>

                <li>
                  ${lang === "es"
        ? (isAdultAthlete
            ? "Trae una botella de agua."
            : "Trae una botella de agua para tu atleta.")
        : (isAdultAthlete
            ? "Bring a water bottle."
            : "Bring a water bottle for your athlete.")}
                </li>

                <li>
                  ${lang === "es"
        ? "Trae cualquier pregunta que quieras conversar con el equipo de la academia."
        : "Bring any questions you would like to discuss with the academy team."}
                </li>
              </ul>

              ${notesHtml}

              <h2
                style="
                  margin:28px 0 10px;
                  font-size:19px;
                  color:#18181b;
                "
              >
                ${lang === "es"
        ? "Tu Camino de Inicio"
        : "Your Starting Path"}
              </h2>

              <p
                style="
                  margin:0;
                  font-size:15px;
                  line-height:1.7;
                  color:#52525b;
                  white-space:pre-line;
                "
              >
                ${(0, appointmentFormatting_1.escapeHtml)(lang === "es"
        ? startingPathMessageEs
        : startingPathMessage)}
              </p>

              <div
                style="
                  margin-top:28px;
                  padding-top:22px;
                  border-top:1px solid #e4e4e7;
                "
              >
                <div
                  style="
                    font-size:16px;
                    font-weight:800;
                    color:#18181b;
                  "
                >
                  ${lang === "es"
        ? "¿Necesitas Reprogramar?"
        : "Need to Reschedule?"}
                </div>

                <p
                  style="
                    margin:7px 0 0;
                    font-size:15px;
                    line-height:1.65;
                    color:#52525b;
                  "
                >
                  ${lang === "es"
        ? "Simplemente responde a este correo electrónico y con gusto te ayudaremos a encontrar otro horario."
        : "Simply reply to this email and we will be happy to help you find another time."}
                </p>
              </div>

              <p
                style="
                  margin:28px 0 0;
                  font-size:15px;
                  line-height:1.7;
                  color:#52525b;
                "
              >
                ${lang === "es"
        ? (isAdultAthlete
            ? "Agradecemos la oportunidad de conocerte y aprender más sobre tus metas. Esperamos tu visita."
            : "Agradecemos la oportunidad de conocer a tu familia y aprender más sobre las metas de tu atleta. Esperamos su visita.")
        : (isAdultAthlete
            ? "We appreciate the opportunity to meet you and learn more about your goals. We look forward to your visit."
            : "We appreciate the opportunity to meet your family and learn more about your athlete's goals. We look forward to your visit.")}
              </p>

              <p
                style="
                  margin:22px 0 0;
                  font-size:15px;
                  line-height:1.65;
                  color:#18181b;
                "
              >
                — ${(0, appointmentFormatting_1.escapeHtml)(respondingAcademyName)} Team<br>
                ${(0, appointmentFormatting_1.escapeHtml)(respondingAcademyName)}
              </p>

            </td>
          </tr>

          <tr>
            <td
              style="
                padding:18px 30px;
                background:#18181b;
                text-align:center;
                font-size:12px;
                line-height:1.6;
                color:#a1a1aa;
              "
            >
              Powered by Sandman System™
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    /* =========================================================
       SPANISH PLAIN TEXT
    ========================================================= */
    if (lang === "es") {
        return {
            subject: "Tu Cita de Admisión Está Programada",
            html,
            text: `Hola ${greetingName}:

${isAdultAthlete
                ? `Tu visita con ${respondingAcademyName} está programada. Esperamos conocerte, aprender más sobre tu experiencia y escuchar cuáles son tus metas.`
                : `La visita de tu familia con ${respondingAcademyName} está programada. Esperamos conocer a tu atleta, aprender más sobre su experiencia y escuchar cuáles son sus metas.`}

--------------------------------------------------

TU VISITA PROGRAMADA

${isAdultAthlete ? "Participante" : "Atleta"}:
${participantName}

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

${isFitnessOnly ? fitnessVisitOverviewMessageEs : visitOverviewMessageEs}

Si después de la visita decides que deseas continuar, el equipo de la academia te ayudará con los próximos pasos apropiados.

--------------------------------------------------

PREPARANDO TU VISITA

${isFitnessOnly
                ? fitnessPreparationMessageEs
                : `• Por favor llega de 10 a 15 minutos antes de la hora programada.

${isAdultAthlete
                    ? "• Llega preparado para entrenar con ropa deportiva cómoda y, si está disponible, una camiseta deportiva blanca sin logotipos."
                    : "• Haz que tu atleta llegue preparado para entrenar con ropa deportiva cómoda y, si está disponible, una camiseta deportiva blanca sin logotipos."}

${isAdultAthlete
                    ? "• Trae una botella de agua."
                    : "• Trae una botella de agua para tu atleta."}

• Trae cualquier pregunta que quieras conversar con el equipo de la academia.`}

${appointmentNotes
                ? `--------------------------------------------------

NOTAS DE LA CITA

${appointmentNotes}

`
                : ""}--------------------------------------------------

TU CAMINO DE INICIO

${startingPathMessageEs}

--------------------------------------------------

¿NECESITAS REPROGRAMAR?

${isAdultAthlete
                ? "Si esta cita ya no funciona para ti, simplemente responde a este correo electrónico y con gusto te ayudaremos a encontrar otro horario."
                : "Si esta cita ya no funciona para tu familia, simplemente responde a este correo electrónico y con gusto te ayudaremos a encontrar otro horario."}

${isAdultAthlete
                ? "Agradecemos la oportunidad de conocerte y aprender más sobre tus metas."
                : "Agradecemos la oportunidad de conocer a tu familia y aprender más sobre las metas de tu atleta."}

Esperamos tu visita.

— ${respondingAcademyName} Team
${respondingAcademyName}
Powered by Sandman System™`
        };
    }
    /* =========================================================
       ENGLISH PLAIN TEXT
    ========================================================= */
    return {
        subject: "Your Admissions Appointment Is Scheduled",
        html,
        text: `Hello ${greetingName},

${isAdultAthlete
            ? `Your visit with ${respondingAcademyName} is scheduled. We look forward to meeting you, learning more about your experience, and hearing about your goals.`
            : `Your family's visit with ${respondingAcademyName} is scheduled. We look forward to meeting your athlete, learning more about their experience, and hearing about their goals.`}

--------------------------------------------------

YOUR SCHEDULED VISIT

${isAdultAthlete ? "Participant" : "Athlete"}:
${participantName}

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

${isFitnessOnly ? fitnessVisitOverviewMessage : visitOverviewMessage}

If you decide you would like to continue after the visit, the academy team will help you with the appropriate next steps.

--------------------------------------------------

PREPARING FOR YOUR VISIT

${isFitnessOnly
            ? fitnessPreparationMessage
            : `• Please arrive 10–15 minutes before your scheduled time.

${isAdultAthlete
                ? "• Please arrive ready to train in comfortable athletic clothing and, if available, a plain white athletic T-shirt."
                : "• Please have your athlete arrive ready to train in comfortable athletic clothing and, if available, a plain white athletic T-shirt."}

${isAdultAthlete
                ? "• Bring a water bottle."
                : "• Bring a water bottle for your athlete."}

• Bring any questions you would like to discuss with the academy team.`}

${appointmentNotes
            ? `--------------------------------------------------

APPOINTMENT NOTES

${appointmentNotes}

`
            : ""}--------------------------------------------------

YOUR STARTING PATH

${startingPathMessage}

--------------------------------------------------

NEED TO RESCHEDULE?

${isAdultAthlete
            ? "If this appointment no longer works for you, simply reply to this email and we will be happy to help you find another time."
            : "If this appointment no longer works for your family, simply reply to this email and we will be happy to help you find another time."}

${isAdultAthlete
            ? "We appreciate the opportunity to meet you and learn more about your goals."
            : "We appreciate the opportunity to meet your family and learn more about your athlete's goals."}

We look forward to your visit.

— ${respondingAcademyName} Team
${respondingAcademyName}
Powered by Sandman System™`
    };
}
