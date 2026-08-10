/**
 * P0 — WORKER IDENTITY QUALITY / PASSPORT PHASE 2
 * Diálogo de revisión asistida de un grupo de identidad.
 *
 * Muestra la evidencia por registro, el registro recomendado (sin imponerlo),
 * el plan de consolidación en seco y tres acciones SEPARADAS:
 * corregir asignación · preparar consolidación · marcar personas distintas.
 *
 * Ninguna acción fusiona registros ni mueve horas, documentos, nómina o
 * cuentas de acceso: solo se registra la decisión del administrador.
 */
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { portalStatusLabel } from "@/lib/portal/portal-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert, CheckCircle2, AlertTriangle } from "lucide-react";
import { notifyError, notifySuccess } from "@/lib/feedback/notify";
import {
  IDENTITY_VERDICT_LABELS,
  maskEmail,
  maskExternalId,
  maskPhone,
  type IdentityGroup,
} from "@/lib/identity/person-truth";
import {
  buildMergePlan,
  listPrimaryContradictions,
  DOMAIN_STATUS_LABELS,
  EMPTY_EVIDENCE,
  type DomainStatus,
  type RecordEvidence,
} from "@/lib/identity/merge-plan";
import type { IdentityReviewDecision } from "@/hooks/useIdentityQuality";

const STATUS_VARIANT: Record<DomainStatus, "default" | "secondary" | "destructive"> = {
  SAFE: "secondary",
  REVIEW_REQUIRED: "default",
  BLOCKED: "destructive",
};

interface Props {
  group: IdentityGroup | null;
  evidence: Record<string, RecordEvidence>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecision: (input: {
    group: IdentityGroup;
    decision: IdentityReviewDecision;
    confirmedPrimaryId?: string | null;
    mergePlan?: unknown;
    notes?: string | null;
  }) => Promise<void>;
}

