import illustLogin from "@/assets/manual/illust-login.png";
import illustClock from "@/assets/manual/illust-clock.png";
import illustShifts from "@/assets/manual/illust-shifts.png";
import illustPayments from "@/assets/manual/illust-payments.png";
import illustDashboard from "@/assets/manual/illust-dashboard.png";
import illustProfile from "@/assets/manual/illust-profile.png";

export interface ManualStep {
  title: string;
  description: string;
  tip?: string;
}

export interface ManualSection {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  steps: ManualStep[];
}

export const employeeSections: ManualSection[] = [
  {
    id: "activacion",
    title: "Activar tu cuenta",
    subtitle: "Configura tu PIN y accede al portal",
    image: illustLogin,
    steps: [
      { title: "Abre el enlace de invitación", description: "Tu supervisor te enviará un enlace por WhatsApp o SMS. Ábrelo desde tu teléfono." },
      { title: "Ingresa tu número de teléfono", description: "Escribe el número que tu empresa tiene registrado. Debe coincidir exactamente." },
      { title: "Crea tu PIN de 4 dígitos", description: "Elige un código fácil de recordar. Este será tu contraseña de acceso.", tip: "No uses 1234 ni 0000. Elige algo personal pero seguro." },
      { title: "Completa tu perfil", description: "Opcionalmente, agrega tu email y una foto de perfil para que tu equipo te reconozca." },
      { title: "¡Listo! Accede al portal", description: "A partir de ahora puedes iniciar sesión con tu teléfono y PIN en staflyapps.com/auth." },
    ],
  },
  {
    id: "reloj",
    title: "Fichar entrada y salida",
    subtitle: "Registra tu jornada laboral con GPS",
    image: illustClock,
    steps: [
      { title: "Ve a la pestaña Reloj", description: "En el menú inferior del portal, toca el ícono de reloj." },
      { title: "Selecciona tu turno (si aplica)", description: "Si tienes turnos asignados hoy, selecciona el turno correcto antes de fichar." },
      { title: "Toca 'Fichar Entrada'", description: "El sistema registrará tu hora de entrada y ubicación GPS.", tip: "Asegúrate de tener la ubicación activada en tu teléfono." },
      { title: "Agrega notas (opcional)", description: "Puedes agregar una nota o comentario al fichar, como 'Llegué temprano' o 'Tráfico en ruta'." },
      { title: "Toca 'Fichar Salida' al terminar", description: "Al finalizar tu jornada, regresa a la pestaña Reloj y toca el botón de salida." },
      { title: "Ubicación GPS automática", description: "Al fichar entrada y salida, el sistema captura tu ubicación GPS de forma automática. Esto permite a tu empresa verificar que estés en el lugar correcto.", tip: "Si tu teléfono pide permiso de ubicación, acéptalo para evitar alertas." },
      { title: "Navegar al trabajo", description: "En la sección de tu turno puedes tocar 'Navegar' para abrir Google Maps, Apple Maps o Waze con la dirección exacta del trabajo." },
    ],
  },
  {
    id: "turnos",
    title: "Ver y solicitar turnos",
    subtitle: "Gestiona tus asignaciones de trabajo",
    image: illustShifts,
    steps: [
      { title: "Abre la pestaña Turnos", description: "Verás tus turnos asignados organizados por fecha." },
      { title: "Revisa los detalles", description: "Cada tarjeta muestra hora, ubicación, cliente y compañeros asignados." },
      { title: "Confirma tu asistencia", description: "Si tu turno requiere confirmación, toca el botón de aceptar o rechazar." },
      { title: "Solicita turnos disponibles", description: "Si hay turnos abiertos ('reclamables'), puedes solicitarlos tocando 'Solicitar'.", tip: "Los turnos reclamables se identifican con un ícono de mano levantada." },
      { title: "Revisa el estado", description: "Tus solicitudes aparecerán como 'Pendiente' hasta que un supervisor las apruebe." },
    ],
  },
  {
    id: "pagos",
    title: "Consultar tus pagos",
    subtitle: "Revisa tu nómina y acumulados",
    image: illustPayments,
    steps: [
      { title: "Ve a Mis Pagos", description: "Desde el menú, accede a tu historial de pagos por periodo." },
      { title: "Selecciona un periodo", description: "Toca cualquier periodo para ver el desglose completo: horas, extras, deducciones y total." },
      { title: "Descarga tu recibo (Pay Stub)", description: "Dentro del detalle del periodo, toca 'Ver recibo' para obtener un comprobante descargable.", tip: "Puedes compartir tu recibo por WhatsApp directamente desde la app." },
      { title: "Revisa tu acumulado", description: "En la sección 'Acumulado' puedes ver el total histórico de tus ingresos." },
    ],
  },
  {
    id: "perfil",
    title: "Tu perfil",
    subtitle: "Actualiza tu información personal",
    image: illustProfile,
    steps: [
      { title: "Accede a tu Perfil", description: "Toca la pestaña Perfil en el menú inferior." },
      { title: "Cambia tu foto", description: "Toca sobre tu avatar para subir o tomar una nueva foto de perfil." },
      { title: "Revisa tus datos", description: "Verifica que tu email, teléfono y rol estén actualizados." },
      { title: "Cerrar sesión", description: "Si necesitas salir de tu cuenta, usa el botón 'Cerrar sesión' al final de la página." },
    ],
  },
];

