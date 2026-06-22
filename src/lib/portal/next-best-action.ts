/**
 * next-best-action — Pure selector that decides which single action a worker
 * should see at the top of the portal Home.
 *
 * Priority (highest first):
 *   1. clocked_in        — worker is currently on shift
 *   2. clock_in_now      — confirmed shift today, starts within window, not clocked in
 *   3. confirm_shift     — at least one assignment in 'pending' status
 *   4. next_shift_today  — confirmed shift today (later in the day, outside clock window)
 *   5. missing_docs      — readiness pending_documents (only docs missing)
 *   6. missing_profile   — readiness incomplete (personal info missing)
 *   7. next_shift_future — confirmed shift tomorrow / later
 *   8. claim_available   — claimable shifts > 0
 *   9. all_set           — calm fallback
 *
 * Pure functions only — no React, no Supabase, no side effects.
 */
import { isSameDay, parseISO } from "date-fns";
import type { ProfileStatus } from "@/lib/onboarding/profile-status";

export type NbaKind =
  | "clocked_in"
  | "clock_in_now"
  | "confirm_shift"
  | "next_shift_today"
  | "missing_docs"
  | "missing_profile"
  | "next_shift_future"
  | "claim_available"
  | "all_set";

export type NbaTone =
  | "live"        // green / on-shift
  | "primary"    // primary action (clock in, today)
  | "warning"    // pending confirmation, docs
  | "deduction"  // missing critical info
  | "neutral"    // informational
  | "success";   // all set / calm

export interface NbaShift {
  id: string;
  title: string;
  date: string;            // ISO yyyy-MM-dd
  start_time: string;      // HH:mm[:ss]
  end_time: string;
  status: string;          // assignment status
  client_name?: string | null;
  location_name?: string | null;
  meeting_point?: string | null;
}

export interface NbaContext {
  clockStatus: { isClockedIn: boolean; shiftTitle: string | null };
  clockStatusAgeHours?: number | null;
  nextShift: NbaShift | null;
  pendingCount: number;
  claimableCount: number;
  readinessStatus: ProfileStatus | null;
  readinessMissingPersonal: number;
  readinessMissingDocs: number;
  /** Optional override for "now" — useful for tests. */
  now?: Date;
  /** Minutes before shift start when "clock in now" should fire. Default 30. */
  clockInWindowMinutes?: number;
}

export interface NbaResult {
  kind: NbaKind;
  tone: NbaTone;
  title: string;
  subtitle: string;
  ctaLabel: string | null;
  ctaHref: string | null;
  /** Optional secondary CTA (e.g., View). */
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  /** Optional metadata for the renderer (e.g., shift id). */
  meta?: Record<string, string | number | null>;
}

const STALE_CLOCK_THRESHOLD_HOURS = 24;

function isConfirmed(status: string): boolean {
  return status === "confirmed" || status === "accepted";
}

function shiftStartDate(s: NbaShift): Date {
  const [h = 0, m = 0] = (s.start_time ?? "0:0").split(":").map(Number);
  const d = parseISO(s.date);
  d.setHours(h, m, 0, 0);
  return d;
}

function minutesUntilStart(s: NbaShift, now: Date): number {
  return Math.round((shiftStartDate(s).getTime() - now.getTime()) / 60000);
}

function formatTime(hhmm: string): string {
  return (hhmm ?? "").slice(0, 5);
}

