/**
 * ProfileSummaryGrid
 *
 * Presentational 2-column card grid that turns the long stacked employee
 * profile into a one-screen operational summary.
 *
 * Strictly read-only / deep-link only:
 *   - No DB writes, no mutations, no new RPCs.
 *   - All "actions" deep-link into existing tabs / handlers already wired
 *     in `UnifiedPersonProfile` (Edit, Invite, Archive, tab switching).
 *   - Data comes entirely from props the parent already fetched.
 *
 * Regression envelope:
 *   - No payroll math, no time_entries, no scheduled_shifts changes.
 *   - No portal permission changes, no SSN/EIN exposure.
 *   - No auth/SMS pipeline touched.
 */
import { useMemo } from "react";
import { ProfileLayerBadge } from "@/components/profile-standard/ProfileLayerBadge";
import { shouldShowInMain } from "@/lib/profile-standard/worker-data-standard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { formatPhoneUS } from "@/lib/phone-format";
import { formatGenderLabel } from "@/lib/gender";
import { formatDisplayText } from "@/lib/format-helpers";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";
import {
  Phone,
  Mail,
  MapPin,
  Briefcase,
  CalendarDays,
  Cake,
  ContactRound,
  FileCheck2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ShieldOff,
  KeyRound,
  Send,
  Car,
  Activity as ActivityIcon,
  ChevronDown,
  ExternalLink,
  Archive,
  Code2,
  Pencil,
} from "lucide-react";

type AnyEmployee = Record<string, any>;

interface Props {
  employee: AnyEmployee;
  portalActive: boolean;
  invitation: any | null;
  readiness: {
    missingDocuments: Array<{ category: string; label: string }>;
    missingPersonal: string[];
    progressPct: number;
    completedRequirements: number;
    totalRequirements: number;
  };
  docsCount: { approved: number; pending: number; rejected: number };
  onboardingDocsCount: { pending: number; rejected: number; expired: number };
  lastClockIn: string | null;
  recentActivity: any[];
  recentShifts: any[];
  frontDeskVisits: any[];
  // Action wiring (all already exist in parent)
  onOpenTab: (tab: string) => void;
  onEdit: () => void;
  onInvite: () => void;
  onArchive: () => void;
  isPrivileged?: boolean;
}

function safeDistance(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = parseISO(dateStr);
    return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : "—";
  } catch {
    return "—";
  }
}

function formatDateMaybe(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const d = parseISO(String(raw));
    if (!isValid(d)) return String(raw);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return String(raw);
  }
}

/* ─────────────── Small visual primitives (presentational only) ─────────────── */

