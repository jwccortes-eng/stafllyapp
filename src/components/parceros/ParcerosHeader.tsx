import { useNavigate } from "react-router-dom";
import { Radio, ChevronDown, Briefcase, ArrowLeftRight, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";

interface ParcerosHeaderProps {
  /** Optional eyebrow / pre-title shown above the brand */
  eyebrow?: string;
  /** Optional override for the page title */
  title?: string;
  subtitle?: string;
  /** Right side actions */
  rightSlot?: React.ReactNode;
  /** Show the live indicator dot */
  showLive?: boolean;
}

/**
 * Parceros — Brand header.
 * Identidad visual propia (coral + dark). Incluye switch de producto
 * para volver al portal Stafly. NO usa la sidebar admin.
 */
export function ParcerosHeader({
  eyebrow,
  title = "Parceros",
  subtitle = "Tu comunidad de trabajo",
  rightSlot,
  showLive = true,
}: ParcerosHeaderProps) {
  const navigate = useNavigate();
  const { signOut, employeeId } = useAuth();

  return (
    <header
      className="relative overflow-hidden text-foreground px-4 pt-6 pb-5 safe-top border-b border-border/30"
      style={{ background: "var(--gradient-parceros-dark)" }}
    >
      {/* Decorative coral glow */}
      <div
        className="absolute -top-20 -right-10 h-56 w-56 rounded-full opacity-30 blur-3xl pointer-events-none"
        style={{ background: "hsl(var(--parceros-coral))" }}
      />
      <div
        className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: "hsl(var(--parceros-amber))" }}
      />

      <div className="relative max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/90 mb-1.5">
                {eyebrow}
              </p>
            )}
            <div className="flex items-center gap-2.5">
              {/* Brand mark */}
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center shadow-lg"
                style={{ background: "var(--gradient-parceros)" }}
              >
                <Radio className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-heading font-black tracking-tight text-foreground leading-none">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-[11px] text-muted-foreground mt-1 truncate">{subtitle}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {showLive && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/40 border border-border/40 backdrop-blur-md">
                <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                <span className="text-[10px] font-semibold text-foreground/80">EN VIVO</span>
              </div>
            )}

            {rightSlot}

            {/* Product switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-card/50 hover:bg-card/70 border border-border/40 backdrop-blur-md text-xs font-semibold text-foreground transition-all active:scale-[0.97]"
                  aria-label="Cambiar de producto"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Cambiar</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 parceros-brand">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Cambiar de producto
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate("/portal")}
                  disabled={!employeeId}
                  className="flex items-start gap-3 py-2.5 cursor-pointer"
                >
                  <div className="h-8 w-8 rounded-lg bg-info/15 flex items-center justify-center shrink-0 mt-0.5">
                    <Briefcase className="h-4 w-4 text-info" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">Stafly Portal</p>
                    <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                      Mis turnos, fichaje y pagos
                    </p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="flex items-start gap-3 py-2.5 opacity-100">
                  <div
                    className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "var(--gradient-parceros)" }}
                  >
                    <Radio className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold leading-tight">Comunidad Parceros</p>
                      <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                        Aquí
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                      Canales, oportunidades, flash jobs
                    </p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <LogoutConfirmDialog onConfirm={signOut}>
                  <button className="w-full flex items-center gap-2 px-2 py-2 rounded text-xs text-destructive hover:bg-destructive/10 transition-colors">
                    <LogOut className="h-3.5 w-3.5" />
                    Cerrar sesión
                  </button>
                </LogoutConfirmDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
