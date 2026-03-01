import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen, Users, Shield, ChevronRight, Download, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { employeeSections, adminSections, type ManualSection } from "./manual-data";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import jsPDF from "jspdf";

type Audience = "employee" | "admin";

function ManualSectionCard({ section, index }: { section: ManualSection; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl border border-border/40 bg-card overflow-hidden shadow-xs">
      {/* Header with illustration */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <div className="flex flex-col sm:flex-row gap-4 p-5 sm:p-6">
          <img
            src={section.image}
            alt={section.title}
            className="w-24 h-24 sm:w-28 sm:h-28 object-contain rounded-xl bg-muted/30 p-2 shrink-0 mx-auto sm:mx-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary/60">
                Paso {index + 1}
              </span>
            </div>
            <h3 className="text-lg font-bold font-heading text-foreground tracking-tight">
              {section.title}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {section.subtitle}
            </p>
            <div className="flex items-center gap-1 mt-3 text-xs text-primary font-medium">
              {expanded ? "Ocultar pasos" : `Ver ${section.steps.length} pasos`}
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
            </div>
          </div>
        </div>
      </button>

      {/* Steps */}
      {expanded && (
        <div className="border-t border-border/30 bg-muted/10 px-5 sm:px-6 py-4 space-y-3 animate-fade-in">
          {section.steps.map((step, i) => (
            <div key={i} className="flex gap-3">
              <div className="shrink-0 mt-0.5">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-primary">{i + 1}</span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.description}</p>
                {step.tip && (
                  <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-primary bg-primary/5 rounded-lg px-2.5 py-1.5">
                    <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{step.tip}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function generateManualPDF(audience: Audience) {
  const sections = audience === "employee" ? employeeSections : adminSections;
  const title = audience === "employee" ? "Manual del Empleado" : "Manual del Administrador";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 20;

  // Title page
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(41, 98, 255);
  doc.text("StaflyApps", pageW / 2, y + 20, { align: "center" });

  doc.setFontSize(20);
  doc.setTextColor(30, 30, 30);
  doc.text(title, pageW / 2, y + 35, { align: "center" });

  doc.setFontSize(11);
  doc.setTextColor(120, 120, 120);
  doc.text("Guía paso a paso para usar la plataforma", pageW / 2, y + 45, { align: "center" });

  doc.setFontSize(9);
  doc.text(`Generado: ${new Date().toLocaleDateString("es")}`, pageW / 2, y + 55, { align: "center" });

  // Sections
  sections.forEach((section, si) => {
    doc.addPage();
    y = 20;

    // Section header
    doc.setFontSize(9);
    doc.setTextColor(41, 98, 255);
    doc.setFont("helvetica", "bold");
    doc.text(`SECCIÓN ${si + 1}`, 20, y);

    y += 8;
    doc.setFontSize(18);
    doc.setTextColor(30, 30, 30);
    doc.text(section.title, 20, y);

    y += 7;
    doc.setFontSize(11);
    doc.setTextColor(120, 120, 120);
    doc.setFont("helvetica", "normal");
    doc.text(section.subtitle, 20, y);

    y += 12;

    // Steps
    section.steps.forEach((step, i) => {
      if (y > 250) { doc.addPage(); y = 20; }

      // Step number circle
      doc.setFillColor(230, 240, 255);
      doc.circle(25, y - 1, 4, "F");
      doc.setFontSize(9);
      doc.setTextColor(41, 98, 255);
      doc.setFont("helvetica", "bold");
      doc.text(`${i + 1}`, 25, y + 1, { align: "center" });

      // Step title
      doc.setFontSize(12);
      doc.setTextColor(30, 30, 30);
      doc.text(step.title, 34, y);

      y += 6;

      // Step description
      doc.setFontSize(10);
      doc.setTextColor(90, 90, 90);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(step.description, pageW - 54);
      doc.text(lines, 34, y);
      y += lines.length * 5;

      // Tip
      if (step.tip) {
        y += 2;
        doc.setFontSize(9);
        doc.setTextColor(41, 98, 255);
        doc.setFont("helvetica", "italic");
        const tipLines = doc.splitTextToSize(`💡 ${step.tip}`, pageW - 58);
        doc.text(tipLines, 36, y);
        y += tipLines.length * 4.5;
      }

      y += 6;
    });
  });

  doc.save(`StaflyApps_${title.replace(/ /g, "_")}.pdf`);
}

export default function UserManual() {
  const [audience, setAudience] = useState<Audience>("employee");
  const sections = audience === "employee" ? employeeSections : adminSections;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/help" className="h-8 w-8 rounded-xl flex items-center justify-center hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <h1 className="text-sm font-bold font-heading">Manual de Usuario</h1>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs rounded-full"
            onClick={() => generateManualPDF(audience)}
          >
            <Download className="h-3.5 w-3.5" />
            Descargar PDF
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Audience toggle */}
        <div className="flex items-center gap-2 p-1 bg-muted/50 rounded-xl w-fit">
          <button
            onClick={() => setAudience("employee")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all",
              audience === "employee"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Empleados
          </button>
          <button
            onClick={() => setAudience("admin")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all",
              audience === "admin"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Shield className="h-3.5 w-3.5" />
            Administradores
          </button>
        </div>

        {/* Hero */}
        <div className="rounded-2xl gradient-primary p-6 text-primary-foreground relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,hsl(200_85%_65%/0.4),transparent_60%)]" />
          <div className="relative">
            <h2 className="text-xl font-bold font-heading tracking-tight">
              {audience === "employee" ? "Guía del Portal de Empleados" : "Guía del Panel de Administración"}
            </h2>
            <p className="text-sm opacity-80 mt-1 max-w-md">
              {audience === "employee"
                ? "Aprende a usar todas las funciones de tu portal: fichar, ver turnos, consultar pagos y más."
                : "Domina todas las herramientas: gestión de turnos, nómina, empleados y reportes."
              }
            </p>
            <p className="text-[10px] opacity-60 mt-3">{sections.length} secciones · {sections.reduce((s, sec) => s + sec.steps.length, 0)} pasos</p>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {sections.map((section, i) => (
            <ManualSectionCard key={section.id} section={section} index={i} />
          ))}
        </div>

        {/* Footer */}
        <div className="text-center py-8 space-y-2">
          <div className="flex justify-center">
            <StaflyLogo size={40} />
          </div>
          <p className="text-xs text-muted-foreground">
            ¿Necesitas más ayuda?{" "}
            <Link to="/help" className="text-primary font-medium hover:underline">
              Visita el Centro de Ayuda
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
