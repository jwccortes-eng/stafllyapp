/**
 * SmartWorkCardHero
 *
 * Adapter para usar `SmartWorkCard` (worker · standard) en `/portal/shifts`
 * como hero de la próxima jornada / shift activo.
 *
 * BOUNDARIES (HARD):
 *  - Sólo construye un ViewModel a partir de los datos que YA consume
 *    `MyShifts.tsx`. No agrega queries, no toca payroll, time_entries,
 *    attendance writes, closeout, RLS, schema ni Connecteam.
 *  - Las acciones (Aceptar / Marcar entrada / Ver detalles / Decline) son
 *    callbacks; este componente NO modifica ningún registro.
 *  - Si faltan datos críticos o el VM no se puede construir, retorna `null`
 *    para que el caller renderice el hero anterior como fallback seguro.
 *  - Pago se muestra solo si hay compensación; si no, el bloque pay se
 *    oculta para no contaminar la card (regla de "mostrar solo lo necesario").
 */

import { useMemo } from "react";
import { SmartWorkCard } from "@/components/shifts/smart/SmartWorkCard";
import {
  buildSmartWorkCardViewModel,
  type NextActionKind,
  type SmartWorkCardInput,
  type SmartWorkCardViewModel,
} from "@/lib/shifts/smart-work-card";

export interface SmartWorkCardHeroAssignmentLike {
  id: string;
  status: string;
  response_status: string;
  shift: {
    id: string;
    title: string;
    date: string;
    start_time: string;
    end_time: string;
    notes: string | null;
    status: string;
    slots: number | null;
    shift_code?: string | null;
    meeting_point?: string | null;
    meeting_time?: string | null;
    special_instructions?: string | null;
    location?: { name: string } | null;
    client?: { name: string } | null;
  };
}

export interface SmartWorkCardHeroProps {
  assignment: SmartWorkCardHeroAssignmentLike;
  /** `true` cuando la fecha del shift es hoy (habilita Marcar entrada). */
  isToday: boolean;
  /** Worker ya marcó entrada (in_progress). */
  hasClockedIn?: boolean;
  /** Worker ya marcó salida. */
  hasClockedOut?: boolean;
  /** Procesando una acción (loading). */
  busy?: boolean;
  onAccept: () => void;
  onClockIn: () => void;
  onViewDetails: () => void;
  /** Acción secundaria de Rechazar cuando aún debe responder. */
  showDecline?: boolean;
  onDecline?: () => void;
  /** Render returned cuando el VM no se puede construir (datos críticos faltantes). */
  fallback?: React.ReactNode;
  className?: string;
}

/**
 * Mapea response_status del worker → estado de asignación que entiende el VM.
 */
function mapAssignmentStatus(a: SmartWorkCardHeroAssignmentLike): string {
  if (a.response_status === "pending" || a.response_status === "needs_reacceptance") {
    return "pending";
  }
  if (a.response_status === "accepted") return "confirmed";
  if (a.response_status === "rejected" || a.status === "rejected") return "rejected";
  return a.status || "pending";
}

function buildInput(
  a: SmartWorkCardHeroAssignmentLike,
  hasClockedIn: boolean,
  hasClockedOut: boolean,
): SmartWorkCardInput | null {
  const s = a.shift;
  if (!s?.id || !s.date || !s.start_time || !s.end_time) return null;
  return {
    shift: {
      id: s.id,
      title: s.title,
      shift_code: s.shift_code ?? null,
      date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
      notes: s.notes,
      status: s.status,
      // /portal/shifts ya filtra a published.
      publication_status: "published",
      meeting_point: s.meeting_point ?? null,
      meeting_time: s.meeting_time ?? null,
    },
    client: s.client ? { name: s.client.name } : null,
    location: s.location ? { name: s.location.name } : null,
    myAssignment: {
      status: mapAssignmentStatus(a),
      has_clock_in: hasClockedIn,
      has_clock_out: hasClockedOut,
    },
    // /portal/shifts NO consume compensación. Dejamos null para que el
    // bloque pay se oculte en el filtrado de visibleBlocks abajo.
    compensation: null,
    uniform: null,
  };
}

export function SmartWorkCardHero({
  assignment,
  isToday,
  hasClockedIn = false,
  hasClockedOut = false,
  busy = false,
  onAccept,
  onClockIn,
  onViewDetails,
  showDecline,
  onDecline,
  className,
}: SmartWorkCardHeroProps) {
  const vm = useMemo<SmartWorkCardViewModel | null>(() => {
    try {
      const input = buildInput(assignment, hasClockedIn, hasClockedOut);
      if (!input) return null;
      const base = buildSmartWorkCardViewModel(input, {
        audience: "worker",
        density: "standard",
      });

      // ── Refinamientos locales (no tocan la lib) ──
      // 1) Si no hay compensación, ocultar bloque pay para no mostrar "Sin tarifa".
      let visibleBlocks = base.visibleBlocks;
      if (base.pay.basis === "unknown") {
        visibleBlocks = visibleBlocks.filter((b) => b !== "pay");
      }

      // 2) Forzar la acción primaria según el contexto del hero del portal.
      //    Reusa la lógica del caller (que ya conoce isToday/accepted/owed).
      const accepted = assignment.response_status === "accepted";
      const owed =
        assignment.response_status === "pending" ||
        assignment.response_status === "needs_reacceptance";

      let nextAction = base.nextAction;
      if (owed) {
        const isReconfirm = assignment.response_status === "needs_reacceptance";
        nextAction = {
          kind: isReconfirm ? "reconfirm" : "accept",
          label: isReconfirm ? "Reconfirmar" : "Aceptar",
          emphasis: "primary",
          disabled: busy,
        };
      } else if (accepted && isToday && !hasClockedIn) {
        nextAction = {
          kind: "clock_in",
          label: "Marcar entrada",
          emphasis: "primary",
          disabled: busy,
        };
      } else {
        nextAction = {
          kind: "view_details",
          label: "Ver detalles",
          emphasis: "secondary",
        };
      }

      return { ...base, visibleBlocks, nextAction };
    } catch (err) {
      // Cualquier fallo de construcción → fallback en el caller.
      console.warn("[SmartWorkCardHero] could not build VM, falling back", err);
      return null;
    }
  }, [assignment, isToday, hasClockedIn, hasClockedOut, busy]);

  if (!vm) return null;

  const handleAction = (kind: NextActionKind) => {
    if (busy) return;
    switch (kind) {
      case "accept":
      case "reconfirm":
        onAccept();
        return;
      case "clock_in":
        onClockIn();
        return;
      case "view_details":
        onViewDetails();
        return;
      default:
        onViewDetails();
    }
  };

  const handleDirections = () => {
    // Construye URL de Google Maps a partir de texto disponible.
    const q =
      vm.location.addressLine ||
      vm.location.primaryLine ||
      vm.location.meetingPoint ||
      "";
    if (!q) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
  };

  return (
    <div className={className}>
      <SmartWorkCard
        vm={vm}
        onAction={handleAction}
        onDirections={handleDirections}
      />
      {showDecline && onDecline && (
        <button
          type="button"
          onClick={onDecline}
          disabled={busy}
          className="mt-2 w-full text-center text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          No puedo este turno
        </button>
      )}
    </div>
  );
}

export default SmartWorkCardHero;
