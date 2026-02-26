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

export type ViewMode = "week" | "month" | "employee" | "client";
