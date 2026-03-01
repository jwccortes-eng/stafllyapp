import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Search, CalendarDays, Clock, DollarSign, Users, BarChart3, Building2, MessageCircle, Shield, Smartphone, HelpCircle, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { cn } from "@/lib/utils";

interface FaqItem { q: string; a: string }

interface Module {
  id: string;
  icon: any;
  title: string;
  description: string;
  color: string;
  faqs: FaqItem[];
}

const modules: Module[] = [
  {
    id: "shifts", icon: CalendarDays, title: "Turnos", description: "Programación y asignación",
    color: "bg-primary/10 text-primary",
    faqs: [
      { q: "¿Cómo creo un turno?", a: "Ve a Turnos → clic en '+ Nuevo turno'. Selecciona fecha, hora, cliente, ubicación y empleado. Guarda y el empleado recibirá una notificación." },
      { q: "¿Puedo copiar la semana anterior?", a: "Sí. En la vista semanal, usa el botón 'Copiar semana' en la barra de herramientas. Selecciona la semana origen y se duplicarán los turnos." },
      { q: "¿Cómo veo los turnos por cliente?", a: "Usa la pestaña 'Por cliente' en la vista de turnos. Verás un desglose de todos los turnos agrupados por cliente y ubicación." },
      { q: "¿Los empleados pueden solicitar turnos?", a: "Sí. Desde el portal del empleado pueden ver turnos disponibles y enviar solicitudes que el administrador aprueba o rechaza." },
    ],
  },
  {
    id: "timeclock", icon: Clock, title: "Reloj", description: "Fichajes y asistencia",
    color: "bg-success/10 text-success",
    faqs: [
      { q: "¿Cómo fichán los empleados?", a: "Desde el portal del empleado → Reloj. Presionan 'Clock In' al llegar y 'Clock Out' al salir. Se registra la hora y ubicación GPS." },
      { q: "¿Qué pasa si un empleado olvida fichar salida?", a: "El administrador puede forzar la salida desde la vista 'Hoy' (Today View). También puede editar manualmente la hora de salida." },
      { q: "¿Cómo funciona la verificación GPS?", a: "Al fichar, se captura la ubicación del dispositivo. El administrador puede comparar esta ubicación con la dirección de la ubicación asignada." },
      { q: "¿Puedo ver quién está trabajando ahora?", a: "Sí. La vista 'Today' muestra en tiempo real quién está fichado, quién falta y quién ya terminó." },
    ],
  },
  {
    id: "payroll", icon: DollarSign, title: "Nómina", description: "Cálculo y pagos semanales",
    color: "bg-earning/10 text-earning",
    faqs: [
      { q: "¿Cómo funciona el ciclo de nómina?", a: "1) Importas o registras horas → 2) Consolidas el base pay → 3) Agregas novedades (bonos/deducciones) → 4) Revisas resumen → 5) Cierras y publicas → 6) Marcas como pagado." },
      { q: "¿Cómo importo horas trabajadas?", a: "Ve a Importar → sube tu archivo Excel o CSV. El sistema mapea las columnas automáticamente y vincula cada registro con el empleado correspondiente." },
      { q: "¿Qué son las novedades?", a: "Son ajustes adicionales al pago base: bonos, deducciones, reembolsos, etc. Se configuran con conceptos que tienen categoría (ganancia/deducción) y método de cálculo." },
      { q: "¿Cómo se calcula el overtime?", a: "Según la configuración de nómina: horas semanales > umbral (por defecto 40h). La tasa de overtime es configurable (por defecto 1.5x)." },
      { q: "¿Los empleados pueden ver sus recibos?", a: "Sí. Una vez que el periodo se publica, los empleados ven sus recibos detallados en el portal → Mis pagos." },
    ],
  },
  {
    id: "employees", icon: Users, title: "Empleados", description: "Directorio y gestión",
    color: "bg-accent text-accent-foreground",
    faqs: [
      { q: "¿Cómo agrego un empleado?", a: "Ve a Empleados → '+ Nuevo'. Ingresa nombre, teléfono y email. Opcionalmente configura su rol, tasa de pago y fecha de inicio." },
      { q: "¿Cómo invito empleados al portal?", a: "Ve a Invitaciones → ingresa el teléfono del empleado. Recibirán un enlace para registrarse y acceder a su portal." },
      { q: "¿Puedo desactivar un empleado sin eliminarlo?", a: "Sí. Edita el empleado y cambia su estado a inactivo. Sus datos históricos se mantienen para reportes y nóminas previas." },
    ],
  },
  {
    id: "reports", icon: BarChart3, title: "Reportes", description: "Análisis y exportación",
    color: "bg-warning/10 text-warning",
    faqs: [
      { q: "¿Qué reportes están disponibles?", a: "Reporte individual por empleado, comparación programación vs real, discrepancias de fichaje, resumen de periodo, y reporte de cobertura." },
      { q: "¿Puedo exportar a Excel?", a: "Sí. Todos los reportes y el resumen de nómina tienen botón de exportación a Excel (.xlsx)." },
      { q: "¿Puedo comparar dos periodos?", a: "Usa el reporte de comparación para contrastar programación vs ejecución real, identificando ausencias, tardanzas y horas extra." },
    ],
  },
  {
    id: "clients", icon: Building2, title: "Clientes y ubicaciones", description: "Gestión de clientes",
    color: "bg-muted text-foreground",
    faqs: [
      { q: "¿Cómo creo un cliente?", a: "Ve a Clientes → '+ Nuevo'. Ingresa nombre, contacto y notas. Luego puedes asociar ubicaciones al cliente." },
      { q: "¿Puedo asignar turnos por ubicación?", a: "Sí. Al crear un turno seleccionas el cliente y la ubicación específica. Esto permite reportes de horas por ubicación." },
    ],
  },
  {
    id: "portal", icon: Smartphone, title: "Portal del empleado", description: "App para empleados",
    color: "bg-primary/10 text-primary",
    faqs: [
      { q: "¿Cómo acceden los empleados?", a: "Los empleados reciben una invitación por teléfono. Se registran con su número y PIN. Acceden desde el navegador de su celular." },
      { q: "¿Qué pueden hacer los empleados?", a: "Ver turnos asignados, fichar entrada/salida, ver recibos de pago, consultar acumulados, chatear con administradores y ver anuncios." },
      { q: "¿Funciona como app nativa?", a: "StaflyApps es una PWA (Progressive Web App). Los empleados pueden instalarla en su celular desde el navegador para tener acceso directo desde la pantalla de inicio." },
    ],
  },
  {
    id: "security", icon: Shield, title: "Seguridad", description: "Roles y permisos",
    color: "bg-destructive/10 text-destructive",
    faqs: [
      { q: "¿Qué roles existen?", a: "Owner (super admin), Admin, Manager, Supervisor y Employee. Cada rol tiene permisos predefinidos que el Owner puede personalizar." },
      { q: "¿Los datos están aislados por empresa?", a: "Sí. Cada empresa tiene sus datos completamente aislados mediante Row Level Security. Un usuario no puede acceder a datos de otra empresa." },
      { q: "¿Hay registro de auditoría?", a: "Sí. Todas las acciones críticas (crear, editar, eliminar, aprobar) quedan registradas con usuario, fecha, hora y detalles del cambio." },
    ],
  },
];

