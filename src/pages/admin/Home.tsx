/**
 * Unification Wave 1 — Home.
 *
 * Home y Today Hub dejan de ser dos productos distintos: en desktop Home ES el
 * Today Hub, con la misma gramática del Centro de Validación
 * (identidad → contexto → atención → consecuencia → acción).
 *
 * Sólo presentación. No toca lógica, backend, payroll, RLS ni tenants.
 * El panel clásico sigue disponible en /app/dashboard-classic.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { MT, MT_EYEBROW } from "@/lib/mobile/mobile-scale";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { CompanyLogo } from "@/components/ui/company-logo";
import { Button } from "@/components/ui/button";
import TodayHubView from "@/components/command-center/TodayHubView";
import MobileAdminHome from "./MobileAdminHome";

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default function AdminHome() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { selectedCompany, isGlobalMode } = useCompany();
  const { fullName } = useAuth();

  const now = useMemo(() => new Date(), []);
  const firstName = (fullName || "").split(" ")[0];

  if (isMobile) return <MobileAdminHome />;

  const companyLabel = isGlobalMode
    ? "Vista global"
    : selectedCompany?.name || "Sin compañía seleccionada";

  return (
    <div className="pt-6">
      <header className="px-6 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {!isGlobalMode && selectedCompany ? (
              <CompanyLogo
                name={selectedCompany.name}
                logoUrl={selectedCompany.logo_url}
                brandColor={selectedCompany.brand_color}
                size="lg"
                active
                glow
              />
            ) : null}
            <div className="min-w-0">
              <p className={cn(MT_EYEBROW, "text-muted-foreground truncate")}>
                {companyLabel} · {format(now, "EEEE d 'de' MMMM", { locale: es })}
              </p>
              <h1 className="text-[22px] font-semibold tracking-tight leading-tight truncate">
                {greetingFor(now)}
                {firstName ? `, ${firstName}` : ""}.
              </h1>
              <p className={cn(MT.caption, "text-muted-foreground")}>
                Esto es lo que necesita tu atención hoy. Lo demás ya está cubierto.
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            className="gap-1.5 text-muted-foreground"
            onClick={() => navigate("/app/dashboard-classic")}
          >
            Ver panel clásico
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <TodayHubView />
    </div>
  );
}
