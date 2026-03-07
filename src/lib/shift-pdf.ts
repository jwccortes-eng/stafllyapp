import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface ShiftPDFData {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  clientName: string | null;
  locationName: string | null;
  meetingPoint: string | null;
  transportRequired: boolean;
  transportNotes: string | null;
  carsNeeded: number;
  employees: {
    name: string;
    phone: string | null;
    role: string | null;
  }[];
  supervisorName: string | null;
}

export function downloadShiftAssignmentPDF(data: ShiftPDFData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("StaflyApps", 14, 18);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text("Asignación de turno", 14, 24);
  doc.setTextColor(0);

  // Line
  doc.setDrawColor(220);
  doc.line(14, 27, 196, 27);

  // Shift info
  let y = 34;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(data.title, 14, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  const dateLabel = format(new Date(data.date + "T12:00:00"), "EEEE d 'de' MMMM yyyy", { locale: es });
  doc.text(`Fecha: ${dateLabel}`, 14, y); y += 5;
  doc.text(`Horario: ${data.startTime?.slice(0, 5)} – ${data.endTime?.slice(0, 5)}`, 14, y); y += 5;

  if (data.clientName) { doc.text(`Cliente: ${data.clientName}`, 14, y); y += 5; }
  if (data.locationName) { doc.text(`Ubicación: ${data.locationName}`, 14, y); y += 5; }
  if (data.meetingPoint) { doc.text(`Punto de encuentro: ${data.meetingPoint}`, 14, y); y += 5; }
  if (data.supervisorName) { doc.text(`Supervisor: ${data.supervisorName}`, 14, y); y += 5; }

  if (data.transportRequired) {
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.text("Transporte requerido", 14, y); y += 5;
    doc.setFont("helvetica", "normal");
    doc.text(`Vehículos necesarios: ${data.carsNeeded}`, 14, y); y += 5;
    if (data.transportNotes) { doc.text(`Notas: ${data.transportNotes}`, 14, y); y += 5; }
  }

  y += 4;

  // Employee table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Empleados asignados (${data.employees.length})`, 14, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [["#", "Nombre", "Teléfono", "Rol"]],
    body: data.employees.map((e, i) => [
      String(i + 1),
      e.name,
      e.phone || "—",
      e.role || "—",
    ]),
    theme: "striped",
    headStyles: { fillColor: [59, 130, 246], fontSize: 9, fontStyle: "bold" },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14 },
    styles: { cellPadding: 3 },
  });

  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(160);
  doc.text(`Generado por StaflyApps — ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, pageHeight - 10);

  doc.save(`turno-${data.date}-${data.title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30)}.pdf`);
}
