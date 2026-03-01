import jsPDF from "jspdf";

const CONTENT = `MEGA-PROMPT PARA CHATGPT — GENERACIÓN DE DOCUMENTACIÓN STAFLYAPPS

Copia y pega todo este bloque en ChatGPT (GPT-4 o superior) para que genere manuales, scripts de video, material de onboarding y cualquier documentación que necesites.

════════════════════════════════════════════════════════════

CONTEXTO DE LA APLICACIÓN

Eres un experto en documentación técnica y de usuario. Tu tarea es generar documentación profesional para StaflyApps, una plataforma SaaS de gestión de personal (workforce management) diseñada para empresas de staffing, limpieza comercial, seguridad y servicios generales en Estados Unidos (mercado hispano y bilingüe).

DATOS DE LA EMPRESA
• Nombre oficial: StaflyApps
• URL: staflyapps.com
• Mercado: Empresas de staffing y servicios con 10-500 empleados
• Idiomas: Español (principal), Inglés (secundario)
• Modelo: SaaS con planes Free, Pro ($49/mes) y Enterprise ($149/mes)

STACK TÉCNICO
• Frontend: React 18 + TypeScript + Vite + Tailwind CSS
• Backend: Supabase (PostgreSQL + Edge Functions + Auth + Storage)
• PWA: Progressive Web App instalable en iOS/Android
• Hosting: Lovable Cloud
• Pagos: Stripe (checkout, webhooks, portal de cliente)
• Seguridad: Row Level Security, JWT, roles granulares, audit trail

════════════════════════════════════════════════════════════

MÓDULOS DE LA APLICACIÓN

1. GESTIÓN DE TURNOS (SHIFTS)
   • Vistas: día, semana, mes, por empleado, por cliente
   • Crear, editar, eliminar, asignar turnos
   • Solicitudes de turno (empleados solicitan, admin aprueba)
   • Importación de horarios desde Excel/CSV
   • Códigos incrementales (#0001, #0002...)
   • Notificaciones automáticas al asignar

2. CONTROL DE TIEMPO (TIME CLOCK)
   • Clock-in/out desde portal del empleado
   • Captura de ubicación GPS al fichar
   • Vista "Today" para admin: quién fichó, quién falta
   • Timesheets: vista lista y calendario mensual
   • Forzar salida de fichajes abiertos
   • Estados: pendiente, aprobado, rechazado
   • Validación de solapamiento automática

3. NÓMINA SEMANAL (PAYROLL)
   • Periodos de pago: Crear, abrir, cerrar, publicar, marcar como pagado
   • Importación de horas: Excel/CSV, parser Connecteam, mapeo de columnas
   • Consolidación: Función DB que calcula base pay desde time_entries y shifts
   • Novedades (Movements): Bonos, deducciones, ajustes por empleado/periodo
   • Conceptos: Categorías earning/deduction, modos de cálculo (qty×rate, manual)
   • Tasas por empleado: Rate personalizado por concepto+empleado
   • Resumen de periodo: Base pay + earnings - deductions = net pay
   • Exportación Excel: Formato profesional
   • Envío de recibos por email
   • Flujo de estados: Abierto → Cerrado → Publicado → Pagado

4. REPORTES
   • Reporte individual por empleado (desglose detallado)
   • Comparación programación vs ejecución real
   • Reporte de discrepancias (tardanzas, ausencias, extras)
   • Cobertura por turno/ubicación

5. EMPLEADOS Y DIRECTORIO
   • CRUD de empleados con campos: nombre, teléfono, email, rol, tags, fecha inicio, manager
   • Directorio visual tipo tarjetas
   • Estados activo/inactivo
   • Importación desde Connecteam
   • Vinculación con usuario del portal (user_id)

6. CLIENTES Y UBICACIONES
   • CRUD de clientes con contacto
   • Ubicaciones asociadas a clientes
   • Campos de geocerca (lat, lng, radio)
   • Asignación de turnos por ubicación

7. PORTAL DEL EMPLEADO
   • Dashboard: resumen del día, turno actual, accesos rápidos
   • Reloj: clock-in/out con GPS
   • Mis turnos: calendario personal
   • Mis pagos: historial con expandir detalle por periodo
   • Recibo de pago (PayStub): desglose completo
   • Acumulado: tabla + totales del año
   • Chat: mensajería con administradores
   • Perfil: datos personales
   • Anuncios: feed de comunicaciones
   • W-9: formulario fiscal (contractors)

8. ADMINISTRACIÓN
   • Roles: Owner, Admin, Manager, Supervisor, Employee
   • Permisos granulares: por módulo y acción (ver, editar, eliminar)
   • Audit trail: registro completo de acciones
   • Anuncios: publicación de comunicaciones a empleados
   • Chat interno: mensajería entre admins
   • Notificaciones: sistema de notificaciones en-app
   • Templates de notificación: plantillas personalizables
   • Automatizaciones: reglas automáticas configurables
   • Configuración de nómina: umbral OT, tasa OT, ciclo, zona horaria

9. FISCAL
   • W-9: Captura de datos fiscales de contractors
   • 1099-NEC: Generación de formularios fiscales anuales

10. FACTURACIÓN (BILLING)
   • Integración Stripe
   • Planes: Free (25 emp/1 admin), Pro (100/3), Enterprise (ilimitado)
   • Checkout, webhook, portal de cliente
   • Banner de upgrade

════════════════════════════════════════════════════════════

FLUJOS PRINCIPALES

FLUJO DE ONBOARDING (NUEVO CLIENTE)
1. Visita landing → clic "Empezar gratis"
2. Registra cuenta (email + contraseña + nombre empresa)
3. Sistema crea empresa automáticamente + asigna rol admin
4. Activa módulos por defecto + configuración inicial
5. Redirect al dashboard → listo para operar

FLUJO DE NÓMINA SEMANAL
1. Admin crea periodo de pago (inicio → fin)
2. Importa horas trabajadas (Excel) o se consolidan automáticamente
3. Agrega novedades (bonos, deducciones)
4. Revisa resumen de nómina
5. Cierra periodo → no más ediciones
6. Publica → empleados ven sus recibos
7. Marca como pagado

FLUJO DE FICHAJE DIARIO
1. Empleado abre portal → Reloj
2. Clock In (se registra hora + GPS)
3. Trabaja...
4. Clock Out (se registra hora + GPS)
5. Admin revisa en Today View
6. Aprueba/rechaza/edita fichajes

════════════════════════════════════════════════════════════

INSTRUCCIONES PARA GENERAR DOCUMENTACIÓN

Reglas:
1. Tono: Profesional pero accesible. Bilingüe (español principal, inglés cuando aplique)
2. Formato: Markdown estructurado con headers, bullet points, tablas, callouts
3. Marca: Siempre usar "StaflyApps" (nunca "Stafly" solo ni "STAFLYAPPS")
4. Screenshots: Indica [📸 Screenshot: descripción] donde iría una captura
5. Videos: Para scripts de video, incluye [🎬 Toma: descripción visual]

TIPOS DE DOCUMENTACIÓN:
📘 Manuales de usuario (por módulo) — Manual completo con paso a paso
📗 Guías rápidas (quick start) — 1 página, pasos numerados
📕 Documentación técnica — Arquitectura, API, base de datos, deployment
🎬 Scripts de video tutorial — Guión con narración + descripción visual (2-5 min)
📋 Material de onboarding — Checklist, email bienvenida, guía primeros pasos
📄 Documentos legales — Términos de servicio, privacidad, cookies
🏢 Material corporativo — Propuesta de valor, one-pager, pitch deck outline

════════════════════════════════════════════════════════════

EJEMPLO DE SOLICITUD

"Genera el manual de usuario completo del módulo de Nómina, incluyendo:
- Configuración inicial
- Creación de periodos
- Importación de horas
- Consolidación
- Novedades
- Resumen y cierre
- Exportación
- FAQ
Formato: Markdown, con indicaciones de screenshots y callouts de tips."

════════════════════════════════════════════════════════════

NOTAS IMPORTANTES

• La app es una PWA, no una app nativa
• El mercado principal son empresas hispanas de staffing/limpieza en USA
• La nómina es SEMANAL (no quincenal ni mensual)
• Los empleados son contractors (1099), no W-2 employees
• GPS se captura solo al fichar, no hay tracking continuo
• Los datos están aislados por empresa (multi-tenant con RLS)
`;

