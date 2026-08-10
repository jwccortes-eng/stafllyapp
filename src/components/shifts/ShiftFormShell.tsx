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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Save, X, Calendar as CalendarIcon, Building2, FileText, Send } from "lucide-react";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PrePublishDialog, type PrePublishReviewData } from "./workspace/PrePublishDialog";
import { ADMIN_LEX } from "@/lib/ox/lexicon";

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
  /** Optional secondary action — typically "Save draft". When provided,
   *  primary button becomes the publish/finalize action. */
  onSaveDraft?: () => void | Promise<void>;
  draftLabel?: string;
  draftSaving?: boolean;
  /** True when there are unsaved changes — used to show confirm-on-close. */
  isDirty?: boolean;
  /** S4 — Called when the user explicitly chooses "Descartar" in the
   *  unsaved-changes confirm dialog. Lets the parent drop the local autosave
   *  draft (S3) so a fresh reopen doesn't restore the discarded work. */
  onDiscard?: () => void;
  /** P0.4 — "Guardar para después": cierra conservando la SESIÓN local de
   *  creación. No crea ningún registro en base de datos. */
  onKeepForLater?: () => void;
  /** Optional banner above the save button (e.g. "requires re-acceptance"). */
  footerBanner?: React.ReactNode;
  /** Form column content (left). */
  children: React.ReactNode;
  /** Sticky right panel (typically <ShiftSummaryPanel/>). Optional. */
  summary?: React.ReactNode;
  /** SERVICE COPILOT — resumen operativo que reemplaza el título del header. */
  headerSummary?: React.ReactNode;
  /** When provided, clicking the primary publish button opens a "Antes de publicar"
   *  review modal instead of calling onSave directly. The modal forwards confirm to onSave. */
  publishReview?: PrePublishReviewData | null;
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
  onSaveDraft,
  draftLabel,
  draftSaving,
  isDirty,
  onDiscard,
  onKeepForLater,
  footerBanner,
  children,
  summary,
  headerSummary,
  publishReview,
}: Props) {
  const headerTitle = mode === "create" ? `${ADMIN_LEX.create} rápido` : ADMIN_LEX.edit;
  const headerSubtitle = mode === "create"
    ? "Empieza con lo esencial o usa una plantilla."
    : "Configura los detalles del turno.";
  const defaultSaveLabel = mode === "create"
    ? (onSaveDraft ? "Publicar" : `Crear ${ADMIN_LEX.entity}`)
    : "Guardar cambios";
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [publishReviewOpen, setPublishReviewOpen] = useState(false);

  // S4 — beforeunload guard. Only attaches while the form is open AND dirty,
  // so a clean form (or closed dialog) never blocks the user. No DB/RLS work.
  useEffect(() => {
    if (!open || !isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the string but require returnValue to be set.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [open, isDirty]);

  const handlePrimaryClick = () => {
    if (publishReview) {
      setPublishReviewOpen(true);
      return;
    }
    void onSave();
  };

  const handleConfirmPublish = async () => {
    if (!publishReview) return;
    const hadPending = publishReview.hasPending;
    try {
      await onSave();
      // Existing handler already toasts "Turno publicado". Add a follow-up
      // contextual notice when there is pending info so the admin understands
      // the shift went out incomplete (no scary error language).
      if (hadPending) {
        toast.info("Turno publicado con información pendiente", {
          description: "Los campos pendientes aparecerán como “por confirmar” para los trabajadores.",
        });
      }
    } finally {
      setPublishReviewOpen(false);
    }
  };

  const requestClose = () => {
    if (isDirty) {
      setConfirmCloseOpen(true);
    } else {
      onOpenChange(false);
    }
  };

  const handleDialogChange = (next: boolean) => {
    if (!next && isDirty) {
      setConfirmCloseOpen(true);
      return;
    }
    onOpenChange(next);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent
        className={cn(
          "p-0 gap-0 overflow-hidden flex flex-col rounded-2xl border-border/30 shadow-xl",
          // Mobile: behaves like the old centered dialog
          "max-w-lg max-h-[88vh]",
          // Desktop: full-screen-ish working canvas — !important nukes shadcn's sm:max-w-lg
          "lg:!max-w-[1280px] lg:w-[96vw] lg:h-[92vh] lg:max-h-[92vh]",
        )}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border/30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          {headerSummary ?? (
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold font-heading leading-tight">{headerTitle}</h2>
                  {mode === "create" && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 border border-primary/20">
                      Creación rápida
                    </span>
                  )}
                </div>
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
                  {!clientName && !date && <span>{headerSubtitle}</span>}
                </div>
              </div>
            </div>
          )}


          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={requestClose}
              className="h-9 text-xs gap-1"
            >
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
            {onSaveDraft && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void onSaveDraft()}
                disabled={draftSaving || saving}
                className="h-9 text-xs gap-1.5 font-medium px-3"
                title="Guardar como borrador — no se notifica a los workers"
              >
                {draftSaving
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <FileText className="h-3.5 w-3.5" />}
                {draftLabel ?? "Save draft"}
              </Button>
            )}
            <Button
              onClick={handlePrimaryClick}
              disabled={saving || saveDisabled || draftSaving}
              size="sm"
              className="h-9 text-xs gap-1.5 font-semibold px-4"
            >
              {saving
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : (onSaveDraft ? <Send className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />)}
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

    <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {onKeepForLater ? "Hay una creación de turno en progreso" : "¿Descartar cambios?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {onKeepForLater
              ? "Puedes guardarla para después y retomarla tal como está. Todavía no existe ningún turno."
              : "Tienes cambios sin guardar en este turno. Si cierras ahora se perderán."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel>Seguir editando</AlertDialogCancel>
          {onKeepForLater && (
            <Button
              variant="outline"
              onClick={() => {
                setConfirmCloseOpen(false);
                onKeepForLater();
                onOpenChange(false);
              }}
            >
              Guardar para después
            </Button>
          )}
          {!onKeepForLater && onSaveDraft && (
            <Button
              variant="outline"
              onClick={async () => {
                setConfirmCloseOpen(false);
                await onSaveDraft();
              }}
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" /> Guardar borrador
            </Button>
          )}
          <AlertDialogAction
            onClick={() => {
              setConfirmCloseOpen(false);
              onDiscard?.(); // S4 — drop local autosave draft (S3) on explicit discard
              onOpenChange(false);
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Descartar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {publishReview && (
      <PrePublishDialog
        open={publishReviewOpen}
        onOpenChange={setPublishReviewOpen}
        data={publishReview}
        saving={saving}
        onConfirm={handleConfirmPublish}
      />
    )}
    </>
  );
}
