import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Clock,
  UserX,
  FileWarning,
  ShieldAlert,
  CalendarX,
  ArrowRight,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

/**
 * /app/needs-attention — VISUAL WIREFRAME ONLY
 *
 * No real data, no detectors, no schema reads.
 * Iteration 2 (2026-05-04): copy ES, decisión por card, jerarquía por secciones,
 * mini log "Resuelto automáticamente". Sin queries, sin schema, sin acciones reales.
 */

type Severity = "critical" | "warn" | "info";

interface MockCard {
  id: string;
  severity: Severity;
  icon: React.ComponentType<{ className?: string }>;
  category: string;
  title: string;
  description: string;
  decision: string;
  count: number;
  cta: string;
  href: string;
  secondary?: string;
  examples: string[];
}

const SEV_STYLES: Record<Severity, { ring: string; chip: string; dot: string; iconBg: string }> = {
  critical: {
    ring: "ring-1 ring-destructive/20 hover:ring-destructive/40",
    chip: "bg-destructive/10 text-destructive border-destructive/20",
    dot: "bg-destructive",
    iconBg: "bg-destructive/10 text-destructive",
  },
  warn: {
    ring: "ring-1 ring-amber-500/20 hover:ring-amber-500/40",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    dot: "bg-amber-500",
    iconBg: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  info: {
    ring: "ring-1 ring-border hover:ring-primary/30",
    chip: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
    iconBg: "bg-muted text-muted-foreground",
  },
};

const MOCK_CARDS: MockCard[] = [
  {
    id: "open-shifts-stale",
    severity: "critical",
    icon: Clock,
    category: "Tiempo y asistencia",
    title: "Clock-ins sin cerrar",
    description: "Trabajadores con clock-in hace más de 16 horas sin clock-out.",
    decision: "Decisión: cerrar ahora, editar hora o escalar.",
    count: 4,
    cta: "Revisar entradas",
    href: "/app/timeclock",
    secondary: "Ver políticas de cierre automático",
    examples: ["Carlos Mendez · 18h", "Juan Rivera · 22h"],
  },
  {
    id: "missing-docs",
    severity: "critical",
    icon: FileWarning,
    category: "Cumplimiento",
    title: "Trabajadores sin documentos requeridos",
    description: "Trabajadores activos sin W-9, ID o autorización de trabajo en archivo.",
    decision: "Decisión: solicitar documento o bloquear programación.",
    count: 7,
    cta: "Abrir centro de documentos",
    href: "/app/documents",
    secondary: "Enviar recordatorio masivo",
    examples: ["3× falta W-9", "2× ID expirado"],
  },
  {
    id: "no-show-yesterday",
    severity: "warn",
    icon: UserX,
    category: "Operaciones",
    title: "No-shows de ayer",
    description: "Asignaciones confirmadas sin clock-in dentro de la ventana de gracia.",
    decision: "Decisión: confirmar ausencia o corregir asistencia.",
    count: 2,
    cta: "Revisar asistencia",
    href: "/app/attendance",
    examples: ["María López · Turno #4821", "Edwin G. · Turno #4836"],
  },
  {
    id: "shift-tomorrow-unstaffed",
    severity: "warn",
    icon: CalendarX,
    category: "Programación",
    title: "Vacantes de mañana",
    description: "Turnos programados para mañana con cupos abiertos.",
    decision: "Decisión: asignar trabajadores o dejar como pendiente.",
    count: 3,
    cta: "Abrir turnos",
    href: "/app/shifts",
    secondary: "Publicar como turno abierto",
    examples: ["JKitchen · 6a-2p · 1 abierto", "Quality · 8a-4p · 2 abiertos"],
  },
  {
    id: "duplicate-workers",
    severity: "warn",
    icon: AlertTriangle,
    category: "Calidad de datos",
    title: "Posibles trabajadores duplicados",
    description: "Perfiles marcados por similitud de nombre, teléfono o email.",
    decision: "Decisión: fusionar, ignorar o revisar después.",
    count: 5,
    cta: "Resolver duplicados",
    href: "/app/workers/duplicates",
    examples: ["Angel Colon (#1205 ↔ #954)", "+4 candidatos"],
  },
  {
    id: "portal-not-active",
    severity: "info",
    icon: ShieldAlert,
    category: "Onboarding",
    title: "Acceso al portal sin activar",
    description: "Trabajadores activos que nunca entraron al portal.",
    decision: "Decisión: enviar recordatorio o pausar.",
    count: 12,
    cta: "Enviar recordatorios",
    href: "/app/workers",
    secondary: "Marcar como inactivo temporal",
    examples: ["8× sin primer login", "4× invitación expirada"],
  },
];

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Crítico",
  warn: "Decisión",
  info: "Sugerencia",
};

const RESOLVED_LOG = [
  {
    icon: Clock,
    text: "Clock-out cerrado automáticamente ayer",
    detail: "Carlos M. · 23:59 (regla 16h)",
  },
  {
    icon: FileWarning,
    text: "Documento marcado como recibido",
    detail: "W-9 · Sandy Arevalo · validado por OCR",
  },
];

