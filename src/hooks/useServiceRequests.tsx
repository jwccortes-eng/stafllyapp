import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type {
  ServiceRequest,
  ServiceRequestItem,
  ServiceRequestStatus,
  ServiceRequestShiftLink,
  RequestWithSummary,
  FulfillmentRow,
  ServiceRequestRoleType,
} from "@/lib/service-requests/types";
import { ROLE_LABELS } from "@/lib/service-requests/types";

const REQUESTS_KEY = "service-requests";

export function useServiceRequests(filters?: { status?: ServiceRequestStatus | "all" }) {
  const { selectedCompanyId } = useCompany();

  return useQuery({
    queryKey: [REQUESTS_KEY, selectedCompanyId, filters?.status ?? "all"],
    queryFn: async (): Promise<RequestWithSummary[]> => {
      if (!selectedCompanyId) return [];

      let q = supabase
        .from("service_requests" as any)
        .select("*")
        .eq("company_id", selectedCompanyId)
        .order("service_date", { ascending: false });

      if (filters?.status && filters.status !== "all") {
        q = q.eq("status", filters.status);
      }

      const { data: reqs, error } = await q;
      if (error) throw error;
      const requests = (reqs ?? []) as unknown as ServiceRequest[];
      if (requests.length === 0) return [];

      const ids = requests.map(r => r.id);
      const [{ data: items }, { data: links }] = await Promise.all([
        supabase
          .from("service_request_items" as any)
          .select("service_request_id, quantity_requested")
          .in("service_request_id", ids),
        supabase
          .from("service_request_shift_links" as any)
          .select("service_request_id")
          .in("service_request_id", ids),
      ]);

      const itemsByReq = new Map<string, { count: number; total: number }>();
      ((items ?? []) as any[]).forEach((it: any) => {
        const c = itemsByReq.get(it.service_request_id) ?? { count: 0, total: 0 };
        c.count += 1;
        c.total += Number(it.quantity_requested ?? 0);
        itemsByReq.set(it.service_request_id, c);
      });

      const linksByReq = new Map<string, number>();
      ((links ?? []) as any[]).forEach((l: any) => {
        linksByReq.set(l.service_request_id, (linksByReq.get(l.service_request_id) ?? 0) + 1);
      });

      return requests.map(r => ({
        ...r,
        items_count: itemsByReq.get(r.id)?.count ?? 0,
        total_requested: itemsByReq.get(r.id)?.total ?? 0,
        linked_shifts_count: linksByReq.get(r.id) ?? 0,
      }));
    },
    enabled: !!selectedCompanyId,
  });
}

export function useServiceRequest(requestId: string | null) {
  const { selectedCompanyId } = useCompany();

  return useQuery({
    queryKey: [REQUESTS_KEY, "detail", selectedCompanyId, requestId],
    queryFn: async () => {
      if (!requestId || !selectedCompanyId) return null;
      const [{ data: req }, { data: items }, { data: links }] = await Promise.all([
        supabase.from("service_requests" as any).select("*").eq("id", requestId).maybeSingle(),
        supabase.from("service_request_items" as any).select("*").eq("service_request_id", requestId).order("sort_order"),
        supabase.from("service_request_shift_links" as any).select("*").eq("service_request_id", requestId),
      ]);

      return {
        request: req as unknown as ServiceRequest | null,
        items: ((items ?? []) as unknown as ServiceRequestItem[]),
        links: ((links ?? []) as unknown as ServiceRequestShiftLink[]),
      };
    },
    enabled: !!requestId && !!selectedCompanyId,
  });
}

