import { cn } from "@/lib/utils";

/**
 * SectionHeader — Used in public/landing pages for section titles.
 * Eyebrow + Title + optional Subtitle + decorative underline.
 */

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  align?: "left" | "center";
  className?: string;
}

export function SectionHeader({
  title,
  subtitle,
  eyebrow,
  align = "center",
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "mb-10 md:mb-14",
        align === "center" && "text-center",
        className
      )}
    >
      {eyebrow && (
        <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-[0.2em] text-primary mb-2.5">
          {eyebrow}
        </p>
      )}

      <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold font-heading tracking-tight text-foreground leading-tight">
        {title}
      </h2>

      {subtitle && (
        <p
          className={cn(
            "text-sm md:text-base text-muted-foreground mt-2 leading-relaxed",
            align === "center" && "max-w-xl mx-auto"
          )}
        >
          {subtitle}
        </p>
      )}

      {/* Decorative underline */}
      <div
        className={cn(
          "mt-4 flex items-center gap-2",
          align === "center" && "justify-center"
        )}
      >
        <div className="h-[3px] w-10 rounded-full bg-primary" />
        <div className="h-[3px] w-3 rounded-full bg-primary/30" />
      </div>
    </div>
  );
}
