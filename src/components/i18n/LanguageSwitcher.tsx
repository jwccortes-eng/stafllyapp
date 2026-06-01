import { useT, type Language } from "@/i18n";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  className?: string;
  variant?: "card" | "inline";
}

/**
 * Language switcher for /app/settings and similar surfaces.
 * Switches the in-app UI language only; does not write to DB.
 * Persisted via `localStorage` key `stafly.lang.v1`.
 */
export function LanguageSwitcher({ className, variant = "card" }: LanguageSwitcherProps) {
  const { language, setLanguage, t } = useT();

  const options: { value: Language; label: string }[] = [
    { value: "en", label: t("settings.language.english") },
    { value: "es", label: t("settings.language.spanish") },
  ];

  if (variant === "inline") {
    return (
      <div className={cn("inline-flex items-center gap-1 rounded-lg border border-border bg-card p-0.5", className)}>
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLanguage(opt.value)}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
              language === opt.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={language === opt.value}
          >
            {opt.value.toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-muted p-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {t("settings.language.title")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("settings.language.description")}
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLanguage(opt.value)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  language === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-pressed={language === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LanguageSwitcher;
