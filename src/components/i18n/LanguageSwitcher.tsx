import { useT, type Language } from "@/i18n";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  className?: string;
  variant?: "card" | "inline";
}

interface Option {
  value: Language;
  label: string;
  shortLabel: string;
}

/**
 * Production language selector: Español · English.
 *
 * - Each option sets `language` only. `contentMode` is independent and not
 *   touched here (Libro/guide mode is a separate axis, hidden from this UI).
 * - Hebrew is intentionally hidden in production until full RTL QA exists.
 *   See LanguageContext: RTL is disabled and any legacy "he" preference is
 *   coerced to English on load so the dashboard never boots in RTL.
 */
export function LanguageSwitcher({ className, variant = "card" }: LanguageSwitcherProps) {
  const { language, setLanguage, t } = useT();

  const options: Option[] = [
    { value: "es", label: "Español", shortLabel: "ES" },
    { value: "en", label: "English", shortLabel: "EN" },
  ];

  const Pills = ({ size }: { size: "sm" | "md" }) => (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-background p-0.5"
      role="group"
      aria-label={t("settings.language.title")}
      dir="ltr"
    >
      {options.map((opt) => {
        const active = language === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLanguage(opt.value)}
            className={cn(
              "rounded-md font-medium transition-colors whitespace-nowrap",
              size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={active}
            title={opt.label}
            lang={opt.value}
          >
            {size === "sm" ? opt.shortLabel : opt.label}
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
              {t("settings.language.description")}
            </p>
          </div>
          <Pills size="md" />
        </div>
      </div>
    </div>
  );
}

export default LanguageSwitcher;