function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-xl border border-border/50 overflow-hidden">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between p-4 text-left text-sm font-medium text-foreground hover:bg-muted/30 transition-colors"
          >
            {item.q}
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground shrink-0 ml-2 transition-transform", open === i && "rotate-180")} />
          </button>
          {open === i && (
            <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed animate-fade-in">
              {item.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function HelpCenter() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = modules.filter(m => {
    if (!search) return true;
    const s = search.toLowerCase();
    return m.title.toLowerCase().includes(s) || m.description.toLowerCase().includes(s) ||
      m.faqs.some(f => f.q.toLowerCase().includes(s) || f.a.toLowerCase().includes(s));
  });

  const activeModule = selected ? modules.find(m => m.id === selected) : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40 bg-card/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="container flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
          <StaflyLogo size={28} />
        </div>
      </header>

      <main className="container max-w-4xl py-12 space-y-8 animate-fade-in">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-heading font-bold text-foreground">Centro de Ayuda</h1>
          <p className="text-muted-foreground">Encuentra respuestas a las preguntas más frecuentes por módulo</p>
          <div className="max-w-md mx-auto relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar en todos los módulos..."
              value={search}
              onChange={e => { setSearch(e.target.value); setSelected(null); }}
              className="pl-10 h-11 rounded-xl"
            />
          </div>
        </div>

        {!activeModule ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map(m => (
              <button
                key={m.id}
                onClick={() => setSelected(m.id)}
                className="flex items-center gap-4 rounded-2xl border bg-card p-5 hover:bg-accent/50 transition-all text-left shadow-sm hover:shadow-md"
              >
                <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center shrink-0", m.color)}>
                  <m.icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{m.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.description} • {m.faqs.length} preguntas</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" /> Todos los módulos
            </button>
            <div className="flex items-center gap-4">
              <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center shrink-0", activeModule.color)}>
                <activeModule.icon className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-heading font-bold text-foreground">{activeModule.title}</h2>
                <p className="text-sm text-muted-foreground">{activeModule.description}</p>
              </div>
            </div>
            <FaqAccordion items={activeModule.faqs} />
          </div>
        )}

        <div className="rounded-2xl border bg-muted/20 p-6 text-center space-y-2">
          <HelpCircle className="h-7 w-7 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">¿No encontraste lo que buscas?</p>
          <p className="text-xs text-muted-foreground/70">Escríbenos a <span className="text-primary font-medium">soporte@staflyapps.com</span></p>
        </div>
      </main>
    </div>
  );
}
