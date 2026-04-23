/**
 * Stafly Front Desk — Stepper / progress dots for tablet flow.
 */
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface FrontDeskStepperProps {
  steps: Array<{ key: string; label: string }>;
  currentIndex: number;
}

export function FrontDeskStepper({ steps, currentIndex }: FrontDeskStepperProps) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3">
      {steps.map((step, idx) => {
        const isDone = idx < currentIndex;
        const isCurrent = idx === currentIndex;
        return (
          <div key={step.key} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all",
                isDone && "bg-primary text-primary-foreground",
                isCurrent && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                !isDone && !isCurrent && "bg-muted text-muted-foreground"
              )}
            >
              {isDone ? <Check className="h-4 w-4" /> : idx + 1}
            </div>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-8 transition-colors",
                  isDone ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