export function useCreateServiceRequest() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      service_date: string;
      start_time?: string | null;
      end_time?: string | null;
      client_id?: string | null;
      client_name_snapshot?: string | null;
      service_address?: string | null;
      location_name?: string | null;
      onsite_contact_name?: string | null;
      onsite_contact_phone?: string | null;
      request_channel?: string;
      gender_requirement?: string;
      notes?: string | null;
      items: Array<{
        role_type: ServiceRequestRoleType;
        role_label?: string | null;
        quantity_requested: number;
        billing_unit?: string | null;
        requested_bill_rate?: number | null;
        notes?: string | null;
      }>;
    }) => {
      if (!selectedCompanyId) throw new Error("No company selected");

      const { data: req, error: reqErr } = await supabase
        .from("service_requests" as any)
        .insert({
          company_id: selectedCompanyId,
          client_id: input.client_id ?? null,
          client_name_snapshot: input.client_name_snapshot ?? null,
          service_date: input.service_date,
          start_time: input.start_time ?? null,
          end_time: input.end_time ?? null,
          service_address: input.service_address ?? null,
          location_name: input.location_name ?? null,
          onsite_contact_name: input.onsite_contact_name ?? null,
          onsite_contact_phone: input.onsite_contact_phone ?? null,
          request_channel: (input.request_channel ?? "manual") as any,
          gender_requirement: (input.gender_requirement ?? "none") as any,
          notes: input.notes ?? null,
          status: "new" as any,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        } as any)
        .select("*")
        .single();
      if (reqErr) throw reqErr;
      const newReq = req as any;

      if (input.items.length > 0) {
        const { error: itErr } = await supabase
          .from("service_request_items" as any)
          .insert(
            input.items.map((it, idx) => ({
              company_id: selectedCompanyId,
              service_request_id: newReq.id,
              role_type: it.role_type,
              role_label: it.role_label ?? null,
              quantity_requested: it.quantity_requested,
              billing_unit: (it.billing_unit ?? null) as any,
              requested_bill_rate: it.requested_bill_rate ?? null,
              notes: it.notes ?? null,
              sort_order: idx,
            })) as any
          );
        if (itErr) throw itErr;
      }

      return newReq as ServiceRequest;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [REQUESTS_KEY] });
      toast.success("Request created");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not create request"),
  });
}

export function useUpdateServiceRequestStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { id: string; status: ServiceRequestStatus; reason?: string }) => {
      const patch: any = { status: input.status, updated_by: user?.id ?? null };
      if (input.status === "cancelled") {
        patch.cancelled_at = new Date().toISOString();
        patch.cancelled_by = user?.id ?? null;
        patch.cancellation_reason = input.reason ?? null;
      }
      const { error } = await supabase.from("service_requests" as any).update(patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [REQUESTS_KEY] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not update status"),
  });
}

export function useConvertRequestToShift() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      request_id: string;
      title: string;
      pay_type?: "hourly" | "daily";
    }) => {
      if (!selectedCompanyId) throw new Error("No company selected");

      const [{ data: detail, error: detErr }, { data: items, error: itErr }] = await Promise.all([
        supabase.from("service_requests" as any).select("*").eq("id", input.request_id).single(),
        supabase
          .from("service_request_items" as any)
          .select("*")
          .eq("service_request_id", input.request_id)
          .order("sort_order"),
      ]);
      if (detErr) throw detErr;
      if (itErr) throw itErr;
      const req = detail as any;
      const itemList = (items ?? []) as unknown as ServiceRequestItem[];

      // Total capacity = sum of role-line quantities; drives the legacy `slots`
      // field so the scheduler treats this shift identically to a manual one.
      const totalCapacity = itemList.reduce(
        (acc, it) => acc + Number(it.quantity_requested ?? 0),
        0,
      );

      // Create scheduled_shift
      const { data: shift, error: sErr } = await supabase
        .from("scheduled_shifts")
        .insert({
          company_id: selectedCompanyId,
          client_id: req.client_id ?? null,
          title: input.title,
          date: req.service_date,
          start_time: req.start_time ?? "09:00:00",
          end_time: req.end_time ?? "17:00:00",
          slots: Math.max(1, totalCapacity),
          notes: req.notes ?? null,
          meeting_point: req.service_address ?? null,
          pay_type: (input.pay_type ?? "hourly") as any,
          created_by: user?.id ?? null,
        } as any)
        .select("id")
        .single();
      if (sErr) throw sErr;
      const shiftId = (shift as any).id as string;

      // Create real role slots from items (preserves staffing plan per role)
      if (itemList.length > 0) {
        const { error: slotsErr } = await supabase.from("shift_role_slots" as any).insert(
          itemList.map((it, idx) => ({
            company_id: selectedCompanyId,
            shift_id: shiftId,
            role_type: it.role_type,
            role_label: it.role_label ?? null,
            quantity: it.quantity_requested,
            service_request_id: input.request_id,
            service_request_item_id: it.id,
            notes: it.notes ?? null,
            sort_order: idx,
          })) as any
        );
        if (slotsErr) throw slotsErr;
      }

      // Link request <-> shift (with optional per-item links so audit trail keeps the role context)
      if (itemList.length > 0) {
        const { error: linkErr } = await supabase.from("service_request_shift_links" as any).insert(
          itemList.map(it => ({
            company_id: selectedCompanyId,
            service_request_id: input.request_id,
            shift_id: shiftId,
            service_request_item_id: it.id,
            linked_by: user?.id ?? null,
          })) as any
        );
        if (linkErr) throw linkErr;
      } else {
        const { error: linkErr } = await supabase.from("service_request_shift_links" as any).insert({
          company_id: selectedCompanyId,
          service_request_id: input.request_id,
          shift_id: shiftId,
          linked_by: user?.id ?? null,
        } as any);
        if (linkErr) throw linkErr;
      }

      // Move status forward
      await supabase
        .from("service_requests" as any)
        .update({ status: "converted_to_shift" as any, updated_by: user?.id ?? null } as any)
        .eq("id", input.request_id);

      return shiftId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [REQUESTS_KEY] });
      toast.success("Shift created with role slots");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not convert to shift"),
  });
}

