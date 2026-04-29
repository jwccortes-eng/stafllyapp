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
import { isToday, parseISO } from "date-fns";
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
  const nsToday = ns ? isToday(parseISO(ns.date)) : false;
  const nsConfirmed = ns ? isConfirmed(ns.status) : false;
  const minsToStart = ns ? minutesUntilStart(ns, now) : Number.POSITIVE_INFINITY;

  // 1. clocked_in
  if (ctx.clockStatus.isClockedIn) {
    return {
      kind: "clocked_in",
      tone: "live",
      title: "You're on shift",
      subtitle: ctx.clockStatus.shiftTitle ?? "Tap to clock out when you're done.",
      ctaLabel: "Clock out",
      ctaHref: "/portal/clock",
    };
  }

  // 2. clock_in_now — confirmed today, within window (and not already past end)
  if (ns && nsToday && nsConfirmed && minsToStart <= window) {
    const subtitle =
      minsToStart > 0
        ? `Starts in ${minsToStart} min · ${formatTime(ns.start_time)}`
        : `Started ${Math.abs(minsToStart)} min ago · ${formatTime(ns.start_time)}`;
    return {
      kind: "clock_in_now",
      tone: "primary",
      title: "Clock in available",
      subtitle,
      ctaLabel: "Clock in",
      ctaHref: `/portal/clock?shiftId=${ns.id}`,
      secondaryCtaLabel: "View",
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
          ? `Confirm ${ctx.pendingCount} shifts`
          : "Confirm your shift",
      subtitle: usingNs
        ? `${ns!.client_name ?? ns!.title} · ${formatTime(ns!.start_time)}`
        : "One or more shifts need your confirmation.",
      ctaLabel: "Confirm",
      ctaHref: "/portal/shifts",
      secondaryCtaLabel: "View",
      secondaryCtaHref: "/portal/shifts",
    };
  }

  // 4. next_shift_today — confirmed today, but outside clock window
  if (ns && nsToday && nsConfirmed) {
    return {
      kind: "next_shift_today",
      tone: "primary",
      title: "You have a shift today",
      subtitle: `${formatTime(ns.start_time)} – ${formatTime(ns.end_time)} · ${
        ns.client_name ?? ns.location_name ?? ns.title
      }`,
      ctaLabel: "View shift",
      ctaHref: "/portal/shifts",
      meta: { shiftId: ns.id },
    };
  }

  // 5. missing_docs
  if (ctx.readinessStatus === "pending_documents" && ctx.readinessMissingDocs > 0) {
    return {
      kind: "missing_docs",
      tone: "warning",
      title: "Upload your documents",
      subtitle: `${ctx.readinessMissingDocs} document${
        ctx.readinessMissingDocs > 1 ? "s" : ""
      } missing before you can be assigned.`,
      ctaLabel: "Upload now",
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
      title: "Complete your profile",
      subtitle: `${ctx.readinessMissingPersonal} item${
        ctx.readinessMissingPersonal > 1 ? "s" : ""
      } needed to be assigned to shifts.`,
      ctaLabel: "Continue",
      ctaHref: "/portal/profile/complete",
    };
  }

  // 7. next_shift_future
  if (ns && nsConfirmed) {
    return {
      kind: "next_shift_future",
      tone: "neutral",
      title: "Your next shift",
      subtitle: `${ns.client_name ?? ns.title} · ${formatTime(ns.start_time)}`,
      ctaLabel: "View",
      ctaHref: "/portal/shifts",
      meta: { shiftId: ns.id },
    };
  }

  // 8. claim_available
  if (ctx.claimableCount > 0) {
    return {
      kind: "claim_available",
      tone: "success",
      title: `${ctx.claimableCount} shift${
        ctx.claimableCount > 1 ? "s" : ""
      } available`,
      subtitle: "Tap to view and request the ones that fit you.",
      ctaLabel: "Browse",
      ctaHref: "/portal/shifts?tab=available",
    };
  }

  // 9. all_set — calm fallback
  return {
    kind: "all_set",
    tone: "success",
    title: "You're all set",
    subtitle: "No shift right now. We'll let you know when something opens up.",
    ctaLabel: null,
    ctaHref: null,
  };
}
