import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { HELP_CATEGORIES } from "@/components/help/help-data";
import { HelpHero } from "@/components/help/HelpHero";
import { HelpCategoryGrid } from "@/components/help/HelpCategoryGrid";
import { HelpFaqSection } from "@/components/help/HelpFaqSection";
import { HelpFooter } from "@/components/help/HelpFooter";

export default function HelpCenter() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [lang, setLang] = useState<"es" | "en">(() => {
    const browserLang = navigator.language.slice(0, 2);
    return browserLang === "en" ? "en" : "es";
  });

  const filtered = HELP_CATEGORIES.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.title[lang].toLowerCase().includes(s) ||
      c.description[lang].toLowerCase().includes(s) ||
      c.faqs[lang].some(f => f.q.toLowerCase().includes(s) || f.a.toLowerCase().includes(s))
    );
  });

  const activeCategory = selected ? HELP_CATEGORIES.find(c => c.id === selected) : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="container flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
            <ArrowLeft className="h-4 w-4" />
            {lang === "es" ? "Volver" : "Back"}
          </Link>
          <StaflyLogo size={28} />
        </div>
      </header>

      <main className="container max-w-4xl py-10 md:py-14 space-y-10 animate-fade-in">
        <HelpHero
          lang={lang}
          search={search}
          onSearchChange={v => { setSearch(v); setSelected(null); }}
          onLangToggle={() => setLang(l => l === "es" ? "en" : "es")}
        />

        {!activeCategory ? (
          <HelpCategoryGrid
            categories={filtered}
            lang={lang}
            onSelect={id => setSelected(id)}
          />
        ) : (
          <HelpFaqSection
            category={activeCategory}
            lang={lang}
            onBack={() => setSelected(null)}
          />
        )}

        <HelpFooter lang={lang} />
      </main>
    </div>
  );
}
