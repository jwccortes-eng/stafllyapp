import { useT, type Language, type ContentMode } from "@/i18n";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  className?: string;
  variant?: "card" | "inline";
}

type OptionKind =
  | { kind: "lang"; value: Language; label: string }
  | { kind: "mode"; value: Extract<ContentMode, "guide">; label: string };

/**
 * Tri-state selector aligned with Parceros: ES · EN · Libro.
 *
 * - ES / EN switch `language` and force `contentMode='app'`.
 * - Libro keeps current `language` and switches `contentMode='guide'`
 *   (falls back to `app` keys when a guide string is missing — handled
 *   by the t() resolver in LanguageContext).
 *
 * Internal model stays untouched: language ∈ {en,es}, contentMode ∈ {app,guide,marketing}.
 */
export function LanguageSwitcher({ className, variant = "card" }: LanguageSwitcherProps) {
  const { language, contentMode, setLanguage, setContentMode, t } = useT();

  const options: OptionKind[] = [
    { kind: "lang", value: "es", label: "ES" },
    { kind: "lang", value: "en", label: "EN" },
    { kind: "mode", value: "guide", label: t("settings.language.guide") || "Libro" },
  ];

  const isActive = (opt: OptionKind): boolean => {
    if (opt.kind === "mode") return contentMode === "guide";
    return contentMode !== "guide" && language === opt.value;
  };

  const onPick = (opt: OptionKind) => {
    if (opt.kind === "mode") {
      setContentMode("guide");
      return;
    }
    setLanguage(opt.value);
    if (contentMode === "guide") setContentMode("app");
  };

  const Pills = ({ size }: { size: "sm" | "md" }) => (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border bg-background p-0.5",
      )}
      role="group"
      aria-label={t("settings.language.title")}
    >
      {options.map((opt) => {
        const active = isActive(opt);
        return (
          <button
            key={`${opt.kind}:${opt.value}`}
            type="button"
            onClick={() => onPick(opt)}
            className={cn(
              "rounded-md font-medium transition-colors whitespace-nowrap",
              size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={active}
            title={
              opt.kind === "mode"
                ? t("settings.language.guide_description")
                : undefined
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  if (variant === "inline") {
    return (
      <div className={cn("inline-flex", className)}>
        <Pills size="sm" />
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-muted p-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 space-y-3 min-w-0">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {t("settings.language.title")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {contentMode === "guide"
                ? t("settings.language.guide_description")
                : t("settings.language.description")}
            </p>
          </div>
          <Pills size="md" />
        </div>
      </div>
    </div>
  );
}

export default LanguageSwitcher;
