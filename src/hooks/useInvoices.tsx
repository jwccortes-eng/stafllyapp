import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";

export type InvoiceStatus =
  | "draft"
  | "approved"
  | "issued"
  | "sent"
  | "viewed"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "voided";

export type InvoiceLineType =
  | "service"
  | "fee"
  | "discount"
  | "tax"
  | "adjustment"
  | "manual";

export interface Invoice {
  id: string;
  company_id: string;
  client_id: string;
  invoice_number: number;
  subject: string | null;
  status: InvoiceStatus;
  invoice_date: string;
  due_date: string | null;
  terms: string | null;
  currency: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  adjustment_total: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  notes: string | null;
  payment_instructions: string | null;
  footer_message: string | null;
  finalized_at: string | null;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  source_service_block_id: string | null;
  line_order: number;
  line_type: InvoiceLineType;
  description: string;
  qty: number;
  rate: number;
  amount: number;
  metadata_json: Record<string, any>;
  created_at: string;
  updated_at: string;
}

const KEY = "invoices";

export function useInvoices(filters?: {
  status?: InvoiceStatus | "all";
  client_id?: string | null;
}) {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompany();

  const list = useQuery({
    queryKey: [KEY, selectedCompanyId, filters],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<Invoice[]> => {
      let q = supabase
        .from("invoices")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("invoice_date", { ascending: false })
        .order("invoice_number", { ascending: false });
      if (filters?.status && filters.status !== "all") q = q.eq("status", filters.status);
      if (filters?.client_id) q = q.eq("client_id", filters.client_id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!selectedCompanyId) throw new Error("No company");
      // Restore associated blocks back to approved before deleting
      const { data: lines } = await supabase
        .from("invoice_lines")
        .select("source_service_block_id")
        .eq("invoice_id", id);
      const blockIds = (lines ?? [])
        .map((l) => l.source_service_block_id)
        .filter(Boolean) as string[];
      if (blockIds.length) {
        await supabase
          .from("billable_service_blocks")
          .update({ source_status: "approved", invoice_id: null })
          .in("id", blockIds)
          .eq("company_id", selectedCompanyId);
      }
      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", id)
        .eq("company_id", selectedCompanyId)
        .eq("status", "draft"); // safety: only draft deletable
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, selectedCompanyId] });
      qc.invalidateQueries({ queryKey: ["billable-service-blocks", selectedCompanyId] });
      toast.success("Borrador eliminado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return {
    invoices: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
    remove,
  };
}

