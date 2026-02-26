export interface Shift {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  slots: number | null;
  client_id: string | null;
  location_id: string | null;
  notes: string | null;
  claimable: boolean;
}

export interface Assignment {
  id: string;
  shift_id: string;
  employee_id: string;
  status: string;
}

export interface SelectOption { id: string; name: string; }
export interface Employee { id: string; first_name: string; last_name: string; }

export type ViewMode = "day" | "week" | "month" | "employee" | "client";

// Stable client color palette for Connecteam-style cards
export const CLIENT_COLORS = [
  { bg: "bg-blue-500/15", border: "border-l-blue-500", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  { bg: "bg-emerald-500/15", border: "border-l-emerald-500", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  { bg: "bg-violet-500/15", border: "border-l-violet-500", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  { bg: "bg-amber-500/15", border: "border-l-amber-500", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  { bg: "bg-rose-500/15", border: "border-l-rose-500", text: "text-rose-700 dark:text-rose-300", dot: "bg-rose-500" },
  { bg: "bg-cyan-500/15", border: "border-l-cyan-500", text: "text-cyan-700 dark:text-cyan-300", dot: "bg-cyan-500" },
  { bg: "bg-orange-500/15", border: "border-l-orange-500", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  { bg: "bg-pink-500/15", border: "border-l-pink-500", text: "text-pink-700 dark:text-pink-300", dot: "bg-pink-500" },
] as const;

export function getClientColor(clientId: string | null, clientIds: string[]) {
  if (!clientId) return { bg: "bg-muted/40", border: "border-l-muted-foreground/30", text: "text-muted-foreground", dot: "bg-muted-foreground/40" };
  const idx = clientIds.indexOf(clientId);
  return CLIENT_COLORS[idx >= 0 ? idx % CLIENT_COLORS.length : 0];
}
