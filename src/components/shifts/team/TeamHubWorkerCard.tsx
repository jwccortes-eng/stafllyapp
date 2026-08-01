/**
 * OX-4.2 — TeamHubWorkerCard.
 *
 * Persona del equipo renderizada con el Operational Card System.
 * Una sola acción principal contextual (Confirmar · Contactar · Reemplazar ·
 * Agregar teléfono) y el resto en acciones secundarias.
 *
 * Presentacional: la única escritura es guardar el teléfono del perfil, que
 * ya existía en la superficie anterior. No toca payroll, RLS ni asignaciones.
 */
import * as React from "react";
import { useState } from "react";
import { Check, Copy, MessageSquare, Phone, Star, UserMinus, UserPlus, UserCog, XCircle } from "lucide-react";
import { WorkerCard } from "@/components/ocs";
import type { OcsAction } from "@/components/ocs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MT } from "@/lib/mobile/mobile-scale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { notifyError, notifySuccess } from "@/lib/feedback/notify";
import { normalizePhone, buildWhatsAppTargets } from "@/lib/phone";
import { allowedNextStatusesFor, type AssignmentNextStatus } from "@/lib/shifts/team-actions";
import type { Employee } from "@/components/shifts/types";
import {
  primaryWorkerAction, teamSectionOf, type TeamHubAssignmentLike,
} from "@/lib/shifts/team-hub-model";

export interface TeamHubWorkerCardProps {
  assignment: TeamHubAssignmentLike;
  employee: Employee | undefined;
  isCaptain: boolean;
  canManage: boolean;
  /** Historial con este cliente / puntualidad, ya redactado. */
  humanSignal?: string | null;
  /** "Aceptó hace 2 h" u otra marca temporal ya formateada. */
  responseLabel?: string | null;
  onAssignmentAction: (assignmentId: string, nextStatus: AssignmentNextStatus, workerName: string) => void;
  onReplace: () => void;
  onCopyPhone: (phone: string) => void;
  onPhoneSaved?: () => void;
  onOpenWorker?: (employeeId: string) => void;
}

