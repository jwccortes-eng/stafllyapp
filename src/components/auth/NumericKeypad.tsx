import { useState, useRef } from "react";
import { Delete, Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";

interface NumericKeypadProps {
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  label?: string;
  className?: string;
}

export function NumericKeypad({ value, maxLength, onChange, onComplete, label, className }: NumericKeypadProps) {
  const handlePress = (digit: string) => {
    if (value.length >= maxLength) return;
    const next = value + digit;
    onChange(next);
    if (next.length === maxLength) {
      onComplete?.(next);
    }
  };

  const handleDelete = () => {
    onChange(value.slice(0, -1));
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

  return (
    <div className={cn("flex flex-col items-center gap-5", className)}>
      {/* PIN dots display */}
      {label && <p className="text-xs text-muted-foreground font-medium">{label}</p>}
      <div className="flex items-center gap-3">
        {Array.from({ length: maxLength }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-4 h-4 rounded-full border-2 transition-all duration-200",
              i < value.length
                ? "bg-primary border-primary scale-110 shadow-[0_0_8px_hsl(var(--primary)/0.4)]"
                : "border-border bg-transparent"
            )}
          />
        ))}
      </div>

      {/* Keypad grid */}
      <div className="grid grid-cols-3 gap-2.5 w-full max-w-[280px]">
        {keys.map((key, i) => {
          if (key === "") return <div key={i} />;

          if (key === "del") {
            return (
              <button
                key={i}
                type="button"
                onClick={handleDelete}
                disabled={value.length === 0}
                className="h-14 rounded-2xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all duration-150 disabled:opacity-30"
              >
                <Delete className="h-5 w-5" />
              </button>
            );
          }

          return (
            <button
              key={i}
              type="button"
              onClick={() => handlePress(key)}
              className="h-14 rounded-2xl bg-card border border-border/60 text-xl font-semibold text-foreground hover:bg-muted/40 active:scale-[0.93] active:bg-primary/10 transition-all duration-150 shadow-sm select-none"
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
}