function SectionCard({
  title,
  icon: Icon,
  action,
  badge,
  children,
  tone = "default",
  className,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  tone?: "default" | "warning" | "destructive" | "muted";
  className?: string;
}) {
  const toneBorder =
    tone === "destructive"
      ? "border-destructive/30"
      : tone === "warning"
        ? "border-warning/30"
        : "border-border/50";
  return (
    <Card className={cn(toneBorder, className)}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
            {title}
            {badge}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />}
      <span className="text-muted-foreground shrink-0 min-w-[88px]">{label}</span>
      <span className={cn("min-w-0 truncate", muted ? "text-muted-foreground" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

/* ─────────────── Main component ─────────────── */

export function ProfileSummaryGrid({
  employee,
  portalActive,
  invitation,
  readiness,
  docsCount,
  onboardingDocsCount,
  lastClockIn,
  recentActivity,
  recentShifts,
  frontDeskVisits,
  onOpenTab,
  onEdit,
  onInvite,
  onArchive,
  isPrivileged,
}: Props) {
  /* ───── Datos principales ───── */
  const phone = employee.phone_number ? formatPhoneUS(employee.phone_number) : null;
  const gender = employee.gender ? formatGenderLabel(employee.gender) : null;
  const birthday = employee.birthday ? formatDateMaybe(employee.birthday) : null;
  const startDate = employee.start_date ? formatDateMaybe(employee.start_date) : null;
  const emergencyContact = employee.emergency_contact_name
    ? `${employee.emergency_contact_name}${
        employee.emergency_contact_phone ? ` · ${formatPhoneUS(employee.emergency_contact_phone)}` : ""
      }`
    : null;

  // IA Cleanup v3: legacy/import fields (manager, grupos, tags, rating,
  // recomendado, inglés, etc.) were removed from this main card. They still
  // exist in DB and appear in the single "Datos importados y auditoría"
  // collapsible at the bottom of the profile, admin/dev only.

  /* ───── Cumplimiento (compliance) ───── */
  const missingRequired = readiness.missingDocuments.length;
  const rejectedTotal = docsCount.rejected + onboardingDocsCount.rejected;
  const pendingTotal = docsCount.pending + onboardingDocsCount.pending;
  const expiredTotal = onboardingDocsCount.expired;
  const compTone: "default" | "warning" | "destructive" =
    missingRequired > 0 || rejectedTotal > 0 || expiredTotal > 0
      ? "destructive"
      : pendingTotal > 0
        ? "warning"
        : "default";

  /* ───── Acceso ───── */
  const inviteStatus = portalActive
    ? "Portal activo"
    : invitation?.sent_at
      ? "Invitación enviada"
      : "Sin invitar";
  const hasPin =
    !!employee.access_pin_hash ||
    !!employee.access_pin ||
    !!employee.portal_pin_hash;

  /* ───── Operación ───── */
  const isDriver = employee.has_car === "Yes" || employee.has_car === true;
  const availability = employee.default_availability ?? employee.availability ?? null;
  const blockedDays = employee.blocked_days ?? null;
  const skillsRaw = employee.skills ?? employee.roles ?? null;

  /* ───── Actividad reciente ───── */
  const lastUpdate = employee.updated_at ?? null;
  const latestActivity = recentActivity[0];

  /* ───── Avanzado e importado ───── */
  const importedKeys = useMemo(() => {
    const candidates = [
      "import_source",
      "source",
      "imported_at",
      "connecteam_id",
      "external_id",
      "person_type_guess",
      "payroll_safe",
      "legacy_id",
      "legacy_notes",
    ];
    return candidates
      .map((k) => [k, employee[k]] as const)
      .filter(([, v]) => v != null && String(v).trim() !== "");
  }, [employee]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* 1. DATOS PRINCIPALES */}
      <SectionCard
        title="Datos principales"
        icon={ContactRound}
        badge={<ProfileLayerBadge layer="L2" />}
        action={
          <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={onEdit}>
            <Pencil className="h-3 w-3" /> Editar
          </Button>
        }
      >
        <div className="space-y-1.5">
          {/* Phase 1A privilege guard 2026-06-17: contact PII (phone, email,
              address, emergency contact) hidden from non-privileged viewers.
              isPrivileged already governs admin/owner/dev surfaces upstream
              (UnifiedPersonProfile). No RLS or query changes. */}
          {isPrivileged ? (
            <>
              {phone && <Row icon={Phone} label="Teléfono" value={phone} />}
              {employee.email && <Row icon={Mail} label="Email" value={employee.email} />}
              {employee.address && <Row icon={MapPin} label="Dirección" value={employee.address} />}
            </>
          ) : (
            (phone || employee.email || employee.address) && (
              <Row icon={Phone} label="Contacto" value="Restringido" />
            )
          )}
          {/* Phase 1A: hide-if-empty governed by worker-data-standard helpers.
              Pure presentational gate; no behavior change for non-empty values. */}
          {shouldShowInMain("preferred_name", employee.preferred_name) && (
            <Row
              icon={ContactRound}
              label="Alias"
              value={String(employee.preferred_name).trim()}
            />
          )}
          {shouldShowInMain("employee_role", employee.employee_role) && (
            <Row
              icon={Briefcase}
              label="Rol"
              value={formatDisplayText(employee.employee_role, "label")}
            />
          )}
          {shouldShowInMain("start_date", employee.start_date) && startDate && (
            <Row icon={CalendarDays} label="Inicio" value={startDate} />
          )}
          {shouldShowInMain("gender", employee.gender) && gender && (
            <Row label="Género" value={gender} />
          )}
          {shouldShowInMain("birthday", employee.birthday) && birthday && (
            <Row icon={Cake} label="Cumpleaños" value={birthday} />
          )}
          {isPrivileged && emergencyContact && (
            <Row icon={AlertTriangle} label="Emergencia" value={emergencyContact} />
          )}
          {isPrivileged && !phone && !employee.email && !employee.address && (
            <p className="text-[11px] text-muted-foreground italic">
              Sin datos de contacto · usa "Editar" para completar.
            </p>
          )}
        </div>
      </SectionCard>

      {/* 2. CUMPLIMIENTO */}
      <SectionCard
        title="Cumplimiento"
        icon={FileCheck2}
        tone={compTone}
        badge={<ProfileLayerBadge layer="L2" />}
        action={
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] gap-1"
            onClick={() => onOpenTab("docs")}
          >
            Abrir Docs <ExternalLink className="h-3 w-3" />
          </Button>
        }
      >
        {/* Mobile: compact one-line summary. Desktop: 4-box grid. Phase 1C 2026-06-18 */}
        <div className="sm:hidden">
          {missingRequired > 0 ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/[0.04] p-3">
              <div className="text-sm font-semibold text-destructive">
                {missingRequired} documento{missingRequired === 1 ? "" : "s"} faltante{missingRequired === 1 ? "" : "s"}
              </div>
              {readiness.missingDocuments.length > 0 && (
                <div className="mt-1 text-[12px] text-foreground/80 truncate">
                  {readiness.missingDocuments.slice(0, 3).map((d) => d.label).join(" · ")}
                  {readiness.missingDocuments.length > 3 && ` · +${readiness.missingDocuments.length - 3} más`}
                </div>
              )}
              <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                {pendingTotal > 0 && <span>En revisión: {pendingTotal}</span>}
                {rejectedTotal > 0 && <span className="text-destructive">Rechazados: {rejectedTotal}</span>}
                {expiredTotal > 0 && <span className="text-destructive">Expirados: {expiredTotal}</span>}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-border/40 bg-muted/20 p-3">
              <div className="text-sm font-medium text-foreground">
                Documentación al día
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {pendingTotal > 0
                  ? `${pendingTotal} en revisión · sin bloqueos`
                  : "Sin bloqueos para payroll"}
              </div>
            </div>
          )}
        </div>

        <div className="hidden sm:grid grid-cols-2 gap-2 text-[11px]">
          <div
            className={cn(
              "rounded-md border p-2",
              missingRequired > 0
                ? "border-destructive/30 bg-destructive/[0.04]"
                : "border-border/40 bg-muted/20",
            )}
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Requeridos faltantes
            </div>
            <div
              className={cn(
                "mt-0.5 text-lg font-bold tabular-nums leading-none",
                missingRequired > 0 ? "text-destructive" : "text-foreground",
              )}
            >
              {missingRequired}
            </div>
          </div>
          <div
            className={cn(
              "rounded-md border p-2",
              rejectedTotal > 0
                ? "border-destructive/30 bg-destructive/[0.04]"
                : "border-border/40 bg-muted/20",
            )}
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Rechazados
            </div>
            <div
              className={cn(
                "mt-0.5 text-lg font-bold tabular-nums leading-none",
                rejectedTotal > 0 ? "text-destructive" : "text-foreground",
              )}
            >
              {rejectedTotal}
            </div>
          </div>
          <div
            className={cn(
              "rounded-md border p-2",
              pendingTotal > 0
                ? "border-warning/30 bg-warning/[0.04]"
                : "border-border/40 bg-muted/20",
            )}
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              En revisión
            </div>
            <div
              className={cn(
                "mt-0.5 text-lg font-bold tabular-nums leading-none",
                pendingTotal > 0 ? "text-warning" : "text-foreground",
              )}
            >
              {pendingTotal}
            </div>
          </div>
          <div
            className={cn(
              "rounded-md border p-2",
              expiredTotal > 0
                ? "border-destructive/30 bg-destructive/[0.04]"
                : "border-border/40 bg-muted/20",
            )}
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Expirados
            </div>
            <div
              className={cn(
                "mt-0.5 text-lg font-bold tabular-nums leading-none",
                expiredTotal > 0 ? "text-destructive" : "text-foreground",
              )}
            >
              {expiredTotal}
            </div>
          </div>
        </div>

        {missingRequired > 0 && (
          <div className="hidden sm:block text-[10.5px] text-muted-foreground">
            Documentos requeridos pendientes:{" "}
            <span className="text-foreground">
              {readiness.missingDocuments
                .slice(0, 3)
                .map((d) => d.label)
                .join(" · ")}
              {readiness.missingDocuments.length > 3 &&
                ` · +${readiness.missingDocuments.length - 3} más`}
            </span>
          </div>
        )}
        {missingRequired === 0 && rejectedTotal === 0 && expiredTotal === 0 && (
          <p className="hidden sm:block text-[10.5px] text-muted-foreground">
            Documentación al día · sin bloqueos para payroll.
          </p>
        )}
      </SectionCard>

      {/* 3. ACCESO */}
      <SectionCard
        title="Acceso"
        icon={portalActive ? ShieldCheck : ShieldOff}
        tone={portalActive ? "default" : "warning"}
        badge={<ProfileLayerBadge layer="L2" />}
        action={
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] gap-1"
            onClick={() => onOpenTab("access")}
          >
            Gestionar <ExternalLink className="h-3 w-3" />
          </Button>
        }
      >
        <div className="space-y-1.5 text-xs">
          <Row
            label="Portal"
            value={
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  portalActive
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                    : invitation
                      ? "border-warning/30 bg-warning/10 text-warning"
                      : "border-muted-foreground/30 text-muted-foreground",
                )}
              >
                {inviteStatus}
              </Badge>
            }
          />
          <Row
            label="PIN"
            value={
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  hasPin
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                    : "border-muted-foreground/30 text-muted-foreground",
                )}
              >
                {hasPin ? "Configurado" : "Sin PIN"}
              </Badge>
            }
          />
          <Row label="Módulos" value="8/8 activos" muted />
          {invitation?.sent_at && !portalActive && (
            <Row
              label="Última invitación"
              value={safeDistance(invitation.sent_at)}
              muted
            />
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {!portalActive && (
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={onInvite}>
              <Send className="h-3 w-3" /> {invitation ? "Reenviar" : "Invitar"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] gap-1"
            onClick={() => onOpenTab("access")}
          >
            <KeyRound className="h-3 w-3" /> {hasPin ? "Gestionar PIN" : "Generar PIN"}
          </Button>
        </div>
      </SectionCard>

      {/* 4. OPERACIÓN */}
      <SectionCard
        title="Operación"
        icon={Briefcase}
        badge={<ProfileLayerBadge layer="L2" />}
        action={
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] gap-1"
            onClick={() => onOpenTab("shifts")}
          >
            Ver turnos <ExternalLink className="h-3 w-3" />
          </Button>
        }
      >
        <div className="space-y-1.5">
          <Row
            icon={Car}
            label="Vehículo"
            value={
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  isDriver
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-muted-foreground/30 text-muted-foreground",
                )}
              >
                {isDriver ? "Conductor" : "Sin vehículo"}
              </Badge>
            }
          />
          {availability && (
            <Row label="Disponibilidad" value={String(availability)} muted />
          )}
          {blockedDays && <Row label="Días bloqueados" value={String(blockedDays)} muted />}
          {skillsRaw && <Row label="Habilidades" value={String(skillsRaw)} muted />}
          <Row
            icon={CalendarDays}
            label="Turnos recientes"
            value={
              recentShifts.length > 0
                ? `${recentShifts.length} en historial`
                : "Sin turnos asignados"
            }
            muted
          />
        </div>
      </SectionCard>

      {/* 5. ACTIVIDAD RECIENTE */}
      <SectionCard
        title="Actividad reciente"
        icon={ActivityIcon}
        badge={<ProfileLayerBadge layer="L2" />}
        action={
          frontDeskVisits.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] gap-1"
              onClick={() => onOpenTab("activity")}
            >
              Log completo <ExternalLink className="h-3 w-3" />
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-1.5">
          <Row
            icon={Clock}
            label="Último fichaje"
            value={lastClockIn ? safeDistance(lastClockIn) : "Sin fichajes"}
            muted={!lastClockIn}
          />
          {latestActivity && (
            <Row
              icon={ActivityIcon}
              label="Última acción"
              value={`${latestActivity.action ?? "—"} · ${safeDistance(latestActivity.created_at)}`}
              muted
            />
          )}
          {lastUpdate && (
            <Row
              icon={Pencil}
              label="Perfil actualizado"
              value={safeDistance(lastUpdate)}
              muted
            />
          )}
          {frontDeskVisits.length > 0 && (
            <Row
              icon={ContactRound}
              label="Front Desk"
              value={`${frontDeskVisits.length} visita${frontDeskVisits.length === 1 ? "" : "s"}`}
              muted
            />
          )}
        </div>

        {frontDeskVisits.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger className="group inline-flex items-center gap-1 text-[10.5px] font-medium text-muted-foreground hover:text-foreground transition-colors">
              Ver historial completo
              <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1.5 divide-y divide-border/40">
                {frontDeskVisits.slice(0, 5).map((v: any) => (
                  <div key={v.id} className="flex items-center gap-2 py-1.5 text-[11px]">
                    {v.case_code && (
                      <Badge variant="outline" className="text-[9px] font-mono">
                        {v.case_code}
                      </Badge>
                    )}
                    <span className="text-muted-foreground tabular-nums shrink-0">
                      {new Date(v.checked_in_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="text-muted-foreground truncate">
                      {String(v.visit_type ?? "").replace(/_/g, " ")}
                    </span>
                    <Badge variant="outline" className="ml-auto text-[9px] capitalize">
                      {String(v.status ?? "").replace(/_/g, " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </SectionCard>

      {/* IA Cleanup v3: legacy/import data lives in a single collapsible
          "Datos importados y auditoría" rendered by UnifiedPersonProfile,
          admin/dev only. We intentionally do not repeat it here. */}
    </div>
  );
}
