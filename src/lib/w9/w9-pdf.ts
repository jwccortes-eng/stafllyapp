/**
 * Worker W-9 Guided Form v1 — PDF builder.
 *
 * Renders a "W-9 Information Summary" PDF (NOT an IRS-official W-9) with the
 * worker's submitted data + electronic signature. The TIN is shown ONLY as
 * `***-**-1234`. The raw TIN is never written to the PDF bytes.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  TAX_CLASSIFICATIONS,
  LLC_TAX_CLASSES,
  type W9FormValues,
  maskTin,
  tinTypeLabel,
} from "./w9-types";

export interface BuildW9PDFInput extends W9FormValues {
  company_name?: string | null;
  signed_at: string; // ISO timestamp
}

function labelFor<T extends readonly { value: string; label: string }[]>(
  list: T,
  v: string | null | undefined,
): string {
  if (!v) return "—";
  return list.find((o) => o.value === v)?.label ?? v;
}

/**
 * Build a W-9 summary PDF and return the binary blob.
 * Caller is responsible for uploading the blob to private storage.
 */
export function buildW9PDF(data: BuildW9PDFInput): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const w = doc.internal.pageSize.getWidth();
  const margin = 18;
  let y = 18;

  // Accent bar
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 0, w, 6, "F");

  // Title
  y = 18;
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 25, 40);
  doc.text("W-9 Information Summary", margin, y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 130);
  doc.text(
    "Documento generado por Stafly Core para revisión administrativa. No es la forma oficial del IRS.",
    margin,
    y + 5,
  );

  if (data.company_name) {
    doc.text(`Compañía: ${data.company_name}`, margin, y + 10);
  }
  y += 18;

  // Identity block
  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: { top: 1.5, bottom: 1.5, left: 0, right: 2 } },
    columnStyles: {
      0: { fontStyle: "bold", textColor: [60, 65, 80], cellWidth: 55 },
      1: { textColor: [20, 25, 40] },
    },
    body: [
      ["Legal name", data.legal_name],
      ["Business name / DBA", data.business_name || "—"],
      [
        "Federal tax classification",
        labelFor(TAX_CLASSIFICATIONS, data.tax_classification),
      ],
      ...(data.tax_classification === "llc"
        ? [["LLC tax classification", labelFor(LLC_TAX_CLASSES, data.llc_tax_classification || "")]]
        : []),
      ["Exempt payee code", data.exempt_payee_code || "—"],
      ["FATCA reporting code", data.fatca_code || "—"],
    ] as any,
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // Address block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 25, 40);
  doc.text("Address", margin, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: { top: 1.5, bottom: 1.5, left: 0, right: 2 } },
    columnStyles: {
      0: { fontStyle: "bold", textColor: [60, 65, 80], cellWidth: 55 },
      1: { textColor: [20, 25, 40] },
    },
    body: [
      ["Street", [data.address_line1, data.address_line2].filter(Boolean).join(", ")],
      ["City / State / ZIP", `${data.city}, ${data.state} ${data.zip_code}`],
      ["Account numbers (optional)", data.account_numbers || "—"],
    ],
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // Tax ID block (MASKED)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Taxpayer Identification Number (TIN)", margin, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: { top: 1.5, bottom: 1.5, left: 0, right: 2 } },
    columnStyles: {
      0: { fontStyle: "bold", textColor: [60, 65, 80], cellWidth: 55 },
      1: { textColor: [20, 25, 40] },
    },
    body: [
      ["Tax ID type", tinTypeLabel(data.tax_id_type)],
      ["Tax ID (masked)", maskTin(data.tin)],
    ],
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Certification + signature
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Certification & Electronic Signature", margin, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 65, 80);
  const cert =
    "Bajo pena de perjurio, certifico que: (1) el número que aparece en este formulario es mi número de identificación de contribuyente correcto, (2) no estoy sujeto/a a retención adicional, (3) soy ciudadano/a o persona estadounidense, y (4) los códigos FATCA, si los hay, son correctos.";
  const certLines = doc.splitTextToSize(cert, w - margin * 2);
  doc.text(certLines, margin, y);
  y += certLines.length * 4 + 4;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 25, 40);
  doc.text(`Firma electrónica: ${data.signature_name}`, margin, y);
  y += 5;

  const signedDate = new Date(data.signed_at);
  const mmddyyyy = `${String(signedDate.getMonth() + 1).padStart(2, "0")}/${String(signedDate.getDate()).padStart(2, "0")}/${signedDate.getFullYear()}`;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 65, 80);
  doc.text(`Fecha de firma: ${mmddyyyy}`, margin, y);
  y += 5;
  doc.text(`Certificación aceptada: ${data.certification_accepted ? "Sí" : "No"}`, margin, y);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 150);
  doc.text(
    "El número completo (SSN/EIN) no se almacena en este documento ni en la base de datos. Solo se conservan los últimos 4 dígitos.",
    margin,
    doc.internal.pageSize.getHeight() - 12,
    { maxWidth: w - margin * 2 },
  );

  return doc.output("blob");
}
