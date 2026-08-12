import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Pencil, Copy, Send, Users, Calendar, ClipboardList, History, MoreHorizontal,
  Ban, Lock, Loader2, AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DuplicateShiftDialog } from "./DuplicateShiftDialog";
import { ADMIN_LEX } from "@/lib/ox/lexicon";
import { resolveShiftPublicationTruth } from "@/lib/shifts/publication-truth";

/**
 * ShiftActionBar — Phase 1 Quick Win #1.
 *
 * Single canonical action surface for /app/shift-ops. Reorders existing
 * functionality; does NOT introduce payroll, time_entries, or notification
 * side-effects. Edit / Cancel are wired to handlers passed from the page;
 * Publish/Audit/Payroll-impact are exposed as TODO placeholders when no
 * handler exists, so the standard surface is consistent everywhere.
 */

interface ActionShift {
  id: string;
  title: string;
  status: string;
  publication_status?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  slots: number | null;
  client_id: string | null;
  location_id: string | null;
  notes: string | null;
  meeting_point: string | null;
  special_instructions: string | null;
  pay_type: string | null;
  clock_method: string | null;
  transportation_required: boolean | null;
  car_capacity: number | null;
  transportation_notes: string | null;
  shift_admin_id: string | null;
  meeting_point_location_id?: string | null;
  job_site_location_id?: string | null;
  claimable?: boolean | null;
}

interface ActionAssignment {
  id: string;
  employee_id: string;
  status: string;
  assignment_role: string;
  employee?: { first_name?: string | null; last_name?: string | null } | null;
}

interface Props {
  shift: ActionShift;
  assignments: ActionAssignment[];
  companyId: string;
  userId: string | null;
  hasTimeEntries?: boolean;
  hasOverlap?: boolean;
  onEdit?: () => void;
  onCancel?: () => void;
  onScrollToStaffing?: () => void;
}

