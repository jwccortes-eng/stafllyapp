import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";

export type ServiceBlockStatus = "pending" | "approved" | "adjusted" | "discarded" | "invoiced";
export type BillableUnit = "hour" | "day" | "flat";

export interface BillableServiceBlock {
  id: string;
  company_id: string;
  client_id: string;
  client_location_id: string | null;
  shift_group_id: string | null;
  service_date: string;
  service_type: string | null;
  billable_unit: BillableUnit;
  workers_count: number;
  qty: number;
  rate: number;
  amount: number;
  currency: string;
  description_rendered: string | null;
  source_type: "manual" | "approval" | "attendance";
  source_status: ServiceBlockStatus;
  invoice_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SkippedReasonRow {
  shift_id: string;
  service_date: string;
  reason: string;
  detail?: string;
}

export interface GenerationResult {
  generated: number;
  updated: number;
  skipped: SkippedReasonRow[];
  total_shifts_scanned: number;
}

const KEY = "billable-service-blocks";

export function useBillableServiceBlocks(filters: {
  status?: ServiceBlockStatus | "all";
  date_from?: string;
  date_to?: string;
  client_id?: string | null;
}) {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompany();

  const list = useQuery({
    queryKey: [KEY, selectedCompanyId, filters],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<BillableServiceBlock[]> => {
      let q = supabase
        .from("billable_service_blocks")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("service_date", { ascending: false });
      if (filters.status && filters.status !== "all") q = q.eq("source_status", filters.status);
      if (filters.date_from) q = q.gte("service_date", filters.date_from);
      if (filters.date_to) q = q.lte("service_date", filters.date_to);
      if (filters.client_id) q = q.eq("client_id", filters.client_id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as BillableServiceBlock[];
    },
  });

  const generate = useMutation({
    mutationFn: async (input: {
      date_from: string;
      date_to: string;
      client_id?: string | null;
      default_billable_unit?: BillableUnit;
    }): Promise<GenerationResult> => {
      if (!selectedCompanyId) throw new Error("No company selected");
      const { data, error } = await supabase.functions.invoke(
        "billing-generate-service-blocks",
        {
          body: { company_id: selectedCompanyId, ...input },
        },
      );
      if (error) {
        // Surface the real edge-function error body (otherwise users only see "non-2xx status code")
        let detail = error.message ?? "Unknown error";
        try {
          const ctx: any = (error as any).context;
          if (ctx?.body) {
            const parsed = typeof ctx.body === "string" ? JSON.parse(ctx.body) : ctx.body;
            if (parsed?.error) detail = parsed.error;
          } else if ((error as any).response) {
            const txt = await (error as any).response.text?.();
            if (txt) {
              try { detail = JSON.parse(txt).error ?? txt; } catch { detail = txt; }
            }
          }
        } catch { /* keep generic message */ }
        // Map known cases to friendlier copy
        if (/tenant_invoicing module not enabled/i.test(detail)) {
          detail = "El módulo de facturación (tenant_invoicing) no está activo para esta empresa. Actívalo desde Admin → Modules.";
        } else if (/Admin privileges required/i.test(detail)) {
          detail = "Necesitas permisos de admin/owner para generar bloques de servicio.";
        } else if (/Not a member of company/i.test(detail)) {
          detail = "No perteneces a esta empresa.";
        }
        throw new Error(detail);
      }
      return data as GenerationResult;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: [KEY, selectedCompanyId] });
      toast.success(
        `Generación: ${res.generated} nuevos · ${res.updated} actualizados · ${res.skipped.length} omitidos`,
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al generar"),
  });

  const update = useMutation({
    mutationFn: async (args: {
      id: string;
      patch: Partial<
        Pick<
          BillableServiceBlock,
          | "qty"
          | "rate"
          | "billable_unit"
          | "service_type"
          | "description_rendered"
          | "client_location_id"
          | "notes"
          | "workers_count"
        >
      >;
    }) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      const patch: any = { ...args.patch };
      // Recalculate amount if qty/rate changes
      if (patch.qty != null || patch.rate != null) {
        const { data: current } = await supabase
          .from("billable_service_blocks")
          .select("qty, rate")
          .eq("id", args.id)
          .single();
        const qty = patch.qty ?? current?.qty ?? 0;
        const rate = patch.rate ?? current?.rate ?? 0;
        patch.amount = Math.round(Number(qty) * Number(rate) * 100) / 100;
      }
      const { error } = await supabase
        .from("billable_service_blocks")
        .update(patch)
        .eq("id", args.id)
        .eq("company_id", selectedCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, selectedCompanyId] });
      toast.success("Bloque actualizado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const setStatus = useMutation({
    mutationFn: async (args: { id: string; status: ServiceBlockStatus }) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      const patch: any = { source_status: args.status };
      if (args.status === "approved") {
        patch.approved_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("billable_service_blocks")
        .update(patch)
        .eq("id", args.id)
        .eq("company_id", selectedCompanyId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [KEY, selectedCompanyId] });
      const labels: Record<ServiceBlockStatus, string> = {
        pending: "marcado como pendiente",
        approved: "aprobado",
        adjusted: "ajustado",
        discarded: "descartado",
        invoiced: "facturado",
      };
      toast.success(`Bloque ${labels[vars.status]}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return {
    blocks: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
    generate,
    update,
    setStatus,
  };
}
