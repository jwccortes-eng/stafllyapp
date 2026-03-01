import { useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HelpCategory } from "./help-data";

interface Props {
  category: HelpCategory;
  lang: "es" | "en";
  onBack: () => void;
}

export function HelpFaqSection({ category, lang, onBack }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const faqs = category.faqs[lang];

  return (
    <div className="space-y-6 animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        {lang === "es" ? "Todas las categorías" : "All categories"}
      </button>

      <div className="flex items-center gap-4">
        <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center shrink-0", category.color)}>
          <category.icon className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">{category.title[lang]}</h2>
          <p className="text-sm text-muted-foreground">{category.description[lang]}</p>
        </div>
      </div>

      <div className="space-y-2">
        {faqs.map((item, i) => (
          <div key={i} className="rounded-xl border border-border/50 overflow-hidden">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between p-4 text-left text-sm font-medium text-foreground hover:bg-muted/30 transition-colors"
            >
              {item.q}
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground shrink-0 ml-2 transition-transform", open === i && "rotate-180")} />
            </button>
            {open === i && (
              <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed animate-fade-in whitespace-pre-line">
                {item.a.split(/\*\*(.*?)\*\*/g).map((part, j) =>
                  j % 2 === 1
                    ? <strong key={j} className="text-foreground font-medium">{part}</strong>
                    : <span key={j}>{part}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
