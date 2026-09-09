/**
 * "Requiere tu atención" — bloque compacto de acciones pendientes en Home.
 *
 * Presentacional puro: recibe `AttentionItem[]` y no consulta nada. Hoy solo
 * recibe comunicados oficiales pendientes de acuse; el mismo componente sirve
 * para futuras categorías sin crear otro bloque.
 *
 * No bloquea navegación, ni clock-in, ni turnos. No abre modales al entrar.
 */
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttentionItem } from "@/lib/portal/attention-items";

interface Props {
  items: AttentionItem[];
  className?: string;
}

export function AttentionRequiredCard({ items, className }: Props) {
  if (items.length === 0) return null;

  const anyCritical = items.some((i) => i.critical);

  return (
    <section
      aria-label="Requiere tu atención"
      className={cn(
        "rounded-2xl border-2 p-4 space-y-3",
        anyCritical
          ? "border-destructive/30 bg-destructive/[0.06]"
          : "border-primary/25 bg-primary/[0.05]",
        className,
      )}
    >
      <header className="flex items-center gap-2">
        <AlertTriangle
          className={cn("h-4 w-4 shrink-0", anyCritical ? "text-destructive" : "text-primary")}
        />
        <h2 className="text-sm font-semibold text-foreground">Requiere tu atención</h2>
        <span className="ml-auto text-[11px] font-semibold text-muted-foreground">
          {items.length} {items.length === 1 ? "pendiente" : "pendientes"}
        </span>
      </header>

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={item.to}
              className="flex items-center gap-3 rounded-xl bg-card border border-border/50 px-3 py-3 min-h-[64px] transition-colors hover:bg-muted/40"
            >
              <span
                className={cn(
                  "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                  item.critical ? "bg-destructive/12" : "bg-primary/12",
                )}
              >
                <Megaphone
                  className={cn("h-4 w-4", item.critical ? "text-destructive" : "text-primary")}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {item.category}
                </span>
                {item.companyName && (
                  <span className="block text-[11px] text-muted-foreground truncate">
                    {item.companyName}
                  </span>
                )}
                <span className="block text-sm font-semibold text-foreground truncate">
                  {item.title}
                </span>
                <span
                  className={cn(
                    "block text-[11px] font-medium",
                    item.critical ? "text-destructive" : "text-primary",
                  )}
                >
                  {item.requirement}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
