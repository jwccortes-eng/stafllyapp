import { cn } from "@/lib/utils";
import { Globe, Check } from "lucide-react";

const LANGUAGE_OPTIONS = [
  { value: "Spanish", label: "Español" },
  { value: "English", label: "English" },
  { value: "Portuguese", label: "Português" },
  { value: "French", label: "Français" },
  { value: "Mandarin", label: "中文" },
  { value: "Korean", label: "한국어" },
  { value: "Japanese", label: "日本語" },
  { value: "Italian", label: "Italiano" },
  { value: "German", label: "Deutsch" },
  { value: "Arabic", label: "العربية" },
  { value: "Hindi", label: "हिन्दी" },
  { value: "Russian", label: "Русский" },
  { value: "Creole", label: "Kreyòl" },
];

interface Props {
  /** Comma-separated string for backward compat */
  value: string;
  onChange: (v: string) => void;
}

export function LanguageMultiSelect({ value, onChange }: Props) {
  const selected = value ? value.split(",").map(s => s.trim()).filter(Boolean) : [];

  const toggle = (lang: string) => {
    const next = selected.includes(lang)
      ? selected.filter(l => l !== lang)
      : [...selected, lang];
    onChange(next.join(", "));
  };

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
        <Globe className="h-4 w-4 text-muted-foreground" />
        Idiomas
      </label>
      <div className="grid grid-cols-2 gap-1.5">
        {LANGUAGE_OPTIONS.map(lang => {
          const isSelected = selected.includes(lang.value);
          return (
            <button
              key={lang.value}
              type="button"
              onClick={() => toggle(lang.value)}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-xs font-medium text-left",
                isSelected
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border/60 bg-card text-foreground hover:border-primary/40"
              )}
            >
              {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{lang.label}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{lang.value !== lang.label ? lang.value : ""}</span>
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {selected.length} idioma{selected.length > 1 ? "s" : ""} seleccionado{selected.length > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