export const adminSections: ManualSection[] = [
  {
    id: "dashboard",
    title: "Panel de control",
    subtitle: "Vista general de tu empresa",
    image: illustDashboard,
    steps: [
      { title: "Resumen en tiempo real", description: "El Dashboard muestra empleados activos, periodo actual, nómina estimada y alertas." },
      { title: "Periodo activo", description: "En la esquina superior derecha verás el periodo de corte actual con su progreso y estado." },
      { title: "Personaliza widgets", description: "Usa el botón 'Personalizar' para elegir qué métricas ver y en qué orden.", tip: "Arrastra los widgets para reordenarlos según tu prioridad." },
      { title: "KPIs y tendencias", description: "Las tarjetas de métricas muestran comparativas con el periodo anterior (flechas verdes/rojas)." },
      { title: "Muro de anuncios", description: "Publica novedades que tus empleados verán en su portal." },
    ],
  },
  {
    id: "turnos-admin",
    title: "Gestionar turnos",
    subtitle: "Programa y asigna el trabajo semanal",
    image: illustShifts,
    steps: [
      { title: "Crea un turno", description: "Ve a Turnos > Nuevo turno. Define fecha, horario, cliente, ubicación y capacidad." },
      { title: "Asigna empleados", description: "Dentro del turno, agrega empleados desde el buscador. Verás la disponibilidad de cada uno." },
      { title: "Usa las vistas", description: "Cambia entre vista Día, Semana por empleado, Semana por trabajo, y Mes para diferentes perspectivas." },
      { title: "Barra de cobertura", description: "La barra semanal muestra cuántas posiciones están cubiertas vs. vacantes.", tip: "Usa 'Contratar todo' para llenar automáticamente las vacantes con empleados disponibles." },
      { title: "Gestiona solicitudes", description: "Cuando un empleado solicita un turno reclamable, aprueba o rechaza desde 'Solicitudes'." },
    ],
  },
  {
    id: "reloj-admin",
    title: "Reloj y fichajes",
    subtitle: "Supervisa la asistencia de tu equipo",
    image: illustClock,
    steps: [
      { title: "Vista Hoy", description: "La pantalla 'Hoy' muestra quién está fichado (verde), quién debería estarlo (ámbar) y quién está offline (gris)." },
      { title: "Time Clock", description: "Revisa todos los fichajes del día: entrada, salida, horas trabajadas y ubicación GPS." },
      { title: "Aprueba registros", description: "Los fichajes pendientes requieren tu aprobación antes de contabilizarse en la nómina." },
      { title: "Corrige discrepancias", description: "Si un empleado olvidó fichar salida, puedes editar manualmente el registro.", tip: "Las ediciones manuales quedan registradas en el log de actividad." },
    ],
  },
  {
    id: "nomina",
    title: "Nómina y periodos",
    subtitle: "Procesa pagos de forma semanal",
    image: illustPayments,
    steps: [
      { title: "Crea un periodo", description: "Ve a Periodos > Nuevo. El sistema sugiere las fechas según tu configuración (Mié → Mar)." },
      { title: "Importa datos (opcional)", description: "Si usas fuentes externas, importa horas trabajadas desde Excel o Connecteam." },
      { title: "Consolida", description: "En el Resumen del periodo, toca 'Consolidar' para calcular horas regulares, extras y pago base." },
      { title: "Agrega movimientos", description: "Añade extras (bonos, propinas) o deducciones (uniformes, adelantos) por empleado." },
      { title: "Cierra y publica", description: "Cierra el periodo para congelar los montos. Publica para que los empleados vean sus pagos.", tip: "Una vez publicado, los empleados recibirán una notificación automática." },
      { title: "Marca como pagado", description: "Cuando hayas procesado los pagos, marca el periodo como 'Pagado' en el resumen." },
    ],
  },
  {
    id: "empleados-admin",
    title: "Gestionar empleados",
    subtitle: "Altas, directorio y permisos",
    image: illustProfile,
    steps: [
      { title: "Agrega empleados", description: "Ve a Empleados > Nuevo. Ingresa nombre, teléfono y rol. El sistema generará un enlace de invitación." },
      { title: "Envía invitaciones", description: "Desde 'Invitar', comparte el enlace por WhatsApp para que activen su cuenta." },
      { title: "Directorio", description: "El directorio muestra todos los empleados activos con acciones rápidas: llamar, SMS, WhatsApp." },
      { title: "Edita perfiles", description: "Puedes actualizar datos, asignar grupos/tags y gestionar la disponibilidad de cada empleado." },
      { title: "Reportes individuales", description: "Genera reportes detallados por empleado con desglose de periodos, conceptos y totales.", tip: "Exporta reportes en PDF profesional para compartir con tu equipo contable." },
    ],
  },
];
