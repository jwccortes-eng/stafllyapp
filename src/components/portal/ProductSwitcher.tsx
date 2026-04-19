import { useNavigate } from "react-router-dom";
import { ChevronDown, Briefcase, Radio, ArrowLeftRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ProductSwitcherProps {
  compact?: boolean;
}

/**
 * ProductSwitcher — Dropdown del header del portal del trabajador.
 *
 * Permite alternar entre:
 *  - Stafly Portal (operativo: turnos, clock, pagos) — actual
 *  - Comunidad Parceros (social: canales, oportunidades)
 *
 * No reemplaza navegación interna del portal — solo cambia de producto.
 */
export function ProductSwitcher({ compact = false }: ProductSwitcherProps) {
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 rounded-xl bg-muted/50 hover:bg-muted active:scale-[0.97] transition-all text-xs font-semibold text-foreground border border-border/30",
            compact ? "h-8 px-2" : "h-9 px-3"
          )}
          aria-label="Cambiar de producto"
        >
          <ArrowLeftRight className={cn("text-muted-foreground", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
          {!compact && <span className="hidden sm:inline">Cambiar</span>}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
          Cambiar de producto
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem disabled className="flex items-start gap-3 py-2.5 opacity-100 focus:bg-transparent">
          <div className="h-9 w-9 rounded-lg bg-primary/12 flex items-center justify-center shrink-0 mt-0.5 ring-1 ring-primary/20">
            <Briefcase className="h-[18px] w-[18px] text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold leading-tight text-foreground">Stafly Portal</p>
              <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                Aquí
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              Mis turnos, fichaje y pagos
            </p>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => navigate("/parceros")}
          className="flex items-start gap-3 py-2.5 cursor-pointer focus:bg-accent/50"
        >
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 shadow-md"
            style={{
              background:
                "linear-gradient(135deg, hsl(8 95% 64%), hsl(14 100% 70%) 50%, hsl(35 100% 62%))",
            }}
          >
            <Radio className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-foreground">
              Comunidad Parceros
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              Canales, oportunidades, flash jobs
            </p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
