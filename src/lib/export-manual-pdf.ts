import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ModuleSection {
  title: string;
  description: string;
  features: string[];
  config?: string[];
}

const MODULES: ModuleSection[] = [
  {
    title: "1. Dashboard",
    description:
      "Panel de control principal con métricas operativas en tiempo real. Muestra KPIs de empleados activos, turnos del día, nómina estimada, periodo activo y alertas. Widgets personalizables con drag-and-drop.",
    features: [
      "KPIs: empleados activos, turnos hoy, horas trabajadas, nómina estimada",
      "Banner de estado del periodo de nómina activo",
      "Widgets personalizables (orden y visibilidad)",
      "Comparativas con periodo anterior (flechas verdes/rojas)",
      "Muro de anuncios recientes",
      "Accesos rápidos a módulos frecuentes",
    ],
    config: [
      "Personalizar widgets desde el botón 'Personalizar'",
      "Arrastrar widgets para reordenar prioridad",
    ],
  },
  {
    title: "2. Gestión de turnos (Shifts)",
    description:
      "Sistema completo de programación y asignación de turnos con múltiples vistas de calendario. Soporta asignación múltiple de empleados, clientes, ubicaciones y requisitos de transporte.",
    features: [
      "Vistas: Día, Semana por empleado, Semana por trabajo, Mes",
      "Crear, editar, eliminar y duplicar turnos",
      "Asignar múltiples empleados por turno",
      "Asociar cliente y ubicación",
      "Códigos incrementales (#0001, #0002...)",
      "Solicitudes de turno (empleados solicitan, admin aprueba)",
      "Barra de cobertura semanal (posiciones cubiertas vs vacantes)",
      "Requisito de transporte con cálculo automático de vehículos",
      "Creación inline de cliente y ubicación desde el formulario",
      "Descarga de PDF de asignación por turno",
      "Panel de comentarios y chat por turno",
      "Panel de asistencia por turno",
    ],
    config: [
      "Capacidad de vehículo configurable (por defecto 4 personas)",
      "Transporte requerido: sí/no por turno",
      "Notas de transporte y conductor asignado",
    ],
  },
  {
    title: "3. Control de tiempo (Time Clock)",
    description:
      "Sistema de fichaje de entrada/salida con captura GPS. Vista 'Hoy' para supervisión en tiempo real de la asistencia del equipo.",
    features: [
      "Clock-in / clock-out desde portal del empleado",
      "Captura de ubicación GPS al fichar",
      "Vista 'Hoy': quién fichó (verde), quién falta (ámbar), offline (gris)",
      "Timesheets: vista lista y calendario mensual",
      "Aprobación/rechazo de fichajes pendientes",
      "Edición manual de registros con audit trail",
      "Forzar salida de fichajes abiertos",
      "Validación de solapamiento automática",
      "Estados: pendiente, aprobado, rechazado",
    ],
  },
  {
    title: "4. Nómina semanal (Payroll)",
    description:
      "Sistema completo de procesamiento de nómina semanal. Incluye periodos de pago, importación de horas, consolidación automática, novedades y generación de recibos.",
    features: [
      "Periodos de pago: crear, abrir, cerrar, publicar, marcar como pagado",
      "Importación de horas desde Excel/CSV",
      "Parser Connecteam con mapeo de columnas",
      "Consolidación automática (base pay desde time_entries y shifts)",
      "Novedades: bonos, deducciones, ajustes por empleado/periodo",
      "Conceptos: categorías earning/deduction con modos de cálculo",
      "Tasas personalizadas por concepto + empleado",
      "Resumen de periodo: base pay + earnings - deductions = net pay",
      "Exportación Excel con formato profesional",
      "Envío de recibos por email",
      "Flujo de estados: Abierto → Cerrado → Publicado → Pagado",
    ],
    config: [
      "Umbral de overtime (horas semanales)",
      "Tasa de overtime (multiplicador)",
      "Ciclo de pago (día de inicio/fin)",
      "Zona horaria de la empresa",
      "Conceptos y tasas por defecto",
    ],
  },
  {
    title: "5. Empleados",
    description:
      "Gestión completa del ciclo de vida del empleado: alta, perfil, documentos, disponibilidad, acceso al portal y reportes individuales.",
    features: [
      "CRUD de empleados con campos completos",
      "Campos: nombre, teléfono, email, rol, tags, fecha inicio/fin",
      "Campos profesionales: skills, experiencia, nivel de inglés, manager",
      "Campos personales: cumpleaños, dirección, condado, género",
      "Foto de perfil con avatar fallback",
      "Documentos adjuntos (ID, licencia, certificaciones)",
      "Disponibilidad configurable (días bloqueados, excepciones)",
      "Vinculación con usuario del portal (user_id)",
      "Estados activo/inactivo",
      "Importación masiva desde Excel/Connecteam",
      "Directorio visual tipo tarjetas con acciones rápidas",
      "Reportes individuales con desglose por periodo",
      "Exportación de reporte en PDF profesional",
      "Categorías de servicio asignables",
    ],
  },
  {
    title: "6. Clientes",
    description:
      "Gestión de empresas clientes con contactos, historial de solicitudes y facturación.",
    features: [
      "CRUD de clientes con nombre, contacto, teléfono, email, notas",
      "Estado activo/inactivo con soft delete",
      "Historial de solicitudes de staffing",
      "Historial de facturación",
      "Exportación CSV del listado",
      "Panel de auditoría integrado",
    ],
  },
  {
    title: "7. Ubicaciones",
    description:
      "Gestión de ubicaciones de trabajo asociadas a clientes. Soporte de geocerca para validación de fichajes.",
    features: [
      "CRUD de ubicaciones con dirección completa",
      "Asociación a cliente",
      "Geocerca: latitud, longitud, radio",
      "Estado activo/inactivo",
      "Asignación a turnos",
      "Exportación CSV",
      "Panel de auditoría",
    ],
  },
  {
    title: "8. Solicitudes de staffing",
    description:
      "Sistema de intake de demanda para que los clientes soliciten trabajadores o servicios. Pipeline completo desde borrador hasta completado.",
    features: [
      "Formulario de solicitud: cliente, ubicación, categoría, # workers",
      "Fecha, hora inicio/fin, duración estimada",
      "Requisitos: idioma, experiencia, skills, prioridad",
      "Tarifa de facturación y tarifa de pago estimadas",
      "Ciclo de vida: borrador → enviado → revisión → aprobado → asignación → programado → completado",
      "Asignación de candidatos",
      "Conversión a turnos programados",
      "KPIs de pipeline",
      "Manager asignado por solicitud",
      "Notas internas y externas",
    ],
  },
  {
    title: "9. Facturación (Invoicing)",
    description:
      "Módulo de facturación automatizada para empresas clientes. Genera facturas a partir de horas trabajadas y turnos aprobados.",
    features: [
      "Creación de facturas con número automático",
      "Líneas de detalle: descripción, cantidad, precio unitario, total",
      "Asociación a cliente, ubicación, categoría de servicio",
      "Estados: borrador → aprobada → emitida → enviada → pagada",
      "KPIs: cuentas por cobrar, pagado, vencido",
      "Impuestos y descuentos configurables",
      "Notas internas y externas",
      "Seguimiento: enviada, vista, pagada",
      "Exportación y vista previa",
    ],
  },
  {
    title: "10. Categorías de servicio",
    description:
      "Configuración de tipos de servicio para el marketplace de talento y la clasificación operativa.",
    features: [
      "CRUD de categorías con nombre y descripción",
      "Estado activo/inactivo",
      "Seed de categorías por defecto (Limpieza, Movers, Waiters...)",
      "Vinculación con solicitudes, empleados e invoices",
    ],
  },
  {
    title: "11. Reportes",
    description:
      "Motor de reportes con múltiples perspectivas operativas y financieras.",
    features: [
      "Reporte individual por empleado (desglose detallado)",
      "Comparación: programación vs ejecución real",
      "Reporte de discrepancias (tardanzas, ausencias, extras)",
      "Cobertura por turno/ubicación",
      "Turnos no pagados",
      "Reporte de monetización",
      "Exportación PDF y Excel en todos los reportes",
      "Filtros avanzados por periodo, empleado, cliente",
    ],
  },
  {
    title: "12. Portal del empleado",
    description:
      "Experiencia mobile-first para trabajadores de campo. Acceso mediante teléfono + PIN.",
    features: [
      "Dashboard: resumen del día, turno actual, accesos rápidos",
      "Reloj: clock-in/out con GPS",
      "Mis turnos: calendario personal con detalle",
      "Mis pagos: historial con desglose por periodo",
      "Recibo de pago (Pay Stub): comprobante descargable",
      "Acumulado: tabla + totales del año",
      "Chat: mensajería con administradores",
      "Perfil: datos personales editables",
      "Anuncios: feed de comunicaciones",
      "W-9: formulario fiscal para contractors",
      "Dirección del turno clickeable → Google Maps",
    ],
  },
  {
    title: "13. Administración y seguridad",
    description:
      "Sistema de roles, permisos granulares, audit trail y configuración global de la plataforma.",
    features: [
      "Roles: Owner, Admin, Manager, Supervisor, Employee",
      "Permisos granulares por módulo y acción",
      "Audit trail completo (activity_log)",
      "Multi-tenant con RLS (Row Level Security)",
      "Gestión de módulos por empresa",
      "Gestión de usuarios y roles por empresa",
      "Automatizaciones configurables",
      "Templates de notificación",
      "Sistema de tickets de empleados",
    ],
    config: [
      "Activar/desactivar módulos por empresa",
      "Asignar permisos por acción y usuario",
      "Configurar reglas de automatización",
    ],
  },
  {
    title: "14. Comunicaciones",
    description:
      "Sistema de anuncios, chat interno y notificaciones en-app.",
    features: [
      "Anuncios: publicación con prioridad, pin, multimedia",
      "Reacciones de empleados a anuncios",
      "Chat interno entre admins (conversaciones, miembros)",
      "Chat empleado ↔ admin",
      "Notificaciones en-app con campana",
      "Templates de notificación personalizables",
    ],
  },
  {
    title: "15. Fiscal",
    description:
      "Gestión de documentos fiscales para contractors (1099).",
    features: [
      "W-9: captura de datos fiscales del contractor",
      "1099-NEC: generación de formularios anuales",
      "Almacenamiento seguro de TIN (últimos 4 dígitos)",
      "Flujo: borrador → enviado → revisado → firmado",
    ],
  },
  {
    title: "16. Billing y suscripciones",
    description:
      "Integración con Stripe para gestión de planes y suscripciones de la plataforma.",
    features: [
      "Planes: Free (25 emp/1 admin), Pro (100/3), Enterprise (ilimitado)",
      "Checkout con Stripe",
      "Webhooks de pago",
      "Portal de cliente Stripe",
      "Banner de upgrade",
      "Gestión manual de planes desde admin",
    ],
    config: [
      "Stripe keys configurados como secrets",
      "Planes y precios en Stripe Dashboard",
    ],
  },
];

