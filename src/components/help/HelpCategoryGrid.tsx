import { cn } from "@/lib/utils";
import type { HelpCategory } from "./help-data";

interface Props {
  categories: HelpCategory[];
  lang: "es" | "en";
  onSelect: (id: string) => void;
}

export function HelpCategoryGrid({ categories, lang, onSelect }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {categories.map(c => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className="flex items-center gap-4 rounded-2xl border bg-card p-5 hover:bg-accent/50 transition-all text-left shadow-sm hover:shadow-md group"
        >
          <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110", c.color)}>
            <c.icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground text-sm">{c.title[lang]}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {c.description[lang]} · {c.faqs[lang].length} {lang === "es" ? "preguntas" : "questions"}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
