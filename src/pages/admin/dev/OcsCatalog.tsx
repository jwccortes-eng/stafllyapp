/**
 * OX-4 — Catálogo visual del Operational Card System.
 * Superficie de QA: sin datos reales, sin queries, sin mutaciones.
 */
import { useState } from "react";
import { UserPlus, Eye, Check, X, ArrowRight } from "lucide-react";
import {
  WorkerCard,
  OcsShiftCard,
  TeamCard,
  ValidationCard,
  KpiCard,
  InsightCard,
  type OcsVariant,
  type OcsDensity,
} from "@/components/ocs";
import { Button } from "@/components/ui/button";
import { notifyInfo } from "@/lib/feedback/notify";
import { MT, MT_EYEBROW, TAP, FOCUS_RING } from "@/lib/mobile/mobile-scale";
import { cn } from "@/lib/utils";

const VARIANTS: OcsVariant[] = ["compact", "standard", "expanded"];
const DENSITIES: OcsDensity[] = ["auto", "mobile", "desktop"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className={cn(MT_EYEBROW, "text-muted-foreground")}>{title}</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

export default function OcsCatalog() {
  const [variant, setVariant] = useState<OcsVariant>("standard");
  const [density, setDensity] = useState<OcsDensity>("auto");
  const [readonly, setReadonly] = useState(false);
  const mode = readonly ? "readonly" : "interactive";

  const demo = (label: string) => () =>
    notifyInfo({
      title: "Acción de catálogo",
      fact: `Se pulsó "${label}".`,
      consequence: "El catálogo no ejecuta operaciones reales.",
    });

  const common = { variant, density, mode } as const;

  return (
    <main className="p-4 md:p-6 space-y-8 max-w-7xl mx-auto">
      <header className="space-y-2">
        <h1 className={MT.section}>Operational Card System</h1>
        <p className={cn(MT.body, "text-muted-foreground")}>
          Catálogo oficial de cards. Toda superficie nueva debe construirse con
          estos componentes.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {VARIANTS.map((v) => (
          <Button
            key={v}
            size="sm"
            variant={variant === v ? "default" : "outline"}
            onClick={() => setVariant(v)}
            className={cn(TAP, FOCUS_RING, "rounded-xl")}
          >
            {v}
          </Button>
        ))}
        {DENSITIES.map((d) => (
          <Button
            key={d}
            size="sm"
            variant={density === d ? "secondary" : "outline"}
            onClick={() => setDensity(d)}
            className={cn(TAP, FOCUS_RING, "rounded-xl")}
          >
            {d}
          </Button>
        ))}
        <Button
          size="sm"
          variant={readonly ? "secondary" : "outline"}
          onClick={() => setReadonly((r) => !r)}
          className={cn(TAP, FOCUS_RING, "rounded-xl")}
        >
          {readonly ? "readonly" : "interactive"}
        </Button>
      </div>

      <Section title="WorkerCard — ¿Es la persona correcta?">
        <WorkerCard
          {...common}
          name="Laura Giraldo"
          role="Supervisora de sala"
          status="ready"
          rating={4.8}
          completedShifts={132}
          distance="3,2 km"
          skills={["Manipulación alimentos", "Barra"]}
          recommendation="Ha trabajado 12 turnos en este cliente."
          action={{ label: "Asignar", icon: UserPlus, onClick: demo("Asignar") }}
          actions={[{ label: "Ver perfil", icon: Eye, onClick: demo("Ver perfil"), tone: "quiet" }]}
          onClick={demo("Abrir worker")}
        />
        <WorkerCard
          {...common}
          name="Marco Ruiz"
          role="Camarero"
          status="documents_pending"
          rating={4.1}
          completedShifts={24}
          blocker="Documentación laboral vencida desde hace 4 días."
          action={{ label: "Revisar documentos", onClick: demo("Revisar documentos") }}
        />
      </Section>

      <Section title="ShiftCard — ¿Qué necesita este turno?">
        <OcsShiftCard
          {...common}
          title="Servicio de sala — Evento corporativo"
          clientName="Grupo Andina"
          locationName="Centro de Convenciones"
          dateLabel="mié 12 ago"
          timeRange="08:00–16:00"
          reference="Ref #0258"
          status="pending"
          assigned={3}
          slots={5}
          need="Faltan 2 personas para cubrir el turno."
          note="2 confirmados, 1 sin respuesta."
          action={{ label: "Asignar personal", icon: UserPlus, onClick: demo("Asignar personal") }}
          onClick={demo("Abrir turno")}
        />
        <OcsShiftCard
          {...common}
          title="Montaje nocturno"
          clientName="Logística Sur"
          dateLabel="jue 13 ago"
          timeRange="22:00–06:00"
          status="in_progress"
          assigned={4}
          slots={4}
          need="Turno cubierto y en curso."
          action={{ label: "Ver operación", icon: ArrowRight, onClick: demo("Ver operación") }}
        />
      </Section>

      <Section title="TeamCard — ¿Está listo el equipo?">
        <TeamCard
          {...common}
          title="Equipo del turno #0258"
          subtitle="Grupo Andina · 08:00–16:00"
          assigned={3}
          slots={5}
          confirmed={2}
          present={1}
          members={[
            { firstName: "Laura", lastName: "Giraldo" },
            { firstName: "Marco", lastName: "Ruiz" },
            { firstName: "Ana", lastName: "Peña" },
          ]}
          action={{ label: "Cubrir vacantes", onClick: demo("Cubrir vacantes") }}
        />
        <TeamCard
          {...common}
          title="Equipo del turno #0261"
          subtitle="Logística Sur · 22:00–06:00"
          assigned={4}
          slots={4}
          confirmed={4}
          present={4}
          members={[
            { firstName: "Iván", lastName: "Soto" },
            { firstName: "Rosa", lastName: "Díaz" },
          ]}
          action={{ label: "Abrir Team Hub", onClick: demo("Abrir Team Hub") }}
        />
      </Section>

      <Section title="ValidationCard — ¿Qué decisión debo tomar?">
        <ValidationCard
          {...common}
          title="Horas de Laura Giraldo el 12 ago"
          subtitle="Turno #0258 · Grupo Andina"
          evidence={[
            { label: "Programado", value: "8,0 h" },
            { label: "Fichado", value: "9,5 h", attention: true },
            { label: "Entrada", value: "07:52" },
            { label: "Salida", value: "17:22" },
          ]}
          consequence="Al aprobar, estas horas quedan disponibles para payroll."
          decision={{ label: "Aprobar horas", icon: Check, onClick: demo("Aprobar horas") }}
          alternatives={[
            { label: "Ajustar", onClick: demo("Ajustar") },
            { label: "Rechazar", icon: X, onClick: demo("Rechazar"), tone: "danger" },
          ]}
        />
      </Section>

      <Section title="KpiCard — ¿Qué significa este indicador?">
        <KpiCard
          {...common}
          label="Cobertura semanal"
          value="87%"
          meaning="13 de 100 puestos siguen sin cubrir esta semana."
          trend="up"
          trendLabel="+6 pts vs semana pasada"
          action={{ label: "Ver turnos sin cubrir", onClick: demo("Ver turnos") }}
        />
        <KpiCard {...common} label="Horas pendientes" meaning="" loading />
        <KpiCard
          {...common}
          label="Incidencias abiertas"
          meaning="No se pudo consultar el indicador."
          error="No se pudo cargar el dato."
          onRetry={demo("Reintentar")}
        />
        <KpiCard
          {...common}
          label="No-shows"
          meaning="Sin registros: no equivale a cero incidencias."
          isEmpty
        />
      </Section>

      <Section title="InsightCard — ¿Qué recomienda el sistema?">
        <InsightCard
          {...common}
          recommendation="Adelanta la convocatoria del turno del jueves"
          because="Turnos similares de este cliente tardaron 36 h en cubrirse."
          impact="Si esperas, el riesgo de quedar sin cubrir sube al 40%."
          confidence={0.86}
          action={{ label: "Publicar convocatoria", onClick: demo("Publicar") }}
          actions={[{ label: "Descartar", onClick: demo("Descartar"), tone: "quiet" }]}
        />
      </Section>
    </main>
  );
}
