import { getResendClient } from "./email/resend";

type Language = "en" | "es";

type ParentWelcomeEmailInput = {
  parentEmail: string;
  parentName?: string;
  athleteName?: string;
  athleteUid: string;
  lang?: Language;
};

const PARENT_HUB_URL =
  "https://www.sandmancombat.com/parent/";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendParentWelcomeEmail(
  input: ParentWelcomeEmailInput
): Promise<void> {
  const parentEmail =
    clean(input.parentEmail).toLowerCase();

  const parentName =
    clean(input.parentName);

  const athleteName =
    clean(input.athleteName);

  const athleteUid =
    clean(input.athleteUid);

  const lang: Language =
    input.lang === "es" ? "es" : "en";

  if (!parentEmail) {
    throw new Error("Missing parent email");
  }

  if (!athleteUid) {
    throw new Error("Missing athlete UID");
  }

  const athleteLabel =
    athleteName ||
    (lang === "es"
      ? "su atleta"
      : "your athlete");

  const greeting =
    parentName
      ? lang === "es"
        ? `Hola ${parentName},`
        : `Hello ${parentName},`
      : lang === "es"
        ? "Hola,"
        : "Hello,";

  const copy =
    lang === "es"
      ? {
          subject:
            `Bienvenido a Sandman Combat — ${athleteLabel}`,

          heading:
            "Bienvenido al Camino",

          approved:
            `${athleteLabel} ha sido aprobado oficialmente y conectado a su cuenta de padre o tutor.`,

          athleteId:
            "ID del Atleta",

          parentHub:
            "PORTAL DE PADRES",

          openHub:
            "Abrir Portal de Padres",

          hubText:
            "El Portal de Padres es donde puede consultar información importante y mantenerse conectado con el camino de su atleta en Sandman.",

          profileHeading:
            "Acerca de los Perfiles de Atleta",

          profileIntro:
            "Los perfiles de atleta son presentados personalmente por el entrenador.",

          profilePermission:
            "Los atletas menores de 14 años requieren permiso de sus padres o tutores antes de que el entrenador les proporcione acceso a su perfil y proceso de incorporación.",

          profileTiming:
            "El entrenador proporcionará el perfil cuando sea el momento apropiado.",

          motto:
            "Los Héroes Forman Héroes.",
        }
      : {
          subject:
            `Welcome to Sandman Combat — ${athleteLabel}`,

          heading:
            "Welcome to the Journey",

          approved:
            `${athleteLabel} has officially been approved and connected to your parent account.`,

          athleteId:
            "Athlete ID",

          parentHub:
            "PARENT HUB",

          openHub:
            "Open Parent Hub",

          hubText:
            "Your Parent Hub is where you can view important information and stay connected to your athlete's Sandman journey.",

          profileHeading:
            "About Athlete Profiles",

          profileIntro:
            "Athlete profiles are personally introduced by the coach.",

          profilePermission:
            "Athletes under age 14 require parent permission before the coach provides access to their athlete profile and onboarding.",

          profileTiming:
            "Your coach will provide the athlete profile when the time is appropriate.",

          motto:
            "Heroes Build Heroes.",
        };

  const text = `
${greeting}

${copy.heading}

${copy.approved}

${copy.athleteId.toUpperCase()}
${athleteUid}

${copy.parentHub}
${PARENT_HUB_URL}

${copy.hubText}

${copy.profileHeading.toUpperCase()}

${copy.profileIntro}

${copy.profilePermission}

${copy.profileTiming}

${copy.motto}

Sandman Combat
${PARENT_HUB_URL}
`.trim();

  const safeGreeting =
    escapeHtml(greeting);

  const safeApproved =
    escapeHtml(copy.approved);

  const safeAthleteUid =
    escapeHtml(athleteUid);

  const safeHeading =
    escapeHtml(copy.heading);

  const safeAthleteId =
    escapeHtml(copy.athleteId);

  const safeOpenHub =
    escapeHtml(copy.openHub);

  const safeHubText =
    escapeHtml(copy.hubText);

  const safeProfileHeading =
    escapeHtml(copy.profileHeading);

  const safeProfileIntro =
    escapeHtml(copy.profileIntro);

  const safeProfilePermission =
    escapeHtml(copy.profilePermission);

  const safeProfileTiming =
    escapeHtml(copy.profileTiming);

  const safeMotto =
    escapeHtml(copy.motto);

  const html = `
<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >
</head>

<body style="
  margin:0;
  padding:0;
  background:#080808;
  color:#f5f5f5;
  font-family:Arial,Helvetica,sans-serif;
">
  <div style="
    max-width:640px;
    margin:0 auto;
    padding:32px 18px;
  ">
    <div style="
      overflow:hidden;
      background:#111;
      border:1px solid #333;
      border-radius:18px;
    ">
      <div style="
        padding:28px 24px;
        text-align:center;
        background:#050505;
        border-bottom:1px solid #2d2d2d;
      ">
        <div style="
          color:#facc15;
          font-size:13px;
          font-weight:800;
          letter-spacing:2px;
          text-transform:uppercase;
        ">
          Sandman Combat
        </div>

        <h1 style="
          margin:12px 0 0;
          color:#fff;
          font-size:28px;
          line-height:1.2;
        ">
          ${safeHeading}
        </h1>
      </div>

      <div style="padding:28px 24px;">
        <p style="
          margin:0 0 18px;
          color:#fff;
          font-size:17px;
          line-height:1.6;
        ">
          ${safeGreeting}
        </p>

        <p style="
          margin:0 0 22px;
          color:#d4d4d8;
          font-size:16px;
          line-height:1.7;
        ">
          ${safeApproved}
        </p>

        <div style="
          margin:24px 0;
          padding:20px;
          background:#18181b;
          border:1px solid #3f3f46;
          border-radius:14px;
          text-align:center;
        ">
          <div style="
            margin-bottom:8px;
            color:#a1a1aa;
            font-size:12px;
            font-weight:700;
            letter-spacing:1.6px;
            text-transform:uppercase;
          ">
            ${safeAthleteId}
          </div>

          <div style="
            color:#facc15;
            font-size:24px;
            font-weight:900;
            letter-spacing:1px;
          ">
            ${safeAthleteUid}
          </div>
        </div>

        <div style="
          margin:28px 0;
          text-align:center;
        ">
          <a
            href="${PARENT_HUB_URL}"
            style="
              display:inline-block;
              padding:14px 24px;
              background:#facc15;
              color:#050505;
              border-radius:10px;
              font-size:16px;
              font-weight:800;
              text-decoration:none;
            "
          >
            ${safeOpenHub}
          </a>
        </div>

        <p style="
          margin:0 0 26px;
          color:#d4d4d8;
          font-size:15px;
          line-height:1.7;
        ">
          ${safeHubText}
        </p>

        <div style="
          padding:20px;
          background:#0d0d0d;
          border-left:4px solid #facc15;
          border-radius:8px;
        ">
          <h2 style="
            margin:0 0 10px;
            color:#fff;
            font-size:18px;
          ">
            ${safeProfileHeading}
          </h2>

          <p style="
            margin:0 0 10px;
            color:#d4d4d8;
            font-size:15px;
            line-height:1.7;
          ">
            ${safeProfileIntro}
          </p>

          <p style="
            margin:0 0 10px;
            color:#d4d4d8;
            font-size:15px;
            line-height:1.7;
          ">
            ${safeProfilePermission}
          </p>

          <p style="
            margin:0;
            color:#d4d4d8;
            font-size:15px;
            line-height:1.7;
          ">
            ${safeProfileTiming}
          </p>
        </div>
      </div>

      <div style="
        padding:22px 24px;
        text-align:center;
        background:#050505;
        border-top:1px solid #2d2d2d;
      ">
        <div style="
          color:#facc15;
          font-size:14px;
          font-weight:800;
        ">
          ${safeMotto}
        </div>

        <div style="
          margin-top:8px;
          color:#71717a;
          font-size:12px;
        ">
          Sandman Combat
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`.trim();

  const resend =
    getResendClient();

  const result =
    await resend.emails.send({
      from:
        "Sandman Combat <join@sandmancombat.com>",

      replyTo:
        "joinsandmancombat@gmail.com",

      to:
        parentEmail,

      subject:
        copy.subject,

      text,

      html,
    });

  if (result.error) {
    throw new Error(
      result.error.message ||
      "Resend rejected the parent welcome email."
    );
  }
}