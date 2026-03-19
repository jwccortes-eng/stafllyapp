import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Clock, Calendar, Car, Briefcase, PenTool, CheckCircle2,
  ChevronRight, BookOpen, Wrench, Save, Trash2,
} from "lucide-react";

export type ClassifyAction = "hourly" | "daily" | "pay_ride" | "weekend_job" | "manual_adjustment";

interface QuickClassifyBarProps {
  selectedIds: string[];
  onClassify: (ids: string[], classification: ClassifyAction) => Promise<void>;
  onBulkApprove: (ids: string[]) => Promise<void>;
  onBulkMarkReviewed: (ids: string[]) => Promise<void>;
  onBulkIgnoreDuplicates?: (ids: string[], reason: string) => Promise<void>;
  onSaveAsRule?: (classification: ClassifyAction) => void;
  onNavigateWorkbench?: () => void;
  compact?: boolean;
}

const CLASSIFY_OPTIONS: { value: ClassifyAction; label: string; icon: any; color: string }[] = [
  { value: "hourly", label: "Hourly", icon: Clock, color: "text-blue-600" },
  { value: "daily", label: "Daily", icon: Calendar, color: "text-emerald-600" },
  { value: "pay_ride", label: "Ride", icon: Car, color: "text-amber-600" },
  { value: "weekend_job", label: "Weekend", icon: Briefcase, color: "text-purple-600" },
  { value: "manual_adjustment", label: "Manual", icon: PenTool, color: "text-rose-600" },
];

export default function QuickClassifyBar({
  selectedIds,
  onClassify,
  onBulkApprove,
  onBulkMarkReviewed,
  onBulkIgnoreDuplicates,
  onSaveAsRule,
  onNavigateWorkbench,
  compact,
}: QuickClassifyBarProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [showIgnoreDialog, setShowIgnoreDialog] = useState(false);
  const [ignoreReason, setIgnoreReason] = useState("");

  const count = selectedIds.length;
  if (count === 0) return null;

  const handleClassify = async (action: ClassifyAction) => {
    setLoading(action);
    await onClassify(selectedIds, action);
    setLoading(null);
  };

  const handleApprove = async () => {
    setLoading("approve");
    await onBulkApprove(selectedIds);
    setLoading(null);
  };

  const handleMarkReviewed = async () => {
    setLoading("reviewed");
    await onBulkMarkReviewed(selectedIds);
    setLoading(null);
  };

  const handleIgnore = async () => {
    if (!ignoreReason.trim() || !onBulkIgnoreDuplicates) return;
    setLoading("ignore");
    await onBulkIgnoreDuplicates(selectedIds, ignoreReason);
    setShowIgnoreDialog(false);
    setIgnoreReason("");
    setLoading(null);
  };

  return (
    <>
      <div className={`flex items-center gap-1.5 flex-wrap px-3 py-2 rounded-lg bg-muted/60 border border-border ${compact ? "py-1.5" : ""}`}>
        <Badge variant="secondary" className="text-xs shrink-0">
          {count} seleccionado{count > 1 ? "s" : ""}
        </Badge>

        <div className="h-4 w-px bg-border mx-1" />

        {/* Classify buttons */}
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">Clasificar:</span>
        {CLASSIFY_OPTIONS.map(opt => {
          const Icon = opt.icon;
          return (
            <Button
              key={opt.value}
              size="xs"
              variant="outline"
              className="gap-1 text-[11px]"
              disabled={loading !== null}
              onClick={() => handleClassify(opt.value)}
            >
              <Icon className={`h-3 w-3 ${opt.color}`} />
              {opt.label}
            </Button>
          );
        })}

        <div className="h-4 w-px bg-border mx-1" />

        {/* Action buttons */}
        <Button size="xs" variant="outline" className="gap-1 text-[11px]" disabled={loading !== null} onClick={handleApprove}>
          <CheckCircle2 className="h-3 w-3 text-primary" /> Aprobar
        </Button>
        <Button size="xs" variant="outline" className="gap-1 text-[11px]" disabled={loading !== null} onClick={handleMarkReviewed}>
          <BookOpen className="h-3 w-3" /> Revisado
        </Button>
        {onBulkIgnoreDuplicates && (
          <Button size="xs" variant="outline" className="gap-1 text-[11px]" disabled={loading !== null} onClick={() => setShowIgnoreDialog(true)}>
            <Trash2 className="h-3 w-3" /> Ignorar
          </Button>
        )}
        {onNavigateWorkbench && (
          <Button size="xs" variant="ghost" className="gap-1 text-[11px]" onClick={onNavigateWorkbench}>
            <Wrench className="h-3 w-3" /> Workbench
          </Button>
        )}
        {onSaveAsRule && count === 1 && (
          <Button size="xs" variant="ghost" className="gap-1 text-[11px]" onClick={() => onSaveAsRule("hourly")}>
            <Save className="h-3 w-3" /> Guardar regla
          </Button>
        )}
      </div>

      <Dialog open={showIgnoreDialog} onOpenChange={setShowIgnoreDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ignorar {count} registro(s)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Razón (obligatoria)</Label>
            <Textarea value={ignoreReason} onChange={e => setIgnoreReason(e.target.value)} placeholder="Ej: Filas duplicadas de importación anterior..." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIgnoreDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleIgnore} disabled={!ignoreReason.trim() || loading !== null}>
              Ignorar {count} registro(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
