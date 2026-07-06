/**
 * DocumentHistoryPanel — Fase 2A.1 read-only audit trail for a single
 * employee_documents row. Reads from `document_review_events` (populated by
 * the AFTER UPDATE trigger). Never writes, never edits, never deletes.
 * Admin-only rendering; callers must gate with `canReview`.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, RotateCcw, CalendarClock, Loader2, History } from "lucide-react";

type EventRow = {
  id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  reviewed_by: string | null;
  created_at: string;
};

interface Props {
  /** employee_documents.id — omit to hide the panel. */
  documentId?: string | null;
  canReview: boolean;
}

const ACTION_META: Record<string, { label: string; Icon: typeof CheckCircle2; className: string }> = {
  approve:             { label: "Aprobado",            Icon: CheckCircle2,  className: "text-emerald-700" },
  reject:              { label: "Rechazado",           Icon: XCircle,       className: "text-rose-700" },
  reopen:              { label: "Reabierto",           Icon: RotateCcw,     className: "text-amber-700" },
  expiration_updated:  { label: "Vencimiento actualizado", Icon: CalendarClock, className: "text-sky-700" },
};

export default function DocumentHistoryPanel({ documentId, canReview }: Props) {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canReview || !documentId) { setEvents(null); return; }
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      const { data, error } = await supabase
        .from("document_review_events")
        .select("id, action, previous_status, new_status, reason, reviewed_by, created_at")
        .eq("employee_document_id", documentId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (cancelled) return;
      if (error) setError(error.message);
      else setEvents((data ?? []) as EventRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [documentId, canReview]);

  if (!canReview || !documentId) return null;

  return (
    <div className="rounded-md border bg-muted/10 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground mb-2">
        <History className="h-3.5 w-3.5" />
        Historial de revisión
      </div>
      {loading && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Cargando historial…
        </div>
      )}
      {error && (
        <div className="text-[11px] text-rose-700">No se pudo cargar el historial: {error}</div>
      )}
      {!loading && !error && events && events.length === 0 && (
        <div className="text-[11px] text-muted-foreground">Sin eventos registrados todavía.</div>
      )}
      {!loading && !error && events && events.length > 0 && (
        <ul className="space-y-1.5">
          {events.map((ev) => {
            const meta = ACTION_META[ev.action] ?? { label: ev.action, Icon: History, className: "text-muted-foreground" };
            const Icon = meta.Icon;
            return (
              <li key={ev.id} className="text-[11px] leading-snug border-l-2 border-border pl-2">
                <div className={`flex items-center gap-1.5 font-medium ${meta.className}`}>
                  <Icon className="h-3 w-3" />
                  <span>{meta.label}</span>
                  <span className="text-muted-foreground font-normal">
                    · {new Date(ev.created_at).toLocaleString()}
                  </span>
                </div>
                {(ev.previous_status || ev.new_status) && (
                  <div className="text-muted-foreground">
                    {ev.previous_status ?? "—"} → {ev.new_status ?? "—"}
                  </div>
                )}
                {ev.reason && (
                  <div className="text-muted-foreground">
                    <span className="font-medium">Motivo:</span> {ev.reason}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        Registro automático. Solo lectura.
      </p>
    </div>
  );
}
