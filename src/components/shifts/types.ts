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
  shift_code?: string | null;
}

export function formatShiftCode(code: string | null | undefined): string {
  if (!code) return "—";
  return code.padStart(4, "0");
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

// Pastel harmony color palette for shift cards
export const CLIENT_COLORS = [
  { bg: "bg-sky-100/70 dark:bg-sky-900/20", border: "border-l-sky-400", text: "text-sky-600 dark:text-sky-300", dot: "bg-sky-400" },
  { bg: "bg-emerald-100/70 dark:bg-emerald-900/20", border: "border-l-emerald-400", text: "text-emerald-600 dark:text-emerald-300", dot: "bg-emerald-400" },
  { bg: "bg-violet-100/70 dark:bg-violet-900/20", border: "border-l-violet-400", text: "text-violet-600 dark:text-violet-300", dot: "bg-violet-400" },
  { bg: "bg-amber-100/70 dark:bg-amber-900/20", border: "border-l-amber-400", text: "text-amber-600 dark:text-amber-300", dot: "bg-amber-400" },
  { bg: "bg-rose-100/70 dark:bg-rose-900/20", border: "border-l-rose-400", text: "text-rose-600 dark:text-rose-300", dot: "bg-rose-400" },
  { bg: "bg-teal-100/70 dark:bg-teal-900/20", border: "border-l-teal-400", text: "text-teal-600 dark:text-teal-300", dot: "bg-teal-400" },
  { bg: "bg-orange-100/70 dark:bg-orange-900/20", border: "border-l-orange-400", text: "text-orange-600 dark:text-orange-300", dot: "bg-orange-400" },
  { bg: "bg-indigo-100/70 dark:bg-indigo-900/20", border: "border-l-indigo-400", text: "text-indigo-600 dark:text-indigo-300", dot: "bg-indigo-400" },
] as const;

export function getClientColor(clientId: string | null, clientIds: string[]) {
  if (!clientId) return { bg: "bg-slate-100/60 dark:bg-slate-800/30", border: "border-l-slate-300 dark:border-l-slate-600", text: "text-slate-500 dark:text-slate-400", dot: "bg-slate-300 dark:bg-slate-600" };
  const idx = clientIds.indexOf(clientId);
  return CLIENT_COLORS[idx >= 0 ? idx % CLIENT_COLORS.length : 0];
}
