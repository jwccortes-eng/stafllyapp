import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface PassportPDFData {
  displayName: string;
  primaryRole?: string | null;
  summaryText?: string | null;
  city?: string | null;
  repScore?: number | null;
  tier: string;
  metrics: { label: string; value: string }[];
  skills: string[];
  languages: string[];
  workHistory: {
    companyName: string;
    roleName?: string | null;
    dateStart?: string | null;
    dateEnd?: string | null;
    totalHours?: number | null;
    isVerified?: boolean;
  }[];
  pageUrl: string;
  generatedAt?: string | null;
}

export function downloadPassportPDF(data: PassportPDFData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const margin = 18;
  let y = 20;

  // ── Header accent bar ──
  doc.setFillColor(59, 130, 246); // primary blue
  doc.rect(0, 0, w, 6, "F");

  // ── Title ──
  y = 18;
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 25, 40);
  doc.text("Worker Passport", margin, y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 130);
  doc.text("Perfil profesional verificado por StaflyApps", margin, y + 6);
  y += 16;

  // ── Profile section ──
  doc.setDrawColor(230, 230, 235);
  doc.setFillColor(248, 249, 252);
  doc.roundedRect(margin, y, w - margin * 2, 32, 3, 3, "FD");

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 25, 40);
  doc.text(data.displayName, margin + 6, y + 10);

  if (data.primaryRole) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 105, 120);
    doc.text(data.primaryRole, margin + 6, y + 17);
  }

  const infoLine: string[] = [];
  if (data.city) infoLine.push(`📍 ${data.city}`);
  if (data.repScore != null) infoLine.push(`⭐ ${data.tier} · ${data.repScore}/100`);
  if (infoLine.length) {
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 130);
    doc.text(infoLine.join("   "), margin + 6, y + 24);
  }

  y += 38;

  // ── Summary ──
  if (data.summaryText) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(80, 85, 100);
    const lines = doc.splitTextToSize(data.summaryText, w - margin * 2 - 4);
    doc.text(lines, margin + 2, y);
    y += lines.length * 4.5 + 4;
  }

  // ── Metrics ──
  if (data.metrics.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 25, 40);
    doc.text("Métricas Clave", margin, y);
    y += 6;

    const colW = (w - margin * 2) / Math.min(data.metrics.length, 4);
    data.metrics.forEach((m, i) => {
      const x = margin + i * colW;
      doc.setFillColor(245, 247, 252);
      doc.roundedRect(x, y, colW - 3, 16, 2, 2, "F");

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(59, 130, 246);
      doc.text(m.value, x + (colW - 3) / 2, y + 7, { align: "center" });

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 130);
      doc.text(m.label, x + (colW - 3) / 2, y + 13, { align: "center" });
    });
    y += 22;
  }

  // ── Skills ──
  if (data.skills.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 25, 40);
    doc.text("Habilidades", margin, y);
    y += 5;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 65, 80);
    doc.text(data.skills.join(" · "), margin + 2, y);
    y += 7;
  }

  // ── Languages ──
  if (data.languages.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 25, 40);
    doc.text("Idiomas", margin, y);
    y += 5;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 65, 80);
    doc.text(data.languages.join(" · "), margin + 2, y);
    y += 7;
  }

  // ── Work History Table ──
  if (data.workHistory.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 25, 40);
    doc.text("Historial Laboral", margin, y);
    y += 3;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Empresa", "Rol", "Período", "Horas", "Verificado"]],
      body: data.workHistory.map(wh => [
        wh.companyName,
        wh.roleName ?? "—",
        `${wh.dateStart ?? "—"} → ${wh.dateEnd ?? "Presente"}`,
        wh.totalHours != null ? `${Math.round(wh.totalHours)}h` : "—",
        wh.isVerified ? "✓" : "—",
      ]),
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 249, 252] },
    });

    y = (doc as any).lastAutoTable?.finalY ?? y + 30;
    y += 6;
  }

  // ── Footer ──
  const footerY = doc.internal.pageSize.getHeight() - 14;
  doc.setDrawColor(230, 230, 235);
  doc.line(margin, footerY - 4, w - margin, footerY - 4);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 160, 170);
  doc.text(`Verificado por StaflyApps · ${data.pageUrl}`, margin, footerY);
  if (data.generatedAt) {
    doc.text(
      `Generado: ${new Date(data.generatedAt).toLocaleDateString("es")}`,
      w - margin,
      footerY,
      { align: "right" }
    );
  }

  // Save
  const safeName = data.displayName.replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`passport_${safeName}.pdf`);
}
