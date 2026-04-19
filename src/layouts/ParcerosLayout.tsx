import { Outlet, useLocation, NavLink, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { Zap, Hash, Briefcase, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

/**
 * ParcerosLayout — Layout propio del producto Parceros.
 *
 * Características:
 * - Branding diferenciado (coral + dark) vía .parceros-brand
 * - Sin sidebar admin
 * - Sin bottom nav del portal Stafly
 * - Tab bar comunitaria propia (Radar / Canales / Flash Jobs)
 * - Header con switch de producto integrado en cada página
 *
 * El header NO se renderiza aquí — cada página lo monta para mantener
 * flexibilidad (channel detail, flash detail tienen header diferente).
 */
const TABS = [
  { to: "/parceros", icon: Zap, label: "Radar", end: true },
  { to: "/parceros/channels", icon: Hash, label: "Canales" },
  { to: "/parceros/flash", icon: Briefcase, label: "Flash Jobs" },
];

export default function ParcerosLayout() {
  const location = useLocation();
  const { user, loading } = useAuth();

  // Apply brand class to <html> while inside Parceros
  useEffect(() => {
    document.documentElement.classList.add("parceros-brand");
    return () => {
      document.documentElement.classList.remove("parceros-brand");
    };
  }, []);

  // Hide bottom tab nav on detail pages (channel/flash detail)
  const isDetailPage =
    location.pathname.includes("/channel/") ||
    location.pathname.includes("/flash/");

  if (loading) {
    return (
      <div className="parceros-brand min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="parceros-brand min-h-[100dvh] bg-background flex flex-col">
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>

      {/* Comunidad bottom tab bar — solo en páginas raíz */}
      {!isDetailPage && (
        <nav className="sticky bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom,8px),8px)] pt-2 bg-gradient-to-t from-background via-background/95 to-background/0">
          <div
            className="mx-auto max-w-md bg-card/90 backdrop-blur-2xl border border-border/40 rounded-[20px] shadow-[0_-4px_24px_-10px_rgba(0,0,0,0.4)]"
          >
            <div className="flex items-center justify-around h-[54px] px-1">
              {TABS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "relative flex flex-col items-center justify-center flex-1 h-full active:scale-[0.92] transition-transform duration-150 group",
                      isActive ? "text-primary" : "text-muted-foreground/55"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span
                          className="absolute top-0 h-0.5 w-7 rounded-full"
                          style={{ background: "hsl(var(--primary))" }}
                        />
                      )}
                      <item.icon
                        className="h-[19px] w-[19px]"
                        strokeWidth={isActive ? 2.5 : 1.75}
                      />
                      <span
                        className={cn(
                          "text-[9.5px] leading-none mt-1",
                          isActive ? "font-bold" : "font-semibold"
                        )}
                      >
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        </nav>
      )}
    </div>
  );
}
