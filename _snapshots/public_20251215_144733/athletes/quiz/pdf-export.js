// =======================================================
// Athlete Quiz → Personal PDF Export
// Sandman System™
// Used by destiny.html and reflection.html
// =======================================================

// Requires jsPDF (already included in /assets/libs/ folder)
// <script src="/assets/libs/jspdf.umd.min.js"></script>

window.exportAthleteQuizPDF = function() {
  const { jsPDF } = window.jspdf;

  // ------------------------------
  // 1. Load mini-profile & answers
  // ------------------------------
  const mini = JSON.parse(localStorage.getItem("miniProfile") || "{}");
  const answers = JSON.parse(localStorage.getItem("quizAnswers") || "{}");

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = 40;

  // ------------------------------
  // 2. Header
  // ------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Sandman Combat System™", 40, y);
  y += 22;

  doc.setFontSize(14);
  doc.text("Athlete Destiny / Reflection Packet", 40, y);
  y += 30;

  doc.setLineWidth(1);
  doc.line(40, y, 560, y);
  y += 25;

  // ------------------------------
  // 3. Mini-profile block
  // ------------------------------
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Athlete Identity", 40, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  const identity = [
    `Name: ${mini.name || ""}`,
    `Team: ${mini.team || ""}`,
    `City/State: ${mini.cityState || ""}`,
    `Lane: ${mini.lane || ""}`,
    `Tier: ${mini.tier || ""}`,
    `Mint Tag: ${mini.mint || ""}`
  ];

  identity.forEach(line => {
    doc.text(line, 50, y);
    y += 16;
  });

  y += 10;
  doc.line(40, y, 560, y);
  y += 25;

  // ------------------------------
  // 4. Quiz answers
  // ------------------------------
  doc.setFont("helvetica", "bold");
  doc.text("Self-Assessment Answers", 40, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  const keys = Object.keys(answers);

  keys.forEach((key, i) => {
    const val = answers[key];

    // Handle long answers
    const split = doc.splitTextToSize(`${i + 1}. ${val}`, 500);

    split.forEach(line => {
      if (y + 16 > 750) {
        doc.addPage();
        y = 40;
      }
      doc.text(line, 50, y);
      y += 14;
    });

    y += 6;
  });

  // ------------------------------
  // 5. Footer
  // ------------------------------
  if (y + 40 > 750) {
    doc.addPage();
    y = 40;
  }

  y += 20;
  doc.setFont("helvetica", "italic");
  doc.text("This packet is part of the Sandman System™ Graduation Archive.", 40, y);

  // ------------------------------
  // 6. Save
  // ------------------------------
  const fileName = `${mini.name.replace(/\s+/g, "_")}_Destiny.pdf`;
  doc.save(fileName);
};
