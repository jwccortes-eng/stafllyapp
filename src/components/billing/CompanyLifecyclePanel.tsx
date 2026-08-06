import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { notify } from "@/lib/feedback/notify";
import {
  ACCESS_DESCRIPTION,
  ACCESS_LABEL,
  ACCESS_STATES,
  APPROVAL_LABEL,
  COMMERCIAL_LABEL,
  blockedSensitiveOperations,
  normalizeLifecycle,
  type AccessState,
} from "@/lib/company/access-state";
import {
  approveCompany,
  reactivateCompany,
  rejectCompany,
  setCompanyAccessState,
  type LifecycleWriteResult,
} from "@/lib/data/company-lifecycle-write";

interface Props {
  companyId: string;
  companyName: string;
  row: Record<string, unknown>;
  /** Solo un propietario global ve las acciones de decisión. */
  canDecide: boolean;
  onChanged: () => void;
}

const ACCESS_TONE: Record<AccessState, string> = {
  active: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  grace: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  restricted: "border-amber-600/50 text-amber-700 dark:text-amber-400",
  suspended: "border-destructive/50 text-destructive",
  cancelled: "border-muted-foreground/40 text-muted-foreground",
};

export function CompanyLifecyclePanel({ companyId, companyName, row, canDecide, onChanged }: Props) {
  const lifecycle = normalizeLifecycle(row);
  const [reason, setReason] = useState("");
  const [targetAccess, setTargetAccess] = useState<AccessState>(lifecycle.access_state);
  const [busy, setBusy] = useState<string | null>(null);

  const blocked = blockedSensitiveOperations(lifecycle);

  const handle = async (
    label: string,
    run: () => Promise<LifecycleWriteResult>,
  ) => {
    setBusy(label);
    try {
      const result = await run();
      if (result.status === "conflict") {
        notify.error({
          title: "La empresa cambió mientras decidías",
          detail: `Estado actual: ${result.actualApprovalState ?? "?"} / ${result.actualAccessState ?? "?"}.`,
          action: "Recarga la ficha y vuelve a intentarlo.",
        });
        onChanged();
        return;
      }
      if (result.status === "error") {
        notify.error({
          title: "No se aplicó la transición",
          detail: result.message,
          action: result.reason === "denied" ? "Requiere un propietario global." : "Revisa los datos e intenta de nuevo.",
        });
        return;
      }
      notify.success({
        title: result.status === "noop" ? "Sin cambios" : `${label} aplicado`,
        detail: `${companyName}: aprobación ${APPROVAL_LABEL[result.approvalState]}, acceso ${ACCESS_LABEL[result.accessState]}.`,
        action: result.nextAction ?? undefined,
      });
      setReason("");
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Ciclo de vida</span>
        <Badge variant="outline">Aprobación: {APPROVAL_LABEL[lifecycle.approval_state]}</Badge>
        <Badge variant="outline" className={ACCESS_TONE[lifecycle.access_state]}>
          Acceso: {ACCESS_LABEL[lifecycle.access_state]}
        </Badge>
        <Badge variant="outline">Comercial: {COMMERCIAL_LABEL[lifecycle.commercial_state]}</Badge>
      </div>

      <p className="text-xs text-muted-foreground">{ACCESS_DESCRIPTION[lifecycle.access_state]}</p>

      {lifecycle.approval_state === "rejected" && lifecycle.rejection_reason && (
        <p className="text-xs text-destructive flex items-start gap-1">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          Motivo del rechazo: {lifecycle.rejection_reason}
        </p>
      )}

      {lifecycle.access_state_reason && (
        <p className="text-xs text-muted-foreground">Último motivo registrado: {lifecycle.access_state_reason}</p>
      )}

      <div className="text-xs text-muted-foreground">
        {blocked.length === 0 ? (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> Operación completa disponible.
          </span>
        ) : (
          <>Operaciones nuevas bloqueadas: {blocked.length}. Lectura, payroll histórico, documentos y exportación siguen disponibles.</>
        )}
      </div>

      {canDecide && (
        <div className="space-y-3 border-t pt-3">
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Motivo de la decisión (obligatorio para rechazo y cambios de acceso)"
            className="text-sm"
            rows={2}
          />

          <div className="flex flex-wrap items-center gap-2">
            {lifecycle.approval_state !== "approved" && (
              <Button
                size="sm"
                disabled={!!busy}
                onClick={() =>
                  handle("Aprobación", () =>
                    approveCompany({
                      companyId,
                      expectedApprovalState: lifecycle.approval_state,
                      expectedVersion: lifecycle.version,
                      reason: reason.trim() || null,
                      idempotencyKey: `approve:${companyId}:${lifecycle.version ?? 0}`,
                    }),
                  )
                }
              >
                {busy === "Aprobación" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Aprobar empresa
              </Button>
            )}

            {lifecycle.approval_state !== "rejected" && (
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy || !reason.trim()}
                onClick={() =>
                  handle("Rechazo", () =>
                    rejectCompany({
                      companyId,
                      expectedApprovalState: lifecycle.approval_state,
                      expectedVersion: lifecycle.version,
                      reason: reason.trim(),
                      idempotencyKey: `reject:${companyId}:${lifecycle.version ?? 0}`,
                    }),
                  )
                }
              >
                Rechazar
              </Button>
            )}

            {lifecycle.approval_state === "approved" && lifecycle.access_state !== "active" && (
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  handle("Reactivación", () =>
                    reactivateCompany({
                      companyId,
                      expectedAccessState: lifecycle.access_state,
                      expectedVersion: lifecycle.version,
                      reason: reason.trim() || "Reactivación operativa",
                      idempotencyKey: `reactivate:${companyId}:${lifecycle.version ?? 0}`,
                    }),
                  )
                }
              >
                Reactivar
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={targetAccess} onValueChange={v => setTargetAccess(v as AccessState)}>
              <SelectTrigger className="h-8 w-[220px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCESS_STATES.map(s => (
                  <SelectItem key={s} value={s} className="text-xs">
                    {ACCESS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy || !reason.trim() || targetAccess === lifecycle.access_state}
              onClick={() =>
                handle("Cambio de acceso", () =>
                  setCompanyAccessState({
                    companyId,
                    expectedApprovalState: lifecycle.approval_state,
                    expectedAccessState: lifecycle.access_state,
                    expectedVersion: lifecycle.version,
                    targetAccessState: targetAccess,
                    reason: reason.trim(),
                    idempotencyKey: `access:${companyId}:${targetAccess}:${lifecycle.version ?? 0}`,
                  }),
                )
              }
            >
              Cambiar acceso
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Ninguna transición borra información. Payroll histórico, fichajes, documentos, facturas y exportaciones
            permanecen accesibles en todos los estados.
          </p>
        </div>
      )}
    </div>
  );
}