export function selectNextBestAction(ctx: NbaContext): NbaResult {
  const now = ctx.now ?? new Date();
  const window = ctx.clockInWindowMinutes ?? 30;
  const ns = ctx.nextShift;
  const nsToday = ns ? isSameDay(parseISO(ns.date), now) : false;
  const nsConfirmed = ns ? isConfirmed(ns.status) : false;
  const minsToStart = ns ? minutesUntilStart(ns, now) : Number.POSITIVE_INFINITY;

  // 1. clocked_in
  if (ctx.clockStatus.isClockedIn) {
    if (ctx.clockStatusAgeHours != null && ctx.clockStatusAgeHours > STALE_CLOCK_THRESHOLD_HOURS) {
      return {
        kind: "clocked_in",
        tone: "warning",
        title: "Turno sin cerrar",
        subtitle: "Hay un registro antiguo que necesita revisión. Puedes cerrarlo desde el reloj.",
        ctaLabel: "Revisar reloj",
        ctaHref: "/portal/clock",
      };
    }

    return {
      kind: "clocked_in",
      tone: "live",
      title: "Estás en turno",
      subtitle: ctx.clockStatus.shiftTitle ?? "Toca para marcar salida cuando termines.",
      ctaLabel: "Marcar salida",
      ctaHref: "/portal/clock",
    };
  }

  // 2. clock_in_now — confirmed today, within window (and not already past end)
  if (ns && nsToday && nsConfirmed && minsToStart <= window) {
    const subtitle =
      minsToStart > 0
        ? `Empieza en ${minsToStart} min · ${formatTime(ns.start_time)}`
        : `Empezó hace ${Math.abs(minsToStart)} min · ${formatTime(ns.start_time)}`;
    return {
      kind: "clock_in_now",
      tone: "primary",
      title: "Marcar entrada disponible",
      subtitle,
      ctaLabel: "Marcar entrada",
      ctaHref: `/portal/clock?shiftId=${ns.id}`,
      secondaryCtaLabel: "Ver",
      secondaryCtaHref: "/portal/shifts",
      meta: { shiftId: ns.id },
    };
  }

  // 3. confirm_shift — pending assignments take precedence over plain "today"
  if (ctx.pendingCount > 0) {
    const usingNs = ns && ns.status === "pending";
    return {
      kind: "confirm_shift",
      tone: "warning",
      title:
        ctx.pendingCount > 1
          ? `Confirma ${ctx.pendingCount} turnos`
          : "Confirma tu turno",
      subtitle: usingNs
        ? `${ns!.client_name ?? ns!.title} · ${formatTime(ns!.start_time)}`
        : "Tienes turnos pendientes de confirmación.",
      ctaLabel: "Confirmar",
      ctaHref: "/portal/shifts",
      secondaryCtaLabel: "Ver",
      secondaryCtaHref: "/portal/shifts",
    };
  }

  // 4. next_shift_today — confirmed today, but outside clock window
  if (ns && nsToday && nsConfirmed) {
    return {
      kind: "next_shift_today",
      tone: "primary",
      title: "Tienes un turno hoy",
      subtitle: `${formatTime(ns.start_time)} – ${formatTime(ns.end_time)} · ${
        ns.client_name ?? ns.location_name ?? ns.title
      }`,
      ctaLabel: "Ver turno",
      ctaHref: "/portal/shifts",
      meta: { shiftId: ns.id },
    };
  }

  // 5. missing_docs
  if (ctx.readinessStatus === "pending_documents" && ctx.readinessMissingDocs > 0) {
    return {
      kind: "missing_docs",
      tone: "warning",
      title: "Te faltan algunos documentos",
      subtitle:
        "Completa los documentos pendientes para quedar totalmente listo para trabajar.",
      ctaLabel: "Ver documentos",
      ctaHref: "/portal/documents",
    };
  }

  // 6. missing_profile
  if (
    ctx.readinessStatus &&
    ctx.readinessStatus !== "ready" &&
    ctx.readinessStatus !== "active" &&
    ctx.readinessMissingPersonal > 0
  ) {
    return {
      kind: "missing_profile",
      tone: "deduction",
      title: "Completa tu perfil",
      subtitle: `Falta${ctx.readinessMissingPersonal > 1 ? "n" : ""} ${ctx.readinessMissingPersonal} dato${
        ctx.readinessMissingPersonal > 1 ? "s" : ""
      } para ser asignado a turnos.`,
      ctaLabel: "Continuar",
      ctaHref: "/portal/profile/complete",
    };
  }

  // 7. next_shift_future
  if (ns && nsConfirmed) {
    return {
      kind: "next_shift_future",
      tone: "neutral",
      title: "Tu próximo turno",
      subtitle: `${ns.client_name ?? ns.title} · ${formatTime(ns.start_time)}`,
      ctaLabel: "Ver",
      ctaHref: "/portal/shifts",
      meta: { shiftId: ns.id },
    };
  }

  // 8. claim_available
  if (ctx.claimableCount > 0) {
    return {
      kind: "claim_available",
      tone: "success",
      title: `${ctx.claimableCount} turno${
        ctx.claimableCount > 1 ? "s" : ""
      } disponible${ctx.claimableCount > 1 ? "s" : ""}`,
      subtitle: "Toca para ver y solicitar los que te convengan.",
      ctaLabel: "Explorar",
      ctaHref: "/portal/shifts?tab=available",
    };
  }

  // 9. all_set — calm fallback
  return {
    kind: "all_set",
    tone: "success",
    title: "Todo listo por aquí",
    subtitle: "Aún no tienes turnos asignados. Te avisaremos aquí cuando tengas uno nuevo.",
    ctaLabel: null,
    ctaHref: null,
  };
}