export default function NeedsAttention() {
  const totals = MOCK_CARDS.reduce(
    (acc, c) => {
      acc[c.severity] += c.count;
      acc.total += c.count;
      return acc;
    },
    { critical: 0, warn: 0, info: 0, total: 0 } as Record<string, number>,
  );

  const critical = MOCK_CARDS.filter((c) => c.severity === "critical");
  const warn = MOCK_CARDS.filter((c) => c.severity === "warn");
  const info = MOCK_CARDS.filter((c) => c.severity === "info");

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        {/* Header */}
        <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Cola inteligente
              <Badge variant="outline" className="ml-1 border-dashed text-[10px]">
                Mockup
              </Badge>
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Necesita atención
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Stafly encontró situaciones que requieren una decisión humana.
              Resuelve primero lo que bloquea la operación.
            </p>
          </div>

          {/* Summary strip */}
          <div className="flex items-center gap-2">
            <SummaryPill severity="critical" count={totals.critical} />
            <SummaryPill severity="warn" count={totals.warn} />
            <SummaryPill severity="info" count={totals.info} />
          </div>
        </div>

        {/* Hero card — most urgent */}
        <Card className="mb-8 overflow-hidden border-destructive/20 bg-gradient-to-br from-destructive/[0.04] via-background to-background">
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-destructive/10 p-3 text-destructive">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive">
                    Prioridad #1
                  </Badge>
                  <span className="text-xs text-muted-foreground">Tiempo y asistencia</span>
                </div>
                <h2 className="font-display text-xl font-semibold">
                  4 trabajadores siguen con clock-in hace más de 16h
                </h2>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  Estas entradas inflarán el payroll si no se cierran. Lo más probable: clock-outs perdidos.
                </p>
                <p className="mt-2 text-xs font-medium text-destructive">
                  Decisión: cerrar ahora, editar hora o escalar.
                </p>
              </div>
            </div>
            <Button asChild size="lg" variant="default" className="shrink-0">
              <Link to="/app/timeclock">
                Revisar ahora
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </Card>

        {/* Sections */}
        <Section
          title="Crítico"
          subtitle="Bloquea la operación o el payroll si no se actúa."
          severity="critical"
          cards={critical}
        />
        <Section
          title="Decisiones"
          subtitle="Necesitan una respuesta humana hoy o mañana."
          severity="warn"
          cards={warn}
        />
        <Section
          title="Sugerencias"
          subtitle="No urgente. Stafly recomienda revisar cuando tengas tiempo."
          severity="info"
          cards={info}
        />

        {/* Resolved log */}
        <div className="mt-12 border-t border-border/60 pt-6">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold">Resuelto automáticamente</h3>
            <span className="text-xs text-muted-foreground">· últimas 24h</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {RESOLVED_LOG.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
                >
                  <div className="mt-0.5 rounded-md bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-400">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{item.text}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-10 text-center text-xs text-muted-foreground">
          Mockup visual · Sin datos reales · Detectores y conteos se conectarán en Fase 1.
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  severity,
  cards,
}: {
  title: string;
  subtitle: string;
  severity: Severity;
  cards: MockCard[];
}) {
  if (cards.length === 0) return null;
  const s = SEV_STYLES[severity];
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline gap-3">
        <span className={`h-2 w-2 rounded-full ${s.dot}`} />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <ActionCard key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}

function SummaryPill({ severity, count }: { severity: Severity; count: number }) {
  const s = SEV_STYLES[severity];
  return (
    <div className={`flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 ${s.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      <span className="text-xs font-medium">{SEVERITY_LABEL[severity]}</span>
      <span className="font-mono text-sm font-semibold tabular-nums">{count}</span>
    </div>
  );
}

function ActionCard({ card }: { card: MockCard }) {
  const Icon = card.icon;
  const s = SEV_STYLES[card.severity];

  return (
    <Card className={`group relative overflow-hidden bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg ${s.ring}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className={`rounded-lg p-2 ${s.iconBg}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-semibold tabular-nums leading-none">
              {card.count}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              {SEVERITY_LABEL[card.severity]}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {card.category}
          </div>
          <CardTitle className="mt-1 text-base font-semibold leading-snug">
            {card.title}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-sm text-muted-foreground">{card.description}</p>

        <p className={`text-xs font-medium ${
          card.severity === "critical"
            ? "text-destructive"
            : card.severity === "warn"
            ? "text-amber-700 dark:text-amber-400"
            : "text-foreground/80"
        }`}>
          {card.decision}
        </p>

        {/* Examples preview — máx 2 */}
        <div className="space-y-1.5 rounded-lg border border-dashed border-border/60 bg-muted/30 p-2.5">
          {card.examples.slice(0, 2).map((ex, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`h-1 w-1 rounded-full ${s.dot} opacity-60`} />
              <span className="truncate">{ex}</span>
            </div>
          ))}
        </div>

        <Button asChild variant="ghost" size="sm" className="w-full justify-between">
          <Link to={card.href}>
            {card.cta}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>

        {card.secondary && (
          <button
            type="button"
            className="w-full text-center text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {card.secondary}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
