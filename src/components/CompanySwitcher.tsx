import { useState, useMemo } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Search, Building2 } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";


const COMPANY_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#3b82f6", "#84cc16",
];

function getCompanyColor(brandColor: string | null | undefined, index: number): string {
  return brandColor || COMPANY_COLORS[index % COMPANY_COLORS.length];
}

function getCompanyInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

interface CompanySwitcherProps {
  collapsed?: boolean;
}

export default function CompanySwitcher({ collapsed = false }: CompanySwitcherProps) {
  const { companies, selectedCompanyId, selectedCompany, setSelectedCompanyId } = useCompany();
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingCompanyId, setPendingCompanyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.toLowerCase();
    return companies.filter(c => c.name.toLowerCase().includes(q));
  }, [companies, search]);

  const handleSelect = (companyId: string) => {
    if (companyId === selectedCompanyId) {
      setOpen(false);
      return;
    }
    setOpen(false);
    setSelectedCompanyId(companyId);
  };

  if (companies.length === 0) return null;

  const currentColor = getCompanyColor(selectedCompany?.brand_color, 0);
  const currentInitials = selectedCompany ? getCompanyInitials(selectedCompany.name) : "?";

  // Single company - just show the name
  if (companies.length === 1) {
    return (
      <div className={cn(
        "flex items-center gap-2.5",
        collapsed ? "justify-center" : ""
      )}>
        <Avatar className="h-7 w-7 rounded-lg shrink-0" style={{ borderColor: `${currentColor}30`, borderWidth: 1.5 }}>
          {selectedCompany?.logo_url ? (
            <AvatarImage src={selectedCompany.logo_url} alt={selectedCompany.name} className="rounded-lg object-cover" />
          ) : null}
          <AvatarFallback
            className="rounded-lg text-[10px] font-bold"
            style={{ backgroundColor: `${currentColor}15`, color: currentColor }}
          >
            {currentInitials}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <span className="text-[13px] font-semibold text-foreground truncate">{selectedCompany?.name}</span>
        )}
      </div>
    );
  }

  // Multi company - full switcher
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className={cn(
            "flex items-center gap-2.5 rounded-xl transition-all duration-200 hover:bg-accent/40 group w-full",
            collapsed ? "justify-center p-1.5" : "px-2.5 py-2"
          )}>
            <Avatar className="h-7 w-7 rounded-lg shrink-0 ring-1 ring-border/30">
              {selectedCompany?.logo_url ? (
                <AvatarImage src={selectedCompany.logo_url} alt={selectedCompany.name} className="rounded-lg object-cover" />
              ) : null}
              <AvatarFallback
                className="rounded-lg text-[10px] font-bold"
                style={{ backgroundColor: `${currentColor}15`, color: currentColor }}
              >
                {currentInitials}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[12px] font-semibold text-foreground truncate leading-tight">{selectedCompany?.name}</p>
                </div>
                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side={collapsed ? "right" : "bottom"}
          sideOffset={collapsed ? 8 : 4}
          className="w-[260px] p-0 rounded-xl shadow-xl border-border/50"
        >
          <div className="p-2 pb-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-2 pt-1 pb-2">
              Cambiar empresa
            </p>
            {companies.length > 4 && (
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="w-full h-8 pl-8 pr-3 text-[12px] bg-muted/30 border border-border/30 rounded-lg outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/30"
                  autoFocus
                />
              </div>
            )}
          </div>
          <div className="px-2 pb-2 max-h-[260px] overflow-y-auto scrollbar-thin space-y-0.5">
            {filtered.map((company, i) => {
              const color = getCompanyColor(company.brand_color, i);
              const initials = getCompanyInitials(company.name);
              const isSelected = company.id === selectedCompanyId;

              return (
                <button
                  key={company.id}
                  onClick={() => handleSelect(company.id)}
                  className={cn(
                    "flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-left transition-all duration-150",
                    isSelected
                      ? "bg-primary/[0.06]"
                      : "hover:bg-accent/40"
                  )}
                >
                  <Avatar className="h-7 w-7 rounded-lg shrink-0">
                    {company.logo_url ? (
                      <AvatarImage src={company.logo_url} alt={company.name} className="rounded-lg object-cover" />
                    ) : null}
                    <AvatarFallback
                      className="rounded-lg text-[9px] font-bold"
                      style={{ backgroundColor: `${color}15`, color }}
                    >
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-[12px] font-medium truncate leading-tight", isSelected && "text-primary font-semibold")}>
                      {company.name}
                    </p>
                  </div>
                  {isSelected && (
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-[11px] text-muted-foreground/40 text-center py-4">No se encontraron empresas</p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <CompanyActionGuard
        open={!!pendingCompanyId && pendingCompanyId !== selectedCompanyId}
        onOpenChange={(v) => { if (!v) setPendingCompanyId(null); }}
        title="Cambiar de empresa"
        description="Estás a punto de cambiar el contexto a otra empresa. Confirma tu contraseña para continuar."
        requirePassword
        onConfirm={() => {
          if (pendingCompanyId) setSelectedCompanyId(pendingCompanyId);
          setPendingCompanyId(null);
        }}
      />
    </>
  );
}
