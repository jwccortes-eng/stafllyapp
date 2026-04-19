export type ServiceRequestStatus =
  | "new"
  | "reviewing"
  | "approved_for_scheduling"
  | "converted_to_shift"
  | "in_progress"
  | "pending_closure_review"
  | "ready_for_billing"
  | "invoiced"
  | "cancelled";

export type ServiceRequestChannel = "whatsapp" | "phone" | "manual" | "client_link" | "email";
export type ServiceRequestGenderReq = "none" | "men_only" | "women_only";
export type ServiceRequestRoleType =
  | "waiter"
  | "captain"
  | "kitchen_staff"
  | "cleaner"
  | "bartender"
  | "other";
export type ServiceRequestBillingUnit = "hourly" | "daily" | "flat";

export interface ServiceRequest {
  id: string;
  company_id: string;
  client_id: string | null;
  client_name_snapshot: string | null;
  request_code: string;
  request_date: string;
  service_date: string;
  start_time: string | null;
  end_time: string | null;
  location_name: string | null;
  service_address: string | null;
  onsite_contact_name: string | null;
  onsite_contact_phone: string | null;
  request_channel: ServiceRequestChannel;
  gender_requirement: ServiceRequestGenderReq;
  notes: string | null;
  status: ServiceRequestStatus;
  created_by: string | null;
  updated_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceRequestItem {
  id: string;
  company_id: string;
  service_request_id: string;
  role_type: ServiceRequestRoleType;
  role_label: string | null;
  quantity_requested: number;
  billing_unit: ServiceRequestBillingUnit | null;
  requested_bill_rate: number | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceRequestShiftLink {
  id: string;
  company_id: string;
  service_request_id: string;
  shift_id: string;
  service_request_item_id: string | null;
  linked_by: string | null;
  created_at: string;
}

export const STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  approved_for_scheduling: "Approved",
  converted_to_shift: "Scheduled",
  in_progress: "In Progress",
  pending_closure_review: "Closure Review",
  ready_for_billing: "Ready for Billing",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

export const STATUS_TONE: Record<ServiceRequestStatus, string> = {
  new: "bg-blue-100 text-blue-800 border-blue-200",
  reviewing: "bg-amber-100 text-amber-800 border-amber-200",
  approved_for_scheduling: "bg-violet-100 text-violet-800 border-violet-200",
  converted_to_shift: "bg-indigo-100 text-indigo-800 border-indigo-200",
  in_progress: "bg-cyan-100 text-cyan-800 border-cyan-200",
  pending_closure_review: "bg-orange-100 text-orange-800 border-orange-200",
  ready_for_billing: "bg-emerald-100 text-emerald-800 border-emerald-200",
  invoiced: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export const ROLE_LABELS: Record<ServiceRequestRoleType, string> = {
  waiter: "Waiter",
  captain: "Captain",
  kitchen_staff: "Kitchen",
  cleaner: "Cleaner",
  bartender: "Bartender",
  other: "Other",
};

export const CHANNEL_LABELS: Record<ServiceRequestChannel, string> = {
  whatsapp: "WhatsApp",
  phone: "Phone",
  manual: "Manual",
  client_link: "Client Link",
  email: "Email",
};

export const GENDER_LABELS: Record<ServiceRequestGenderReq, string> = {
  none: "Any",
  men_only: "Men only",
  women_only: "Women only",
};

export interface FulfillmentRow {
  role_type: ServiceRequestRoleType;
  role_label: string;
  requested: number;
  scheduled: number;
  accepted: number;
  worked: number;
  payable: number;
}

export interface RequestWithSummary extends ServiceRequest {
  items_count: number;
  total_requested: number;
  linked_shifts_count: number;
}
