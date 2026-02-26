// /coach/meeting/policy.js

export const dict = {
  en: {
    brand: "Lompoc HS Wrestling",
    title: "Team Policy & Acknowledgement",
    subtitle: "School-only language • Bilingual • Phone/Print Ready",

    // A) Team Expectations
    hPolicy: "A) Team Expectations (School Standard)",
    p1: "Participation & Conduct — arrive prepared, on time, and focused. Unexcused absences or repeated tardies may affect practice or competition time.",
    p2: "Academics & Eligibility — maintain the required GPA and meet school/district eligibility checks. Grade or behavior issues at school may impact participation.",
    p3: "Practice Standards — follow directions, work hard, and respect teammates and coaches. Unsafe, disruptive, or disrespectful behavior is not allowed.",
    p4: "Travel & Safety — follow district/CIF rules on trips. Curfews, supervision guidelines, and room/van assignments are non-negotiable for safety.",
    p5: "Sportsmanship — show respect to opponents, officials, and other schools. No taunting, no bullying, and no social-media posts that embarrass the program.",
    p6: "Communication — questions or concerns go directly to the coaching staff. Please avoid post-match confrontations; the 24-hour rule applies to sensitive topics.",
    p7: "Health & Hydration — communicate injuries or health concerns early. Follow CIF hydration rules; no extreme weight-cutting or unsafe dieting.",
    p8: "Representing the School — uniforms, language, and behavior should reflect school pride at all times, on campus, off campus, and online.",

    // B) Coach Standards Pledge
    hPledge: "B) Coach Standards Pledge",
    c1: "Prepared & On-Time — arrive ready, follow directions, and keep the room respectful.",
    c2: "Respect & Sportsmanship — represent the school with class; no sideline coaching or confrontations.",
    pledgeNote: "These standards protect our room: calm, consistent, united.",

    // C) Acknowledgement
    hAcknowledge: "C) Acknowledgement & Sign-Off",
    agree:
      "Participation on this team is a privilege. I/We have read and understand the expectations above and agree to uphold these standards for my/our athlete and for ourselves as parents/guardians throughout the season.",

    // Buttons / footer
    btnPrint: "Print",
    btnSave: "Save Receipt (PNG)",
    btnBack: "Back to Meeting Guide",
    privacy:
      "Privacy: This page does not upload data. Use paper copy or your school system to submit signatures.",
    footer:
      "Lompoc High School Wrestling • Policy & Acknowledgement (Bilingual)"
  },

  es: {
    brand: "Lompoc HS Lucha",
    title: "Política del Equipo y Acuse de Recibo",
    subtitle: "Lenguaje escolar • Bilingüe • Listo para teléfono/impresión",

    // A) Expectativas del Equipo
    hPolicy: "A) Expectativas del Equipo (Estándar Escolar)",
    p1: "Participación y Conducta — llegar preparado, puntual y enfocado. Inasistencias injustificadas o tardanzas repetidas pueden afectar la práctica o la competencia.",
    p2: "Académico y Elegibilidad — mantener el GPA requerido y cumplir las revisiones de la escuela/distrito. Problemas de conducta o calificaciones pueden impactar la participación.",
    p3: "Estándares de Práctica — seguir indicaciones, trabajar duro y respetar a compañeros y entrenadores. No se permite conducta insegura, disruptiva o irrespetuosa.",
    p4: "Viajes y Seguridad — seguir las reglas del distrito/CIF en las salidas. Los horarios, la supervisión y las asignaciones de cuarto/vehículo no son negociables por seguridad.",
    p5: "Deportividad — mostrar respeto a los oponentes, oficiales y otras escuelas. No se permite burlas, acoso ni publicaciones en redes sociales que avergüencen al programa.",
    p6: "Comunicación — inquietudes o preguntas directamente con el cuerpo técnico. Evitar confrontaciones después del combate; la regla de 24 horas aplica a temas delicados.",
    p7: "Salud e Hidratación — informar lesiones o preocupaciones de salud temprano. Seguir las reglas de hidratación CIF; no se permiten cortes extremos de peso ni dietas inseguras.",
    p8: "Representar a la Escuela — el uniforme, el lenguaje y la conducta deben reflejar orgullo escolar en todo momento, dentro y fuera del campus y en línea.",

    // B) Compromiso del Entrenador
    hPledge: "B) Compromiso de Estándares del Entrenador",
    c1: "Preparado y Puntual — llegar listo, seguir indicaciones y mantener el salón con respeto.",
    c2: "Respeto y Deportividad — representar a la escuela con clase; sin indicaciones desde la tribuna ni confrontaciones.",
    pledgeNote: "Estos estándares protegen nuestro salón: calmado, constante y unido.",

    // C) Acuse
    hAcknowledge: "C) Acuse de Recibo y Firma",
    agree:
      "La participación en este equipo es un privilegio. Yo/Nosotros hemos leído y entendemos las expectativas y aceptamos mantener estos estándares para nuestro atleta y para nosotros como padres/tutores durante la temporada.",

    btnPrint: "Imprimir",
    btnSave: "Guardar Comprobante (PNG)",
    btnBack: "Regresar a la Guía",
    privacy:
      "Privacidad: Esta página no sube datos. Use copia en papel o el sistema escolar para enviar firmas.",
    footer:
      "Lompoc High School Wrestling • Política y Acuse (Bilingüe)"
  }
};

// Optional hook for local toggles (not needed if toolbar owns EN/ES)
export function paintLangToggle() {
  // no-op on purpose; toolbar.js drives language via window.__lang
  // kept so the import { dict, paintLangToggle } does not break
}

// Attach button handlers (print + PNG) once DOM is ready
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    const printBtn = document.getElementById("print");
    if (printBtn) {
      printBtn.addEventListener("click", () => window.print());
    }

    const saveBtn = document.getElementById("save");
    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        if (!window.html2canvas) {
          alert("Screenshot tool not loaded. Check your connection.");
          return;
        }
        const area = document.querySelector("main");
        const canvas = await window.html2canvas(area, {
          scale: 2,
          backgroundColor: "#ffffff"
        });
        const a = document.createElement("a");
        const ts = new Date().toISOString().slice(0, 10);
        a.href = canvas.toDataURL("image/png");
        a.download = `lompoc-wrestling-policy-receipt-${ts}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
    }
  });
}
