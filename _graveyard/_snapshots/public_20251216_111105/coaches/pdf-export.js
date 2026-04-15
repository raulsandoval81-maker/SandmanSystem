async function exportPDF(uid, data){
  const pdfDoc = await PDFLib.PDFDocument.create();

  const page = pdfDoc.addPage([600, 800]);

  const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

  const title = "Sandman System — Graduation Reflection Packet";

  page.drawText(title, {
    x: 40,
    y: 760,
    size: 18,
    font,
    color: PDFLib.rgb(0.95, 0.8, 0.1)
  });

  const output = JSON.stringify(data, null, 2);

  page.drawText(output, {
    x: 40,
    y: 720,
    size: 10,
    font,
    lineHeight: 14,
    maxWidth: 520
  });

  const bytes = await pdfDoc.save();

  const blob = new Blob([bytes], { type: "application/pdf" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `questionnaire-${uid}.pdf`;
  a.click();
}