export function downloadChatGPTPromptPDF() {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 5.2;
  let y = 20;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(30, 30, 30);
  doc.text("StaflyApps — Mega-Prompt ChatGPT", margin, y);
  y += 10;

  doc.setDrawColor(100, 100, 100);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(40, 40, 40);

  const lines = doc.splitTextToSize(CONTENT, maxWidth);

  for (const line of lines) {
    if (y > doc.internal.pageSize.getHeight() - 18) {
      doc.addPage();
      y = 18;
    }

    const trimmed = (line as string).trim();

    // Section headers (all caps lines with ═)
    if (trimmed.startsWith("═")) {
      doc.setDrawColor(150);
      doc.line(margin, y, pageWidth - margin, y);
      y += 4;
      continue;
    }

    // Bold headers
    if (
      /^(CONTEXTO|DATOS|STACK|MÓDULOS|FLUJOS|INSTRUCCIONES|TIPOS|EJEMPLO|NOTAS|\d+\.\s+[A-ZÁÉÍÓÚÑ])/.test(trimmed)
    ) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text(trimmed, margin, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      y += lineHeight + 1;
      continue;
    }

    doc.text(line, margin, y);
    y += lineHeight;
  }

  // Footer on last page
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(
    `Generado: ${new Date().toLocaleDateString("es-US")} — StaflyApps`,
    margin,
    doc.internal.pageSize.getHeight() - 10,
  );

  doc.save("StaflyApps_MegaPrompt_ChatGPT.pdf");
}