/* ───────── Single invoice (detail) ───────── */
export function useInvoice(invoiceId: string | undefined) {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompany();

  const invoice = useQuery({
    queryKey: [KEY, "one", invoiceId],
    enabled: !!invoiceId && !!selectedCompanyId,
    queryFn: async (): Promise<Invoice | null> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId!)
        .eq("company_id", selectedCompanyId!)
        .maybeSingle();
      if (error) throw error;
      return (data as Invoice) ?? null;
    },
  });

  const lines = useQuery({
    queryKey: [KEY, "lines", invoiceId],
    enabled: !!invoiceId,
    queryFn: async (): Promise<InvoiceLine[]> => {
      const { data, error } = await supabase
        .from("invoice_lines")
        .select("*")
        .eq("invoice_id", invoiceId!)
        .order("line_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as InvoiceLine[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async (status: InvoiceStatus) => {
      if (!invoiceId || !selectedCompanyId) throw new Error("No invoice");
      const patch: any = { status };
      const now = new Date().toISOString();
      if (status === "issued" || status === "approved") patch.finalized_at = now;
      if (status === "sent") patch.sent_at = now;
      if (status === "paid") patch.paid_at = now;
      if (status === "voided") patch.voided_at = now;
      const { error } = await supabase
        .from("invoices")
        .update(patch)
        .eq("id", invoiceId)
        .eq("company_id", selectedCompanyId);
      if (error) throw error;
    },
    onSuccess: (_d, status) => {
      qc.invalidateQueries({ queryKey: [KEY, "one", invoiceId] });
      qc.invalidateQueries({ queryKey: [KEY, selectedCompanyId] });
      const labels: Partial<Record<InvoiceStatus, string>> = {
        issued: "Factura emitida",
        approved: "Factura aprobada",
        sent: "Marcada como enviada",
        voided: "Factura anulada",
        draft: "Reabierta como borrador",
      };
      toast.success(labels[status] ?? "Estado actualizado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return { invoice: invoice.data ?? null, lines: lines.data ?? [], isLoading: invoice.isLoading || lines.isLoading, setStatus };
}

/* ───────── Create draft from selected service blocks ───────── */
export interface CreateInvoiceInput {
  client_id: string;
  invoice_date: string;
  due_date?: string | null;
  subject?: string | null;
  terms?: string | null;
  notes?: string | null;
  payment_instructions?: string | null;
  currency?: string;
  block_ids: string[];
}

export function useCreateInvoiceFromBlocks() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompany();

  return useMutation({
    mutationFn: async (input: CreateInvoiceInput): Promise<{ id: string; invoice_number: number }> => {
      if (!selectedCompanyId) throw new Error("No company selected");
      if (!input.block_ids.length) throw new Error("Select at least one service block");

      // 1) Re-fetch blocks with strict guards: same company, same client, eligible status
      const { data: blocks, error: blocksErr } = await supabase
        .from("billable_service_blocks")
        .select("id, qty, rate, amount, billable_unit, service_date, service_type, description_rendered, currency, source_status, client_id, company_id, workers_count")
        .in("id", input.block_ids)
        .eq("company_id", selectedCompanyId)
        .eq("client_id", input.client_id);
      if (blocksErr) throw blocksErr;
      if (!blocks || blocks.length !== input.block_ids.length) {
        throw new Error("Some blocks are unavailable or belong to another client");
      }

      const ineligible = blocks.filter(
        (b) =>
          b.source_status === "discarded" ||
          b.source_status === "invoiced",
      );
      if (ineligible.length) {
        throw new Error(
          `${ineligible.length} bloque(s) no son facturables (discarded o ya facturados)`,
        );
      }

      // 2) Create invoice draft (totals will be computed below + updated)
      const subtotal = blocks.reduce((s, b) => s + Number(b.amount ?? 0), 0);
      const total = Math.round(subtotal * 100) / 100;

      const { data: { user } } = await supabase.auth.getUser();

      const { data: invRows, error: invErr } = await supabase
        .from("invoices")
        .insert({
          company_id: selectedCompanyId,
          client_id: input.client_id,
          invoice_date: input.invoice_date,
          due_date: input.due_date ?? null,
          subject: input.subject?.trim() || null,
          terms: input.terms?.trim() || null,
          notes: input.notes?.trim() || null,
          payment_instructions: input.payment_instructions?.trim() || null,
          currency: (input.currency || blocks[0]?.currency || "USD").toUpperCase(),
          subtotal,
          total,
          balance_due: total,
          status: "draft",
          created_by: user?.id ?? null,
        } as any)
        .select("id, invoice_number")
        .single();
      if (invErr) throw invErr;

      const invoiceId = (invRows as any).id as string;
      const invoiceNumber = (invRows as any).invoice_number as number;

      // 3) Insert lines
      const lines = blocks.map((b, idx) => {
        const desc =
          b.description_rendered ??
          `${b.service_type ?? "Service"} — ${b.service_date}${
            b.workers_count > 1 ? ` (${b.workers_count} workers)` : ""
          }`;
        return {
          invoice_id: invoiceId,
          source_service_block_id: b.id,
          line_order: idx + 1,
          line_type: "service" as const,
          description: desc,
          qty: Number(b.qty),
          rate: Number(b.rate),
          amount: Number(b.amount),
          metadata_json: {
            billable_unit: b.billable_unit,
            service_date: b.service_date,
            workers_count: b.workers_count,
          },
        };
      });

      const { error: linesErr } = await supabase.from("invoice_lines").insert(lines as any);
      if (linesErr) {
        // rollback invoice
        await supabase.from("invoices").delete().eq("id", invoiceId);
        throw linesErr;
      }

      // 4) Lock blocks: status=invoiced, invoice_id=invoiceId
      const { error: lockErr } = await supabase
        .from("billable_service_blocks")
        .update({ source_status: "invoiced", invoice_id: invoiceId })
        .in("id", input.block_ids)
        .eq("company_id", selectedCompanyId);
      if (lockErr) {
        // best-effort rollback
        await supabase.from("invoice_lines").delete().eq("invoice_id", invoiceId);
        await supabase.from("invoices").delete().eq("id", invoiceId);
        throw lockErr;
      }

      return { id: invoiceId, invoice_number: invoiceNumber };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, selectedCompanyId] });
      qc.invalidateQueries({ queryKey: ["billable-service-blocks", selectedCompanyId] });
      toast.success("Factura creada en borrador");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al crear factura"),
  });
}
