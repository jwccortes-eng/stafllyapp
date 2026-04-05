import { cn } from "@/lib/utils";
import { Globe, Check } from "lucide-react";

const LANGUAGE_OPTIONS = [
  { value: "Spanish", label: "Español", flag: "🇪🇸" },
  { value: "English", label: "English", flag: "🇺🇸" },
  { value: "Portuguese", label: "Português", flag: "🇧🇷" },
  { value: "French", label: "Français", flag: "🇫🇷" },
  { value: "Mandarin", label: "中文", flag: "🇨🇳" },
  { value: "Korean", label: "한국어", flag: "🇰🇷" },
  { value: "Japanese", label: "日本語", flag: "🇯🇵" },
  { value: "Italian", label: "Italiano", flag: "🇮🇹" },
  { value: "German", label: "Deutsch", flag: "🇩🇪" },
  { value: "Arabic", label: "العربية", flag: "🇸🇦" },
  { value: "Hindi", label: "हिन्दी", flag: "🇮🇳" },
  { value: "Russian", label: "Русский", flag: "🇷🇺" },
  { value: "Creole", label: "Kreyòl", flag: "🇭🇹" },
];

interface Props {
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
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
        <Globe className="h-4 w-4 text-muted-foreground" />
        Idiomas
        {selected.length > 0 && (
          <span className="text-[10px] text-primary font-semibold ml-auto">
            {selected.length} seleccionado{selected.length > 1 ? "s" : ""}
          </span>
        )}
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
                "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 transition-all text-xs font-medium text-left",
                isSelected
                  ? "border-primary bg-primary/5 text-primary shadow-sm"
                  : "border-border/60 bg-card text-foreground hover:border-primary/40 hover:bg-primary/[0.02]"
              )}
            >
              <span className="text-base leading-none">{lang.flag}</span>
              {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
              <span className="truncate">{lang.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
