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

      const { data: detail, error: detErr } = await supabase
        .from("service_requests" as any)
        .select("*")
        .eq("id", input.request_id)
        .single();
      if (detErr) throw detErr;
      const req = detail as any;

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
          notes: req.notes ?? null,
          meeting_point: req.service_address ?? null,
          pay_type: (input.pay_type ?? "hourly") as any,
          created_by: user?.id ?? null,
        } as any)
        .select("id")
        .single();
      if (sErr) throw sErr;

      // Link
      const { error: linkErr } = await supabase.from("service_request_shift_links" as any).insert({
        company_id: selectedCompanyId,
        service_request_id: input.request_id,
        shift_id: (shift as any).id,
        linked_by: user?.id ?? null,
      } as any);
      if (linkErr) throw linkErr;

      // Move status forward
      await supabase
        .from("service_requests" as any)
        .update({ status: "converted_to_shift" as any, updated_by: user?.id ?? null } as any)
        .eq("id", input.request_id);

      return (shift as any).id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [REQUESTS_KEY] });
      toast.success("Shift created and linked");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not convert to shift"),
  });
}

/** Fulfillment comparison: requested vs scheduled vs accepted vs worked vs payable per role */
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
      const shiftIds = ((links ?? []) as any[]).map((l: any) => l.shift_id);

      // Aggregate scheduled/accepted/worked across all linked shifts
      let scheduledTotal = 0;
      let acceptedTotal = 0;
      let workedTotal = 0;
      let payableTotal = 0;

      if (shiftIds.length > 0) {
        const [{ data: assigns }, { data: entries }] = await Promise.all([
          supabase
            .from("shift_assignments")
            .select("employee_id, status, response_status")
            .in("shift_id", shiftIds)
            .neq("status", "removed"),
          supabase
            .from("time_entries")
            .select("employee_id, clock_in, clock_out, status")
            .in("shift_id", shiftIds)
            .neq("status", "rejected"),
        ]);

        const all = (assigns ?? []) as any[];
        scheduledTotal = all.filter(a => a.status !== "rejected").length;
        acceptedTotal = all.filter(a => a.response_status === "accepted").length;

        const validEntries = ((entries ?? []) as any[]).filter(e => e.clock_in && e.clock_out);
        workedTotal = new Set(validEntries.map(e => e.employee_id)).size;
        payableTotal = ((entries ?? []) as any[]).filter(e => e.status === "approved" && e.clock_out).length;
        // dedupe payable by employee
        payableTotal = new Set(
          ((entries ?? []) as any[])
            .filter(e => e.status === "approved" && e.clock_out)
            .map(e => e.employee_id)
        ).size;
      }

      // Distribute totals proportionally across role lines (operational view by role).
      // For MVP we group all roles into a single comparison; per-role breakdown
      // requires per-shift role mapping, which we don't have yet. We still expose
      // each requested role line so admins can see the asks.
      const totalRequested = itemList.reduce((s, it) => s + (it.quantity_requested ?? 0), 0) || 1;

      return itemList.map(it => {
        const share = (it.quantity_requested ?? 0) / totalRequested;
        return {
          role_type: it.role_type,
          role_label: it.role_label || ROLE_LABELS[it.role_type],
          requested: it.quantity_requested,
          scheduled: Math.round(scheduledTotal * share),
          accepted: Math.round(acceptedTotal * share),
          worked: Math.round(workedTotal * share),
          payable: Math.round(payableTotal * share),
        };
      });
    },
    enabled: !!requestId && !!selectedCompanyId,
  });
}