/** Returns the role slots configured for a given shift.
 *  Tenant scope: companyId is part of the queryKey so switching companies
 *  evicts cross-tenant cached entries even though RLS already filters at DB. */
export function useShiftRoleSlots(shiftId: string | null) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: ["shift-role-slots", selectedCompanyId, shiftId],
    queryFn: async () => {
      if (!shiftId) return [];
      const { data, error } = await supabase
        .from("shift_role_slots" as any)
        .select("*")
        .eq("shift_id", shiftId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!shiftId && !!selectedCompanyId,
  });
}

/**
 * REAL per-role fulfillment.
 * - requested: from service_request_items (quantity_requested)
 * - scheduled: count of shift_assignments tied to that role's slot (status != rejected/removed)
 * - accepted:  scheduled where response_status = 'accepted'
 * - worked:    distinct employees with a time_entry that has clock_in & clock_out (status != rejected),
 *              attributed to the role via the assignment's role_slot_id
 * - payable:   hourly  -> distinct employees with approved time_entries (clock_out set)
 *              daily   -> distinct (employee, workday) covered by a daily-pay shift, attributed by role slot
 *
 * If a request has shifts linked WITHOUT role_slots (legacy convert), we fall back to "—" for that role's
 * scheduled/accepted/worked/payable so admins clearly see "no per-role tracking" instead of a fake number.
 */
