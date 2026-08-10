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
            ? `Your visit includes a complimentary class and Admissions Appointment.

Because you requested a Placement Assessment, you may train first so the coach can evaluate your current level before the conversation. The coach may also meet with you first when the schedule or circumstances make that more appropriate.

You will have time to discuss your goals, ask questions, and review program and membership options.`
            : `Your visit includes a complimentary class and Admissions Appointment.

New athletes are often scheduled near the end of practice so there is time to meet with the coach first without interrupting the training session. The coach will guide the order of your visit based on the day's schedule.

You will have time to discuss your goals, ask questions, and review program and membership options.`)
        : (admissionsPath === "assessment"
            ? `Your visit includes a complimentary class and Admissions Appointment.

Because your athlete requested a Placement Assessment, they may train first so the coach can evaluate their current level before meeting with your family. The coach may also meet with your family first when the schedule or circumstances make that more appropriate.

You will have time to discuss your athlete's goals, ask questions, and review program and membership options.`
            : `Your visit includes a complimentary class and Admissions Appointment.

New athletes are often scheduled near the end of practice so there is time for your family to meet with the coach first without interrupting the training session. The coach will guide the order of the visit based on the day's schedule.

You will have time to discuss your athlete's goals, ask questions, and review program and membership options.`);
    const visitOverviewMessageEs = isAdultAthlete
        ? (admissionsPath === "assessment"
            ? `Tu visita incluye una clase de cortesía y una Cita de Admisión.

Como solicitaste una Evaluación de Colocación, puedes entrenar primero para que el entrenador evalúe tu nivel actual antes de la conversación. El entrenador también puede reunirse contigo primero cuando el horario o las circunstancias lo hagan más apropiado.

Tendrás tiempo para hablar sobre tus metas, hacer preguntas y revisar opciones de programas y membresías.`
            : `Tu visita incluye una clase de cortesía y una Cita de Admisión.

Los atletas nuevos suelen programarse cerca del final de la práctica para que haya tiempo de reunirse primero con el entrenador sin interrumpir la sesión de entrenamiento. El entrenador guiará el orden de tu visita según el horario de ese día.

Tendrás tiempo para hablar sobre tus metas, hacer preguntas y revisar opciones de programas y membresías.`)
        : (admissionsPath === "assessment"
            ? `Tu visita incluye una clase de cortesía y una Cita de Admisión.

Como tu atleta solicitó una Evaluación de Colocación, puede entrenar primero para que el entrenador evalúe su nivel actual antes de reunirse con tu familia. El entrenador también puede reunirse primero con tu familia cuando el horario o las circunstancias lo hagan más apropiado.

Tendrán tiempo para hablar sobre las metas de tu atleta, hacer preguntas y revisar opciones de programas y membresías.`
            : `Tu visita incluye una clase de cortesía y una Cita de Admisión.

Los atletas nuevos suelen programarse cerca del final de la práctica para que haya tiempo de que tu familia se reúna primero con el entrenador sin interrumpir la sesión de entrenamiento. El entrenador guiará el orden de la visita según el horario de ese día.

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
            ? "Notas del Entrenador"
            : "Coach Notes"}
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
                Heroes Build Heroes™
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
            ? "Tu visita con Sandman Academy está programada. Esperamos conocerte, aprender más sobre tu experiencia y escuchar cuáles son tus metas."
            : "La visita de tu familia con Sandman Academy está programada. Esperamos conocer a tu atleta, aprender más sobre su experiencia y escuchar cuáles son sus metas.")
        : (isAdultAthlete
            ? "Your visit with Sandman Academy is scheduled. We look forward to meeting you, learning more about your experience, and hearing about your goals."
            : "Your family's visit with Sandman Academy is scheduled. We look forward to meeting your athlete, learning more about their experience, and hearing about their goals.")}
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

              <ul
                style="
                  margin:0;
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
        ? "Trae cualquier pregunta que quieras conversar con el entrenador."
        : "Bring any questions you would like to discuss with the coach."}
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
                <strong>Combat = Character</strong><br>
                — Coach Sandoval<br>
                Sandman Academy of Combat &amp; Fitness™
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
              Sandman Academy of Combat &amp; Fitness™ · Heroes Build Heroes™
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
            subject: "Sandman Academy — Tu Cita de Admisión Está Programada",
            html,
            text: `Hola ${greetingName}:

${isAdultAthlete
                ? "Tu visita con Sandman Academy está programada. Esperamos conocerte, aprender más sobre tu experiencia y escuchar cuáles son tus metas."
                : "La visita de tu familia con Sandman Academy está programada. Esperamos conocer a tu atleta, aprender más sobre su experiencia y escuchar cuáles son sus metas."}

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

${visitOverviewMessageEs}

Si después de la visita decides que deseas continuar, tu entrenador te explicará los próximos pasos apropiados.

--------------------------------------------------

PREPARANDO TU VISITA

• Por favor llega de 10 a 15 minutos antes de la hora programada.

${isAdultAthlete
                ? "• Llega preparado para entrenar con ropa deportiva cómoda y, si está disponible, una camiseta deportiva blanca sin logotipos."
                : "• Haz que tu atleta llegue preparado para entrenar con ropa deportiva cómoda y, si está disponible, una camiseta deportiva blanca sin logotipos."}

${isAdultAthlete
                ? "• Trae una botella de agua."
                : "• Trae una botella de agua para tu atleta."}

• Trae cualquier pregunta que quieras conversar con el entrenador.

${appointmentNotes
                ? `--------------------------------------------------

NOTAS DEL ENTRENADOR

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

Combat = Character

— Coach Sandoval
Sandman Academy of Combat & Fitness™
Los Héroes Forman Héroes™`
        };
    }
    /* =========================================================
       ENGLISH PLAIN TEXT
    ========================================================= */
    return {
        subject: "Sandman Academy — Your Admissions Appointment Is Scheduled",
        html,
        text: `Hello ${greetingName},

${isAdultAthlete
            ? "Your visit with Sandman Academy is scheduled. We look forward to meeting you, learning more about your experience, and hearing about your goals."
            : "Your family's visit with Sandman Academy is scheduled. We look forward to meeting your athlete, learning more about their experience, and hearing about their goals."}

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

${visitOverviewMessage}

If you decide you would like to continue after the visit, your coach will explain the appropriate next steps.

--------------------------------------------------

PREPARING FOR YOUR VISIT

• Please arrive 10–15 minutes before your scheduled time.

${isAdultAthlete
            ? "• Please arrive ready to train in comfortable athletic clothing and, if available, a plain white athletic T-shirt."
            : "• Please have your athlete arrive ready to train in comfortable athletic clothing and, if available, a plain white athletic T-shirt."}

${isAdultAthlete
            ? "• Bring a water bottle."
            : "• Bring a water bottle for your athlete."}

• Bring any questions you would like to discuss with the coach.

${appointmentNotes
            ? `--------------------------------------------------

COACH NOTES

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

Combat = Character

— Coach Sandoval
Sandman Academy of Combat & Fitness™
Heroes Build Heroes™`
    };
}