export function IdentityGroupReviewDialog({
  group,
  evidence,
  open,
  onOpenChange,
  onDecision,
}: Props) {
  const [chosenPrimary, setChosenPrimary] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [showPlan, setShowPlan] = useState(false);
  const [saving, setSaving] = useState(false);

  const targetId = chosenPrimary ?? group?.primary?.candidateId ?? null;

  const plan = useMemo(
    () => (group ? buildMergePlan(group, evidence, targetId) : null),
    [group, evidence, targetId],
  );
  const contradictions = useMemo(
    () => (group ? listPrimaryContradictions(group, evidence, targetId) : []),
    [group, evidence, targetId],
  );

  if (!group || !plan) return null;

  const submit = async (decision: IdentityReviewDecision) => {
    setSaving(true);
    try {
      await onDecision({
        group,
        decision,
        confirmedPrimaryId: decision === "consolidation_prepared" ? targetId : null,
        mergePlan: decision === "consolidation_prepared" ? plan : null,
        notes: notes.trim() || null,
      });
      notifySuccess({
        title: "Revisión registrada",
        fact: "Se guardó la decisión y la evidencia que la respalda.",
        consequence:
          "No se modificaron trabajadores, asignaciones, documentos, horas, nómina ni accesos.",
      });
      onOpenChange(false);
      setNotes("");
      setShowPlan(false);
      setChosenPrimary(null);
    } catch (cause) {
      notifyError({
        title: "No se pudo registrar la revisión",
        fact: "La decisión no quedó guardada.",
        consequence: "El grupo sigue pendiente de revisión.",
        cause,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{group.displayName}</DialogTitle>
          <DialogDescription>
            {IDENTITY_VERDICT_LABELS[group.verdict]} · {group.reason}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* 1. Registros y evidencia */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">¿Qué encontramos?</h3>
            {group.records.map((r) => {
              const ev = evidence[r.id] ?? EMPTY_EVIDENCE(r.id);
              const isTarget = r.id === targetId;
              return (
                <div
                  key={r.id}
                  className={`rounded-lg border p-3 text-sm ${isTarget ? "border-primary" : ""}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {[r.first_name, r.last_name].filter(Boolean).join(" ") || "Sin nombre"}
                    </span>
                    <span className="text-xs text-muted-foreground">{r.id.slice(0, 8)}</span>
                    {isTarget && <Badge>Registro recomendado</Badge>}
                    <Badge variant="outline">{portalStatusLabel(r)}</Badge>
                    {r.is_active === false && <Badge variant="outline">Inactivo</Badge>}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto"
                      onClick={() => setChosenPrimary(r.id)}
                      disabled={isTarget}
                    >
                      Usar como principal
                    </Button>
                  </div>
                  <div className="mt-2 grid gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-2">
                    <span>Teléfono: {maskPhone(r.phone_number)}</span>
                    <span>Email: {maskEmail(r.email)}</span>
                    <span>ID externo: {maskExternalId(r.connecteam_employee_id)}</span>
                    <span>Servicios: {ev.assignments}</span>
                    <span>
                      Horas: {ev.timeEntries} ({ev.approvedTimeEntries} aprobadas)
                    </span>
                    <span>Nómina: {ev.payrollReferences} referencias</span>
                    <span>
                      Documentos: {ev.documents} ({ev.legalDocuments} legales)
                    </span>
                    <span>
                      Disponibilidad: {ev.hasAvailability ? "configurada" : "—"} · Evaluaciones:{" "}
                      {ev.reviews}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>

          {/* 2. Fragmentación y por qué */}
          {group.fragmentation.length > 0 && (
            <section className="space-y-1">
              <h3 className="text-sm font-semibold">¿Por qué está fragmentada?</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {group.fragmentation.map((f) => (
                  <li key={f.key}>• {f.label}</li>
                ))}
              </ul>
            </section>
          )}

          {/* 3. Candidato principal */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">¿Qué recomendamos?</h3>
            {group.primary ? (
              <p className="text-sm text-muted-foreground">
                Registro operativo recomendado: <b>{targetId?.slice(0, 8)}</b> — {group.primary.reason}{" "}
                (confianza {Math.round(group.primary.confidence * 100)}%). El administrador confirma;
                el sistema no lo impone.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay evidencia suficiente para recomendar un registro principal.
              </p>
            )}
            {contradictions.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <span className="font-medium">Contradicciones:</span>
                  <ul className="mt-1 space-y-0.5">
                    {contradictions.map((c) => (
                      <li key={c}>• {c}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </section>

          <Separator />

          {/* 4. Acciones separadas */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Acciones</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => submit("assignment_reviewed")}
              >
                Corregir asignación
              </Button>
              <Button variant="outline" onClick={() => setShowPlan((v) => !v)}>
                {showPlan ? "Ocultar plan" : "Preparar consolidación"}
              </Button>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => submit("not_duplicate")}
              >
                Personas distintas
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              "Corregir asignación" registra que el servicio apuntaba al registro equivocado.
              "Preparar consolidación" genera un plan en seco. Ninguna ejecuta cambios.
            </p>
          </section>

          {/* 5. Plan dry-run */}
          {showPlan && (
            <section className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">Plan de consolidación (simulación)</h3>
                <Badge variant={STATUS_VARIANT[plan.overall]}>
                  {DOMAIN_STATUS_LABELS[plan.overall]}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{plan.headline}</p>

              {plan.blockers.length > 0 && (
                <Alert variant="destructive">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertDescription>
                    <ul className="space-y-0.5">
                      {plan.blockers.map((b) => (
                        <li key={b}>• {b}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                {plan.domains.map((d) => (
                  <div key={d.key} className="rounded-md border p-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{d.label}</span>
                      <Badge variant={STATUS_VARIANT[d.status]}>
                        {DOMAIN_STATUS_LABELS[d.status]}
                      </Badge>
                    </div>
                    <p className="mt-1">{d.action}</p>
                    <p className="text-muted-foreground">{d.reason}</p>
                  </div>
                ))}
              </div>

              <Textarea
                placeholder="Notas de la revisión (opcional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={saving || plan.overall === "BLOCKED" || !targetId}
                  onClick={() => submit("consolidation_prepared")}
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  Guardar plan preparado
                </Button>
                <Button
                  variant="ghost"
                  disabled={saving}
                  onClick={() => submit("deferred")}
                >
                  Posponer
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Guardar el plan no ejecuta nada: deja constancia de la decisión y de la evidencia.
                Un plan bloqueado no puede guardarse como preparado.
              </p>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
