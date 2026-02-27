import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export interface DashboardWidget {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  order: number;
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: "kpis", label: "KPIs principales", description: "Empleados, pagos, novedades y pendientes", enabled: true, order: 0 },
  { id: "quick_actions", label: "Accesos rápidos", description: "Atajos a las acciones más comunes", enabled: true, order: 1 },
  { id: "chart", label: "Tendencia de pagos", description: "Gráfico de barras por periodo", enabled: true, order: 2 },
  { id: "announcements", label: "Comunicados", description: "Últimos anuncios publicados", enabled: true, order: 3 },
  { id: "activity", label: "Actividad reciente", description: "Timeline de acciones recientes", enabled: true, order: 4 },
  { id: "period_banner", label: "Estado de periodos", description: "Banner resumen de periodos abiertos/cerrados", enabled: true, order: 5 },
];

const STORAGE_KEY = "dashboard-widgets";

function getStorageKey(userId?: string) {
  return `${STORAGE_KEY}-${userId ?? "anon"}`;
}

export function useDashboardWidgets() {
  const { user } = useAuth();
  const [widgets, setWidgets] = useState<DashboardWidget[]>(DEFAULT_WIDGETS);

  useEffect(() => {
    const saved = localStorage.getItem(getStorageKey(user?.id));
    if (saved) {
      try {
        const parsed: DashboardWidget[] = JSON.parse(saved);
        // Merge with defaults to handle new widgets added in updates
        const merged = DEFAULT_WIDGETS.map(dw => {
          const found = parsed.find(p => p.id === dw.id);
          return found ? { ...dw, enabled: found.enabled, order: found.order } : dw;
        });
        merged.sort((a, b) => a.order - b.order);
        setWidgets(merged);
      } catch {
        setWidgets(DEFAULT_WIDGETS);
      }
    }
  }, [user?.id]);

  const persist = useCallback((next: DashboardWidget[]) => {
    localStorage.setItem(getStorageKey(user?.id), JSON.stringify(next));
    setWidgets(next);
  }, [user?.id]);

  const toggleWidget = useCallback((id: string) => {
    const next = widgets.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w);
    persist(next);
  }, [widgets, persist]);

  const moveWidget = useCallback((id: string, direction: "up" | "down") => {
    const idx = widgets.findIndex(w => w.id === id);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= widgets.length) return;
    const next = [...widgets];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    next.forEach((w, i) => w.order = i);
    persist(next);
  }, [widgets, persist]);

  const resetWidgets = useCallback(() => {
    persist([...DEFAULT_WIDGETS]);
  }, [persist]);

  const enabledWidgets = widgets.filter(w => w.enabled);

  return { widgets, enabledWidgets, toggleWidget, moveWidget, resetWidgets };
}
