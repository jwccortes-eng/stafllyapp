/**
 * Numeric keypad for tablet input — phone & PIN.
 */
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

interface NumericKeypadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear?: () => void;
  className?: string;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

export function NumericKeypad({ onDigit, onBackspace, onClear, className }: NumericKeypadProps) {
  return (
    <div className={cn("grid grid-cols-3 gap-3", className)}>
      {KEYS.map((key, idx) => {
        if (key === "") {
          if (onClear) {
            return (
              <button
                key={idx}
                onClick={onClear}
                className="h-16 rounded-2xl bg-muted/50 text-sm font-medium text-muted-foreground hover:bg-muted active:scale-95 transition-all"
                type="button"
              >
                Limpiar
              </button>
            );
          }
          return <div key={idx} />;
        }
        if (key === "back") {
          return (
            <button
              key={idx}
              onClick={onBackspace}
              className="h-16 rounded-2xl bg-muted text-foreground hover:bg-muted/80 active:scale-95 transition-all flex items-center justify-center"
              type="button"
              aria-label="Borrar"
            >
              <Delete className="h-6 w-6" />
            </button>
          );
        }
        return (
          <button
            key={idx}
            onClick={() => onDigit(key)}
            className="h-16 rounded-2xl bg-card border border-border text-2xl font-semibold text-foreground hover:bg-accent hover:border-primary/30 active:scale-95 transition-all shadow-sm"
            type="button"
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}
