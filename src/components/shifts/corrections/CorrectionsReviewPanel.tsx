/**
 * CorrectionsReviewPanel
 *
 * Shown to the Revisor de horas inside the shift closeout area.
 * Lists pending + recently-rejected attendance corrections for a
 * shift with side-by-side Original vs Corrección propuesta.
 *
 * Self-review (same user proposed AND reviews) is blocked at the
 * RPC layer; UI also disables the action with a clear message.
 */
import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Loader2, ShieldCheck, XCircle, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  CORRECTION_TYPE_LABEL,
  listShiftCorrections,
  mapCorrectionErrorMessage,
  reviewTimeEntryCorrection,
  type ShiftCorrectionRow,
} from "@/lib/shifts/time-corrections";

interface Props {
  shiftId: string;
  /** Map employee_id → display name (optional, for richer rows). */
  employeeNameById?: Record<string, string>;
  /** Hook called after a successful review so parent can refresh evidence. */
  onReviewed?: () => void;
}

const PRIVILEGED = new Set(["developer", "owner", "founder"]);

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "HH:mm");
  } catch {
    return "—";
  }
}

export function CorrectionsReviewPanel({
  shiftId,
  employeeNameById,
  onReviewed,
}: Props) {
  const { user, allRoles } = useAuth();
  const [rows, setRows] = useState<ShiftCorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const isPrivileged = [...allRoles].some((r) => PRIVILEGED.has(r));

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listShiftCorrections(shiftId));
    } finally {
      setLoading(false);
    }
  }, [shiftId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function decide(
    row: ShiftCorrectionRow,
    decision: "approved" | "rejected",
  ) {
    setBusyId(row.pending_time_entry_id);
    try {
      await reviewTimeEntryCorrection(
        row.pending_time_entry_id,
        decision,
        notesById[row.pending_time_entry_id] || null,
      );
      toast.success(
        decision === "approved" ? "Corrección aprobada" : "Corrección rechazada",
      );
      await refresh();
      onReviewed?.();
    } catch (e: any) {
      toast.error(mapCorrectionErrorMessage(e?.message ?? "Error"));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (rows.length === 0) return null;

  const pending = rows.filter((r) => r.status === "pending_correction");
  const rejected = rows.filter((r) => r.status === "rejected");

  return (
    <section className="space-y-2" aria-label="Correcciones de fichaje">
      <div className="flex items-center gap-2 px-0.5">
        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">
          Correcciones de fichaje
        </h3>
        {pending.length > 0 && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 rounded-full">
            {pending.length} pendiente{pending.length === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      {pending.map((row) => {
        const isSelf =
          !!user?.id && row.requested_by === user.id && !isPrivileged;
        const name =
          employeeNameById?.[row.employee_id] ?? "Trabajador";
        return (
          <div
            key={row.pending_time_entry_id}
            className="rounded-2xl border border-border/60 bg-card p-3 space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {CORRECTION_TYPE_LABEL[row.correction_type]} ·{" "}
                  {row.requested_at
                    ? format(parseISO(row.requested_at), "dd MMM HH:mm")
                    : "—"}
                </p>
              </div>
              <Badge
                variant="outline"
                className="text-[10px] h-5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
              >
                Pendiente de revisión
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <div className="rounded-lg border border-border/40 bg-muted/30 p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Original
                </p>
                <p className="tabular-nums flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {fmt(row.original_clock_in)} → {fmt(row.original_clock_out)}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2">
                <p className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1">
                  Corrección propuesta
                </p>
                <p className="tabular-nums flex items-center gap-1 font-semibold">
                  <Clock className="h-3 w-3" />
                  {fmt(row.proposed_clock_in)} → {fmt(row.proposed_clock_out)}
                </p>
              </div>
            </div>

            {row.reason && (
              <div className="text-[11.5px]">
                <span className="text-muted-foreground">Motivo: </span>
                <span>{row.reason}</span>
              </div>
            )}
            {row.note && (
              <div className="text-[11px] text-muted-foreground">{row.note}</div>
            )}

            {isSelf && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                Otro revisor debe aprobar esta corrección — tú la enviaste.
              </p>
            )}

            <Textarea
              rows={2}
              placeholder="Nota de revisión (opcional)"
              value={notesById[row.pending_time_entry_id] ?? ""}
              onChange={(e) =>
                setNotesById((prev) => ({
                  ...prev,
                  [row.pending_time_entry_id]: e.target.value,
                }))
              }
              disabled={busyId === row.pending_time_entry_id}
            />

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1 h-10 rounded-xl gap-2"
                onClick={() => decide(row, "rejected")}
                disabled={busyId === row.pending_time_entry_id}
              >
                {busyId === row.pending_time_entry_id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Rechazar
              </Button>
              <Button
                className="flex-1 h-10 rounded-xl gap-2"
                onClick={() => decide(row, "approved")}
                disabled={busyId === row.pending_time_entry_id || isSelf}
              >
                <ShieldCheck className="h-4 w-4" />
                Aprobar corrección
              </Button>
            </div>
          </div>
        );
      })}

      {rejected.length > 0 && (
        <details className="rounded-xl border border-border/40 bg-muted/20 p-2 text-[12px]">
          <summary className="cursor-pointer text-muted-foreground">
            {rejected.length} corrección{rejected.length === 1 ? "" : "es"} rechazada{rejected.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-2 space-y-1.5">
            {rejected.map((row) => (
              <div
                key={row.pending_time_entry_id}
                className="rounded-lg border border-border/40 bg-card p-2"
              >
                <p className="text-[11px] font-medium">
                  {employeeNameById?.[row.employee_id] ?? "Trabajador"} ·{" "}
                  {CORRECTION_TYPE_LABEL[row.correction_type]}
                </p>
                <p className="text-[10.5px] text-muted-foreground tabular-nums">
                  Propuesta: {fmt(row.proposed_clock_in)} → {fmt(row.proposed_clock_out)}
                </p>
                {row.reason && (
                  <p className="text-[10.5px] text-muted-foreground mt-0.5">
                    Motivo: {row.reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