function fullName(e: Employee | undefined): string {
  if (!e) return "Trabajador sin registro";
  return `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "Trabajador sin registro";
}

const STATUS_BY_SECTION = {
  ready: "confirmed",
  pending: "pending",
  attention: "warning",
  replacement: "rejected",
  removed: "inactive",
} as const;

export function TeamHubWorkerCard({
  assignment,
  employee,
  isCaptain,
  canManage,
  humanSignal,
  responseLabel,
  onAssignmentAction,
  onReplace,
  onCopyPhone,
  onPhoneSaved,
  onOpenWorker,
}: TeamHubWorkerCardProps) {
  const name = fullName(employee);
  const phoneDigits = normalizePhone(employee?.phone_number);
  const hasPhone = phoneDigits.length >= 10;
  const wa = hasPhone ? buildWhatsAppTargets(phoneDigits, "") : null;
  const section = teamSectionOf(assignment, { hasPhone });
  const intent = primaryWorkerAction(assignment, { hasPhone, canManage });
  const allowed = canManage ? allowedNextStatusesFor(assignment.status) : [];

  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  const submitPhone = async () => {
    if (!employee) return;
    const digits = normalizePhone(phoneInput);
    if (digits.length < 10) {
      notifyError({
        title: "Número inválido",
        fact: "El teléfono debe tener 10 dígitos.",
        consequence: "No se guardó ningún cambio.",
        key: `hub-phone-${assignment.id}`,
      });
      return;
    }
    setSavingPhone(true);
    try {
      const { error } = await supabase.from("employees").update({ phone_number: digits }).eq("id", employee.id);
      if (error) throw error;
      notifySuccess({
        title: "Teléfono guardado",
        fact: `${name} ya tiene un número de contacto.`,
        consequence: "Ahora puedes llamar, enviar SMS o WhatsApp desde el turno.",
        key: `hub-phone-${assignment.id}`,
      });
      setPhoneDialogOpen(false);
      onPhoneSaved?.();
    } catch (e) {
      notifyError({
        title: "No se pudo guardar el teléfono",
        fact: "El perfil no se actualizó.",
        consequence: "El equipo sigue sin forma de contactar a esta persona.",
        action: { label: "Reintentar", onClick: () => void submitPhone() },
        key: `hub-phone-${assignment.id}`,
        cause: e,
      });
    } finally {
      setSavingPhone(false);
    }
  };

  const action: OcsAction | undefined = (() => {
    switch (intent.kind) {
      case "confirm":
        return {
          label: intent.label,
          icon: Check,
          onClick: () => onAssignmentAction(assignment.id, "confirmed", name),
          "aria-label": `Confirmar a ${name}`,
        };
      case "replace":
        return {
          label: intent.label,
          icon: UserPlus,
          onClick: onReplace,
          "aria-label": `Buscar reemplazo para ${name}`,
        };
      case "manage":
        return {
          label: intent.label,
          icon: Phone,
          onClick: () => setPhoneDialogOpen(true),
          "aria-label": `Agregar teléfono de ${name}`,
        };
      case "contact":
        if (!hasPhone) return undefined;
        return {
          label: intent.label,
          icon: wa?.waMeUrl ? MessageSquare : Phone,
          onClick: () => {
            const url = wa?.waMeUrl ?? `tel:${phoneDigits}`;
            window.open(url, wa?.waMeUrl ? "_blank" : "_self", "noopener,noreferrer");
          },
          "aria-label": `Contactar a ${name}`,
        };
      default:
        return undefined;
    }
  })();

  const secondary: OcsAction[] = [];
  if (hasPhone && intent.kind !== "contact") {
    secondary.push({
      label: "Contactar",
      icon: Phone,
      tone: "quiet",
      onClick: () => window.open(`tel:${phoneDigits}`, "_self"),
      "aria-label": `Llamar a ${name}`,
    });
  }
  if (hasPhone && intent.kind === "contact") {
    secondary.push({
      label: "Copiar tel.",
      icon: Copy,
      tone: "quiet",
      onClick: () => onCopyPhone(phoneDigits),
    });
  }
  if (canManage && section !== "replacement" && allowed.includes("removed")) {
    secondary.push({
      label: "Remover",
      icon: UserMinus,
      tone: "danger",
      onClick: () => onAssignmentAction(assignment.id, "removed", name),
      "aria-label": `Remover a ${name} del turno`,
    });
  }
  if (canManage && allowed.includes("rejected") && section === "pending") {
    secondary.push({
      label: "Rechazó",
      icon: XCircle,
      tone: "quiet",
      onClick: () => onAssignmentAction(assignment.id, "rejected", name),
      "aria-label": `Marcar que ${name} rechazó el turno`,
    });
  }

  const blocker =
    section === "replacement"
      ? assignment.attendance_status === "absent"
        ? "No se presentó. El cupo sigue abierto."
        : "Rechazó el turno. El cupo sigue abierto."
      : !hasPhone
        ? "Sin teléfono. No hay forma de avisarle si algo cambia."
        : null;

  const importedNote =
    assignment.import_batch_id && !assignment.accepted_at && !assignment.responded_at
      ? "Importado desde Connecteam. Aún no confirmado en Stafly."
      : null;

  return (
    <>
      <WorkerCard
        name={name}
        role={assignment.assignment_role ?? (isCaptain ? "Capitán del turno" : undefined)}
        avatarUrl={employee?.avatar_url ?? null}
        status={STATUS_BY_SECTION[section]}
        aside={
          isCaptain ? (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 fill-current" aria-hidden />
              Capitán
            </span>
          ) : undefined
        }
        blocker={blocker}
        recommendation={humanSignal ?? importedNote ?? responseLabel ?? undefined}
        primary={
          assignment.attendance_status === "present" || assignment.attendance_status === "checked_in" ? (
            <span className={cn(MT.body, "text-status-success font-medium")}>En sitio</span>
          ) : assignment.attendance_status === "late" ? (
            <span className={cn(MT.body, "text-status-warning font-medium")}>Llegó tarde</span>
          ) : undefined
        }
        action={action}
        actions={secondary}
        onClick={onOpenWorker && employee ? () => onOpenWorker(employee.id) : undefined}
        mode={section === "removed" ? "readonly" : "interactive"}
        variant="standard"
      />

      <Dialog open={phoneDialogOpen} onOpenChange={setPhoneDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Agregar teléfono</DialogTitle>
            <DialogDescription>{name} · 10 dígitos. Sólo actualiza este perfil.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`hub-phone-input-${assignment.id}`}>Número de teléfono</Label>
            <Input
              id={`hub-phone-input-${assignment.id}`}
              inputMode="tel"
              autoFocus
              placeholder="(555) 123-4567"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void submitPhone(); }}
            />
            <p className={cn(MT.caption, "text-muted-foreground")}>
              No se envían notificaciones. No se modifican registros duplicados.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setPhoneDialogOpen(false)} disabled={savingPhone}>
              Cancelar
            </Button>
            <Button onClick={() => void submitPhone()} disabled={savingPhone}>
              {savingPhone ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { UserCog };
