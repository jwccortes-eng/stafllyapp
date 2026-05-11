// Mobile Agenda — shared contracts. Presentational only.
// No Supabase, no payroll, no business logic. Data must arrive normalized.
import type { LucideIcon } from "lucide-react";

export type AgendaStatus =
  | "pending"
  | "confirmed"
  | "needs_reacceptance"
  | "rejected"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "available"
  | "past";

export type AgendaTone =
  | "primary"
  | "sky"
  | "emerald"
  | "amber"
  | "rose"
  | "slate";

export interface AgendaAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "destructive" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
}

export interface AgendaMeetingPoint {
  /** Free-text address or location name */
  address: string;
  /** "HH:mm" — optional. If absent, only the address is shown. */
  time?: string | null;
  caption?: string | null;
}

export interface AgendaItem {
  id: string;
  /** ISO yyyy-mm-dd */
  date: string;
  /** "HH:mm" — protagonist */
  startTime: string;
  /** "HH:mm" — secondary, "Termina aprox." */
  endTime?: string | null;
  /** Client / event title */
  title: string;
  /** Short location label */
  subtitle?: string | null;
  meetingPoint?: AgendaMeetingPoint | null;
  status: AgendaStatus;
  /** Optional explicit tone override (otherwise derived from status) */
  tone?: AgendaTone;
}

/** Spanish labels for AgendaStatus (worker-facing copy). */
export const AGENDA_STATUS_LABEL_ES: Record<AgendaStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  needs_reacceptance: "Reconfirmar",
  rejected: "Rechazado",
  in_progress: "En curso",
  completed: "Completado",
  cancelled: "Cancelado",
  available: "Disponible",
  past: "Pasado",
};

export const AGENDA_STATUS_TO_TONE: Record<AgendaStatus, AgendaTone> = {
  pending: "amber",
  confirmed: "emerald",
  needs_reacceptance: "amber",
  rejected: "rose",
  in_progress: "sky",
  completed: "slate",
  cancelled: "slate",
  available: "emerald",
  past: "slate",
};

/** Tailwind class fragments per tone. Uses semantic tokens where possible. */
export const AGENDA_TONE_CLASSES: Record<
  AgendaTone,
  { dot: string; chip: string; ring: string; glow: string }
> = {
  primary: {
    dot: "bg-primary",
    chip: "bg-primary/10 text-primary",
    ring: "ring-primary/30",
    glow: "from-primary/[0.08] via-background to-primary/[0.04]",
  },
  sky: {
    dot: "bg-sky-500",
    chip: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    ring: "ring-sky-500/30",
    glow: "from-sky-500/[0.08] via-background to-primary/[0.04]",
  },
  emerald: {
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    ring: "ring-emerald-500/30",
    glow: "from-emerald-500/[0.07] via-background to-sky-500/[0.04]",
  },
  amber: {
    dot: "bg-amber-500",
    chip: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
    ring: "ring-amber-500/30",
    glow: "from-amber-500/[0.08] via-background to-primary/[0.03]",
  },
  rose: {
    dot: "bg-rose-500",
    chip: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
    ring: "ring-rose-500/30",
    glow: "from-rose-500/[0.07] via-background to-background",
  },
  slate: {
    dot: "bg-muted-foreground/40",
    chip: "bg-muted text-muted-foreground",
    ring: "ring-border",
    glow: "from-muted/30 via-background to-background",
  },
};

export function toneFor(status: AgendaStatus, override?: AgendaTone): AgendaTone {
  return override ?? AGENDA_STATUS_TO_TONE[status];
}