export function ShiftActionBar({
  shift, assignments, companyId, userId,
  hasTimeEntries = false, hasOverlap = false,
  onEdit, onCancel, onScrollToStaffing,
}: Props) {
  const navigate = useNavigate();
  const [dupOpen, setDupOpen] = useState(false);
  const [dupWithWorkers, setDupWithWorkers] = useState(false);
  const [dupSessionKey, setDupSessionKey] = useState(0);

  const isDraft = shift.status === "draft" || shift.publication_status === "draft";
  // Verdad canónica de publicación (nunca inferir "Asignado" en local).
  const truth = useMemo(
    () => resolveShiftPublicationTruth({
      shift: {
        ...shift,
        publication_status: shift.publication_status ?? (shift.status === "draft" ? "draft" : "published"),
      },
      assignment: assignments[0] ? { status: assignments[0].status } : null,
      assignments,
    }),
    [shift, assignments],
  );
  const isLocked = ["locked", "archived", "cancelled"].includes(shift.status);
  const slots = shift.slots ?? 0;
  const assigned = assignments.filter(a => a.status !== "rejected").length;
  const needsStaffing = slots > 0 && assigned < slots;

  const editBlockedReason = useMemo(() => {
    if (shift.status === "locked") return "El turno está bloqueado por payroll.";
    if (shift.status === "archived") return "El turno está archivado.";
    if (shift.status === "cancelled") return "El turno está cancelado.";
    return null;
  }, [shift.status]);

  // Soft restriction: hay fichajes pero el turno sigue siendo operable
  // (asistencia, evidencia, notas, auditoría). NO bloqueamos Editar.
  const editRestrictedReason = useMemo(() => {
    if (editBlockedReason) return null;
    if (hasTimeEntries) {
      return "Edición de datos base restringida porque ya hay fichajes. Puedes revisar asistencia, validar presencia, agregar notas y preparar auditoría.";
    }
    return null;
  }, [editBlockedReason, hasTimeEntries]);

  const openDuplicate = (withWorkers: boolean) => {
    console.info("[ShiftActionBar] duplicate_open", {
      source_shift_id: shift.id,
      assignments_length_received: assignments.length,
      employee_ids_received: assignments.map((assignment) => assignment.employee_id),
      requested_copy_workers: withWorkers,
    });

    setDupWithWorkers(withWorkers);
    setDupSessionKey((current) => current + 1);
    setDupOpen(true);
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm px-3 py-2 flex items-center gap-2 flex-wrap">
      {/* Status hint */}
      <div className="flex items-center gap-1.5 mr-1">
        <Badge
          variant={isDraft ? "outline" : "default"}
          className={cn("text-[10px]", isDraft && "border-amber-500/40 text-amber-600 dark:text-amber-400")}
        >
          {isDraft ? "Borrador" : shift.status}
        </Badge>
        {hasOverlap && (
          <Badge variant="destructive" className="text-[10px] gap-1">
            <AlertTriangle className="h-3 w-3" /> Conflicto
          </Badge>
        )}
      </div>

      <div className="h-5 w-px bg-border/50" />

      {/* Primary actions */}
      {needsStaffing && (
        <Button
          size="sm"
          variant="default"
          className="h-8 gap-1.5"
          onClick={onScrollToStaffing}
        >
          <Users className="h-3.5 w-3.5" />
          Resolver staffing ({assigned}/{slots})
        </Button>
      )}

      <Button
        size="sm"
        variant={needsStaffing ? "outline" : "default"}
        className="h-8 gap-1.5"
        onClick={onEdit}
        disabled={!!editBlockedReason}
        title={editBlockedReason ?? editRestrictedReason ?? ADMIN_LEX.edit}
      >
        {editBlockedReason ? <Lock className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
        {editRestrictedReason ? "Editar (restringido)" : "Editar"}
      </Button>

      {isDraft && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          disabled
          title="Publicar — disponible próximamente desde esta barra (usar Editar por ahora)"
        >
          <Send className="h-3.5 w-3.5" />
          Publicar
        </Button>
      )}

      {/* Duplicate ▾ */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 gap-1.5">
            <Copy className="h-3.5 w-3.5" />
            Duplicar
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Duplicar como borrador
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => openDuplicate(false)}>
            <Copy className="h-3.5 w-3.5 mr-2" /> Sin trabajadores
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => openDuplicate(true)}
            disabled={assignments.length === 0}
          >
            <Users className="h-3.5 w-3.5 mr-2" /> Con trabajadores ({assignments.length})
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openDuplicate(false)}>
            <Calendar className="h-3.5 w-3.5 mr-2" /> Elegir fecha…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* More ▾ */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-8 gap-1.5">
            <MoreHorizontal className="h-3.5 w-3.5" />
            Más
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => navigate(`/app/attendance?shiftId=${shift.id}`)}>
            <ClipboardList className="h-3.5 w-3.5 mr-2" /> Ver asistencia
          </DropdownMenuItem>
          <DropdownMenuItem disabled title="Próximamente">
            <History className="h-3.5 w-3.5 mr-2" /> Ver historial / audit
          </DropdownMenuItem>
          <DropdownMenuItem disabled title="Próximamente">
            <Send className="h-3.5 w-3.5 mr-2" /> Ver impacto en payroll
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                disabled={isLocked || !onCancel}
                className="text-destructive focus:text-destructive"
              >
                <Ban className="h-3.5 w-3.5 mr-2" /> {ADMIN_LEX.cancel}…
              </DropdownMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Cancelar este turno?</AlertDialogTitle>
                <AlertDialogDescription>
                  El turno se marcará como cancelado. Los fichajes existentes no se verán afectados
                  y no se enviarán notificaciones automáticas.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Volver</AlertDialogCancel>
                <AlertDialogAction onClick={() => onCancel?.()} className="bg-destructive hover:bg-destructive/90">
                  {ADMIN_LEX.cancel}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>

      {editBlockedReason && (
        <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
          <Lock className="h-3 w-3" /> {editBlockedReason}
        </span>
      )}
      {!editBlockedReason && editRestrictedReason && (
        <span className="ml-auto text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1 max-w-[420px] truncate" title={editRestrictedReason}>
          <AlertTriangle className="h-3 w-3" /> Restricción parcial — sigue operable
        </span>
      )}

      <DuplicateShiftDialog
        key={`${shift.id}-${dupSessionKey}-${dupWithWorkers ? "with-workers" : "without-workers"}`}
        open={dupOpen}
        onOpenChange={setDupOpen}
        shift={shift as any}
        assignments={assignments as any}
        companyId={companyId}
        userId={userId}
        defaultCopyWorkers={dupWithWorkers}
        onDuplicated={(newId) => navigate(`/app/shift-ops?id=${newId}`)}
      />
    </div>
  );
}