export function downloadManualPdf() {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 18;
  const marginR = 18;
  const contentW = pageW - marginL - marginR;
  let y = 0;

  const addPage = () => {
    doc.addPage();
    y = 20;
  };

  const checkSpace = (need: number) => {
    if (y + need > 275) addPage();
  };

  // ── Cover page ──
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, pageW, 297, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(36);
  doc.setFont("helvetica", "bold");
  doc.text("StaflyApps", pageW / 2, 100, { align: "center" });

  doc.setFontSize(16);
  doc.setFont("helvetica", "normal");
  doc.text("Manual completo de la plataforma", pageW / 2, 115, { align: "center" });

  doc.setFontSize(11);
  doc.setTextColor(180, 180, 180);
  doc.text("Módulos · Funciones · Configuración", pageW / 2, 128, { align: "center" });

  const today = new Date().toLocaleDateString("es-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.setFontSize(10);
  doc.text(today, pageW / 2, 200, { align: "center" });
  doc.text("staflyapps.com", pageW / 2, 208, { align: "center" });

  // ── Table of contents ──
  addPage();
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Índice de contenido", marginL, y);
  y += 12;

  MODULES.forEach((mod) => {
    checkSpace(7);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(55, 65, 81);
    doc.text(mod.title, marginL + 4, y);
    y += 6;
  });

  // ── Module pages ──
  MODULES.forEach((mod) => {
    addPage();
    // Title
    doc.setFillColor(37, 99, 235);
    doc.rect(marginL, y - 5, contentW, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(mod.title, marginL + 4, y + 2);
    y += 14;

    // Description
    doc.setTextColor(55, 65, 81);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const descLines = doc.splitTextToSize(mod.description, contentW);
    doc.text(descLines, marginL, y);
    y += descLines.length * 5 + 6;

    // Features table
    checkSpace(20);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text("Funcionalidades", marginL, y);
    y += 4;

    const featureRows = mod.features.map((f, i) => [String(i + 1), f]);
    autoTable(doc, {
      startY: y,
      head: [["#", "Función"]],
      body: featureRows,
      margin: { left: marginL, right: marginR },
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      alternateRowStyles: { fillColor: [243, 244, 246] },
      columnStyles: { 0: { cellWidth: 10, halign: "center" } },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // Config section
    if (mod.config && mod.config.length > 0) {
      checkSpace(20);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39);
      doc.text("Configuración", marginL, y);
      y += 4;

      const configRows = mod.config.map((c, i) => [String(i + 1), c]);
      autoTable(doc, {
        startY: y,
        head: [["#", "Parámetro"]],
        body: configRows,
        margin: { left: marginL, right: marginR },
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [107, 114, 128], textColor: 255 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: { 0: { cellWidth: 10, halign: "center" } },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }
  });

  // ── Footer on every page ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text("StaflyApps — Manual de la plataforma", marginL, 290);
    doc.text(`Página ${i - 1} de ${totalPages - 1}`, pageW - marginR, 290, {
      align: "right",
    });
  }

  doc.save("StaflyApps-Manual-Completo.pdf");
}
