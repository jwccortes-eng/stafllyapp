import { Link } from "react-router-dom";
import { Search, Users, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StaflyLogo } from "@/components/brand/StaflyBrand";

interface HelpHeroProps {
  lang: "es" | "en";
  search: string;
  onSearchChange: (v: string) => void;
  onLangToggle: () => void;
}

export function HelpHero({ lang, search, onSearchChange, onLangToggle }: HelpHeroProps) {
  const t = lang === "es"
    ? { title: "Centro de Ayuda", subtitle: "Encuentra respuestas rápidas a las preguntas más comunes", searchPlaceholder: "Buscar en todos los módulos...", empLabel: "Portal Empleados", empDesc: "Teléfono + código de 4 dígitos", adminLabel: "Admin / Manager", adminDesc: "Correo + contraseña", note: "Si eres empleado, entra por /portal" }
    : { title: "Help Center", subtitle: "Find quick answers to the most common questions", searchPlaceholder: "Search all modules...", empLabel: "Employee Portal", empDesc: "Phone + 4-digit code", adminLabel: "Admin / Manager", adminDesc: "Email + password", note: "If you're an employee, use /portal" };

  return (
    <div className="text-center space-y-6">
      <div className="space-y-3">
        <h1 className="text-3xl md:text-4xl font-heading font-bold text-foreground">{t.title}</h1>
        <p className="text-muted-foreground max-w-lg mx-auto">{t.subtitle}</p>
      </div>

      {/* Search */}
      <div className="max-w-md mx-auto relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t.searchPlaceholder}
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-10 h-11 rounded-xl"
        />
      </div>

      {/* Lang toggle */}
      <button
        onClick={onLangToggle}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border rounded-full px-3 py-1 transition-colors"
      >
        {lang === "es" ? "🇺🇸 English" : "🇪🇸 Español"}
      </button>

      {/* Quick Access cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
        <Link
          to="/portal"
          className="flex items-center gap-3 rounded-2xl border bg-card p-4 hover:bg-accent/50 transition-all shadow-sm hover:shadow-md text-left"
        >
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{t.empLabel}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{t.empDesc}</p>
          </div>
        </Link>
        <Link
          to="/auth"
          className="flex items-center gap-3 rounded-2xl border bg-card p-4 hover:bg-accent/50 transition-all shadow-sm hover:shadow-md text-left"
        >
          <div className="h-10 w-10 rounded-xl bg-success/10 text-success flex items-center justify-center shrink-0">
            <Shield className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{t.adminLabel}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{t.adminDesc}</p>
          </div>
        </Link>
      </div>

      <p className="text-[11px] text-muted-foreground/60 italic">💡 {t.note}</p>
    </div>
  );
}
