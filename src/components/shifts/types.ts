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
  { bg: "bg-sky-50/80 dark:bg-sky-900/15", border: "border-l-sky-300", text: "text-sky-500 dark:text-sky-300", dot: "bg-sky-300" },
  { bg: "bg-emerald-50/80 dark:bg-emerald-900/15", border: "border-l-emerald-300", text: "text-emerald-500 dark:text-emerald-300", dot: "bg-emerald-300" },
  { bg: "bg-violet-50/80 dark:bg-violet-900/15", border: "border-l-violet-300", text: "text-violet-500 dark:text-violet-300", dot: "bg-violet-300" },
  { bg: "bg-amber-50/80 dark:bg-amber-900/15", border: "border-l-amber-300", text: "text-amber-500 dark:text-amber-300", dot: "bg-amber-300" },
  { bg: "bg-rose-50/80 dark:bg-rose-900/15", border: "border-l-rose-300", text: "text-rose-500 dark:text-rose-300", dot: "bg-rose-300" },
  { bg: "bg-teal-50/80 dark:bg-teal-900/15", border: "border-l-teal-300", text: "text-teal-500 dark:text-teal-300", dot: "bg-teal-300" },
  { bg: "bg-orange-50/80 dark:bg-orange-900/15", border: "border-l-orange-300", text: "text-orange-500 dark:text-orange-300", dot: "bg-orange-300" },
  { bg: "bg-indigo-50/80 dark:bg-indigo-900/15", border: "border-l-indigo-300", text: "text-indigo-500 dark:text-indigo-300", dot: "bg-indigo-300" },
] as const;

export function getClientColor(clientId: string | null, clientIds: string[]) {
  if (!clientId) return { bg: "bg-slate-100/60 dark:bg-slate-800/30", border: "border-l-slate-300 dark:border-l-slate-600", text: "text-slate-500 dark:text-slate-400", dot: "bg-slate-300 dark:bg-slate-600" };
  const idx = clientIds.indexOf(clientId);
  return CLIENT_COLORS[idx >= 0 ? idx % CLIENT_COLORS.length : 0];
}
