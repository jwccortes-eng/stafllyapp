/**
 * OX-8 — ONE STAFLY. Cabecera canónica de pantalla.
 *
 * Toda pantalla de Stafly responde tres preguntas, en este orden y sin ruido:
 *
 *   1. ¿Dónde estoy?      → empresa anfitriona + título
 *   2. ¿Qué está pasando? → una sola línea de contexto
 *   3. ¿Qué debo hacer?   → una sola acción protagonista
 *
 * La empresa no es un tenant ni un selector: es la organización donde estoy
 * trabajando, y aparece siempre primero, viva, con su logo y su color.
 *
 * Sólo presentación. No lee ni escribe operación, payroll ni asignaciones.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/hooks/useCompany";
import { CompanyLogo } from "@/components/ui/company-logo";
import { OX_HEADER, OX_SCREEN_X } from "@/lib/ox/continuity";

interface Props {
  /** ¿Dónde estoy? */
  title: string;
  /** ¿Qué está pasando? Una línea, sin jerga. */
  context?: ReactNode;
  /** ¿Qué debo hacer? Una acción protagonista (más overflow si hace falta). */
  action?: ReactNode;
  /** Oculta la presencia de empresa (pantallas de plataforma / sin tenant). */
  hideHost?: boolean;
  /** Aplica la respiración horizontal canónica. */
  padded?: boolean;
  className?: string;
}

export function OperationalScreenHeader({
  title,
  context,
  action,
  hideHost = false,
  padded = false,
  className,
}: Props) {
  const { selectedCompany, isGlobalMode } = useCompany();

  const showHost = !hideHost && (isGlobalMode || !!selectedCompany);
  const hostLabel = isGlobalMode
    ? "Vista global"
    : selectedCompany?.name ?? "";

  return (
    <header
      className={cn(
        // Móvil: identidad completa arriba, acción debajo (nunca compiten por el ancho).
        // Desktop: identidad a la izquierda, acción protagonista a la derecha.
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        padded && OX_SCREEN_X,
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {showHost && !isGlobalMode && selectedCompany ? (
          <CompanyLogo
            name={selectedCompany.name}
            logoUrl={selectedCompany.logo_url}
            brandColor={selectedCompany.brand_color}
            size="lg"
            active
            glow
            className="shrink-0"
          />
        ) : null}

        <div className="min-w-0 flex-1">
          {showHost && hostLabel ? (
            <p className={cn(OX_HEADER.host, "truncate")}>{hostLabel}</p>
          ) : null}
          <h1 className={OX_HEADER.title}>{title}</h1>
          {context ? (
            <div className={cn(OX_HEADER.context, "mt-0.5")}>{context}</div>
          ) : null}
        </div>
      </div>

      {action ? (
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {action}
        </div>
      ) : null}
    </header>
  );
}


export default OperationalScreenHeader;