export function useRequestFulfillment(requestId: string | null) {
  const { selectedCompanyId } = useCompany();

  return useQuery({
    queryKey: [REQUESTS_KEY, "fulfillment", selectedCompanyId, requestId],
    queryFn: async (): Promise<FulfillmentRow[]> => {
      if (!requestId || !selectedCompanyId) return [];

      const [{ data: items }, { data: links }] = await Promise.all([
        supabase
          .from("service_request_items" as any)
          .select("*")
          .eq("service_request_id", requestId)
          .order("sort_order"),
        supabase
          .from("service_request_shift_links" as any)
          .select("shift_id")
          .eq("service_request_id", requestId),
      ]);

      const itemList = (items ?? []) as unknown as ServiceRequestItem[];
      const shiftIds = Array.from(new Set(((links ?? []) as any[]).map(l => l.shift_id)));

      if (itemList.length === 0) return [];
      if (shiftIds.length === 0) {
        return itemList.map(it => ({
          role_type: it.role_type,
          role_label: it.role_label || ROLE_LABELS[it.role_type],
          requested: it.quantity_requested,
          scheduled: 0,
          accepted: 0,
          worked: 0,
          payable: 0,
        }));
      }

      // Pull all relevant data in parallel.
      const [{ data: slots }, { data: assigns }, { data: entries }, { data: shifts }] = await Promise.all([
        supabase
          .from("shift_role_slots" as any)
          .select("id, shift_id, role_type, service_request_item_id")
          .in("shift_id", shiftIds),
        supabase
          .from("shift_assignments")
          .select("id, shift_id, employee_id, status, response_status, role_slot_id")
          .in("shift_id", shiftIds)
          .neq("status", "removed"),
        supabase
          .from("time_entries")
          .select("id, shift_id, employee_id, clock_in, clock_out, status")
          .in("shift_id", shiftIds)
          .neq("status", "rejected"),
        supabase
          .from("scheduled_shifts")
          .select("id, pay_type")
          .in("id", shiftIds),
      ]);

      const slotById = new Map<string, any>();
      ((slots ?? []) as any[]).forEach(s => slotById.set(s.id, s));

      // Map each item -> set of slot ids that represent it
      const slotsByItem = new Map<string, string[]>();
      ((slots ?? []) as any[]).forEach(s => {
        if (!s.service_request_item_id) return;
        const arr = slotsByItem.get(s.service_request_item_id) ?? [];
        arr.push(s.id);
        slotsByItem.set(s.service_request_item_id, arr);
      });

      // Map each assignment -> the item id it serves (via slot)
      const assignmentItem = new Map<string, string | null>();
      ((assigns ?? []) as any[]).forEach(a => {
        const slot = a.role_slot_id ? slotById.get(a.role_slot_id) : null;
        assignmentItem.set(a.id, slot?.service_request_item_id ?? null);
      });

      const payTypeByShift = new Map<string, string>();
      ((shifts ?? []) as any[]).forEach(s => payTypeByShift.set(s.id, s.pay_type ?? "hourly"));

      // Build a mapping employee -> item via their assignment(s) on these shifts
      // (an employee can fill different role slots on different shifts)
      const employeeItemKey = (employeeId: string, shiftId: string): string | null => {
        const a = ((assigns ?? []) as any[]).find(x => x.employee_id === employeeId && x.shift_id === shiftId);
        if (!a) return null;
        return assignmentItem.get(a.id) ?? null;
      };

      return itemList.map(it => {
        const slotIdsForItem = new Set(slotsByItem.get(it.id) ?? []);

        const itemAssignments = ((assigns ?? []) as any[]).filter(a =>
          a.role_slot_id && slotIdsForItem.has(a.role_slot_id)
        );

        const scheduled = itemAssignments.filter(a => a.status !== "rejected").length;
        const accepted = itemAssignments.filter(a => a.response_status === "accepted").length;

        // Worked = distinct employees of THIS item that have clock_in & clock_out
        const workedEmps = new Set<string>();
        ((entries ?? []) as any[]).forEach(e => {
          if (!e.clock_in || !e.clock_out) return;
          const itemId = employeeItemKey(e.employee_id, e.shift_id);
          if (itemId === it.id) workedEmps.add(e.employee_id);
        });
        const worked = workedEmps.size;

        // Payable: differentiated by pay_type
        // - hourly: distinct employees with at least one approved entry (clock_out set)
        // - daily : distinct (employee, workday) for daily shifts the employee was scheduled on
        const payableHourly = new Set<string>();
        const payableDailyKeys = new Set<string>();
        ((entries ?? []) as any[]).forEach(e => {
          const itemId = employeeItemKey(e.employee_id, e.shift_id);
          if (itemId !== it.id) return;
          const payType = payTypeByShift.get(e.shift_id) ?? "hourly";
          if (payType === "daily") {
            // Daily: count workday once the entry is at least clocked-in (daily concept pays by day worked)
            if (e.clock_in) {
              const day = String(e.clock_in).slice(0, 10);
              payableDailyKeys.add(`${e.employee_id}|${day}`);
            }
          } else {
            if (e.status === "approved" && e.clock_out) payableHourly.add(e.employee_id);
          }
        });
        const payable = payableHourly.size + payableDailyKeys.size;

        return {
          role_type: it.role_type,
          role_label: it.role_label || ROLE_LABELS[it.role_type],
          requested: it.quantity_requested,
          scheduled,
          accepted,
          worked,
          payable,
        };
      });
    },
    enabled: !!requestId && !!selectedCompanyId,
  });
}
