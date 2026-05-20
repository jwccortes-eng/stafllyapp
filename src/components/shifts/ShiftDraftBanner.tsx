/**
 * ShiftDraftBanner — S3
 *
 * Shows a "Tienes un borrador sin publicar" banner inside the shift
 * create/edit dialog when a local draft is found for the same
 * (company, user, mode, shiftId) tuple.
 *
 * Pure UI — no DB calls, no side effects beyond invoking callbacks.
 */
import { Button } from "@/components/ui/button";
import { FileClock, RotateCcw, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";
import type { DraftStatus } from "@/hooks/useShiftDraftAutosave";

interface Props {
  savedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
}

export function ShiftDraftBanner({ savedAt, onRestore, onDiscard }: Props) {
  let rel = "recently";
  try {
    rel = formatDistanceToNow(new Date(savedAt), { addSuffix: true, locale: enUS });
  } catch {
    // ignore
  }
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
      <FileClock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground">
          You have an unpublished local draft
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Saved {rel} on this device. Restore to continue, or discard to start fresh.
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={onDiscard}>
          <Trash2 className="h-3 w-3" /> Discard
        </Button>
        <Button size="sm" className="h-7 text-[11px] gap-1" onClick={onRestore}>
          <RotateCcw className="h-3 w-3" /> Restore
        </Button>
      </div>
    </div>
  );
}

export function ShiftDraftStatusPill({ status }: { status: DraftStatus }) {
  if (status === "idle") return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      {status === "saving" ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" /> Saving local draft…
        </>
      ) : (
        <>
          <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Local draft saved
        </>
      )}
    </span>
  );
}
