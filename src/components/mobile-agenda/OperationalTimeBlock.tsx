import { cn } from "@/lib/utils";

interface Props {
  /** "Entrada", "Punto de encuentro", "Termina aprox." */
  label?: string;
  /** "HH:mm" */
  time: string;
  /** Optional muted caption below */
  caption?: string | null;
  /** hero = 5xl mono. row = base mono. */
  size?: "hero" | "row" | "sm";
  align?: "left" | "right";
  className?: string;
}

/** Atomic time block: label + time + optional caption. */
export function OperationalTimeBlock({
  label,
  time,
  caption,
  size = "row",
  align = "left",
  className,
}: Props) {
  const timeCls =
    size === "hero"
      ? "text-[44px] leading-none font-bold font-mono tabular-nums tracking-tight"
      : size === "row"
      ? "text-[18px] font-bold font-mono tabular-nums leading-none"
      : "text-[13px] font-semibold font-mono tabular-nums leading-none";

  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        align === "right" ? "items-end text-right" : "items-start",
        className,
      )}
    >
      {label && (
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
          {label}
        </span>
      )}
      <span className={cn(timeCls, "text-foreground")}>{time}</span>
      {caption && (
        <span className="text-[11px] text-muted-foreground/75 leading-tight">
          {caption}
        </span>
      )}
    </div>
  );
}
