/**
 * ShiftFormShell — full-screen modal layout for create/edit shift.
 *
 * Layout:
 *  ┌── sticky header (title · chips · cancel/save) ──┐
 *  │                                                  │
 *  │  ┌─ form (scroll) ──┐  ┌─ summary (sticky) ───┐ │
 *  │  │                  │  │                       │ │
 *  │  └──────────────────┘  └───────────────────────┘ │
 *  └──────────────────────────────────────────────────┘
 *
 * On <lg breakpoints, summary collapses below the form (or hides — passed
 * by parent). Header chips show client + date/time once defined.
 */
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Save, X, Calendar as CalendarIcon, Building2 } from "lucide-react";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  /** Optional client/date chips for the sticky header. */
  clientName?: string | null;
  date?: string;
  startTime?: string;
  endTime?: string;
  /** Save handler + state */
  onSave: () => void | Promise<void>;
  saving?: boolean;
  saveLabel?: string;
  saveDisabled?: boolean;
  /** Optional banner above the save button (e.g. "requires re-acceptance"). */
  footerBanner?: React.ReactNode;
  /** Form column content (left). */
  children: React.ReactNode;
  /** Sticky right panel (typically <ShiftSummaryPanel/>). Optional. */
  summary?: React.ReactNode;
}

function fmtDateChip(d: string): string {
  try {
    return format(parse(d, "yyyy-MM-dd", new Date()), "EEE d MMM", { locale: es });
  } catch {
    return d;
  }
}

export function ShiftFormShell({
  open,
  onOpenChange,
  mode,
  clientName,
  date,
  startTime,
  endTime,
  onSave,
  saving,
  saveLabel,
  saveDisabled,
  footerBanner,
  children,
  summary,
}: Props) {
  const headerTitle = mode === "create" ? "Nuevo turno" : "Editar turno";
  const defaultSaveLabel = mode === "create" ? "Crear turno" : "Guardar cambios";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "p-0 gap-0 overflow-hidden flex flex-col rounded-2xl border-border/30 shadow-xl",
          // Mobile: behaves like the old centered dialog
          "max-w-lg max-h-[88vh]",
          // Desktop: full-screen-ish working canvas
          "lg:max-w-[1200px] lg:w-[96vw] lg:h-[92vh] lg:max-h-[92vh]",
        )}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border/30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <h2 className="text-base font-bold font-heading leading-tight">{headerTitle}</h2>
              <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                {clientName && (
                  <span className="inline-flex items-center gap-1 max-w-[160px] truncate">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{clientName}</span>
                  </span>
                )}
                {clientName && date && <span className="text-muted-foreground/40">·</span>}
                {date && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarIcon className="h-3 w-3 shrink-0" />
                    {fmtDateChip(date)}
                    {startTime && endTime && (
                      <span className="text-muted-foreground/70"> · {startTime}–{endTime}</span>
                    )}
                  </span>
                )}
                {!clientName && !date && (
                  <span>Configura los detalles del turno.</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-9 text-xs gap-1"
            >
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button
              onClick={() => void onSave()}
              disabled={saving || saveDisabled}
              size="sm"
              className="h-9 text-xs gap-1.5 font-semibold px-4"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saveLabel ?? defaultSaveLabel}
            </Button>
          </div>
        </div>

        {/* Body: 2-column on desktop, single column on mobile */}
        <div className="flex-1 overflow-hidden">
          <div
            className={cn(
              "h-full overflow-y-auto",
              summary && "lg:grid lg:grid-cols-[1fr_360px] lg:gap-0 lg:overflow-hidden",
            )}
          >
            {/* Form column */}
            <div className={cn("px-4 py-4 space-y-3", summary && "lg:overflow-y-auto lg:h-full lg:px-6 lg:py-6")}>
              {children}
              {/* Footer banner inline at the bottom of the form column */}
              {footerBanner && <div className="pt-1">{footerBanner}</div>}
            </div>

            {/* Summary column */}
            {summary && (
              <aside className="border-t border-border/30 bg-muted/10 px-4 py-4 lg:border-t-0 lg:border-l lg:overflow-y-auto lg:h-full lg:px-5 lg:py-6">
                <div className="lg:sticky lg:top-0">{summary}</div>
              </aside>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
