import { Settings2, ChevronUp, ChevronDown, RotateCcw, Eye, EyeOff, GripVertical } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { DashboardWidget } from "@/hooks/useDashboardWidgets";

interface Props {
  widgets: DashboardWidget[];
  toggleWidget: (id: string) => void;
  moveWidget: (id: string, dir: "up" | "down") => void;
  resetWidgets: () => void;
}

export function DashboardWidgetSettings({ widgets, toggleWidget, moveWidget, resetWidgets }: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-xl border-border/50 text-xs h-8">
          <Settings2 className="h-3.5 w-3.5" />
          Personalizar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">Personalizar Dashboard</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Activa o desactiva widgets y reordénalos a tu gusto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 mt-2">
          {widgets.map((w, idx) => (
            <div
              key={w.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border transition-all",
                w.enabled
                  ? "bg-card border-border/60"
                  : "bg-muted/30 border-border/30 opacity-60"
              )}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-foreground">{w.label}</p>
                <p className="text-[11px] text-muted-foreground/60">{w.description}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => moveWidget(w.id, "up")}
                  disabled={idx === 0}
                  className="p-1 rounded-md hover:bg-muted/50 disabled:opacity-20 transition-colors"
                >
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={() => moveWidget(w.id, "down")}
                  disabled={idx === widgets.length - 1}
                  className="p-1 rounded-md hover:bg-muted/50 disabled:opacity-20 transition-colors"
                >
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <Switch
                  checked={w.enabled}
                  onCheckedChange={() => toggleWidget(w.id)}
                  className="ml-1 scale-90"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-3">
          <Button variant="ghost" size="sm" onClick={resetWidgets} className="gap-1.5 text-xs text-muted-foreground">
            <RotateCcw className="h-3 w-3" />
            Restablecer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
