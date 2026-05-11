import { cn } from "@/lib/utils";

interface Props {
  title: string;
  caption?: string | null;
  className?: string;
}

export function AgendaSectionHeader({ title, caption, className }: Props) {
  return (
    <div className={cn("flex items-end justify-between gap-2 px-1 pt-1", className)}>
      <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
        {title}
      </h2>
      {caption && (
        <span className="text-[10px] text-muted-foreground/55 tabular-nums">
          {caption}
        </span>
      )}
    </div>
  );
}
