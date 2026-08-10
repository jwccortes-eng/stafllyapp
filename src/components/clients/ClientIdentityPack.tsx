/**
 * P1 — CLIENT IDENTITY PACK
 * =========================
 * Bloque compacto y ÚNICO de identidad del Cliente. Se reutiliza en detalle /
 * Passport, Client Truth, revisión de clientes, drawer de Servicio y cualquier
 * vista administrativa futura.
 *
 * REGLAS
 *  · No es un dashboard: identidad + señales mínimas, nada más.
 *  · El color viene de `clientAccentColor(clientId)` (token canónico) y es
 *    IDENTIDAD. Los estados conservan sus propios colores (verde/ámbar/rojo).
 *  · Nunca se identifica al cliente sólo por color: siempre nombre, avatar y
 *    referencia CL-XXXXXX.
 *  · Componente de presentación puro: no lee datos, no escribe nada.
 */

import { memo } from "react";
import { cn } from "@/lib/utils";
import { ClientAvatar } from "@/components/entities/ClientAvatar";
import { clientAccentColor, clientAccentSoft } from "@/lib/clients/client-accent";
import { clientStatusLabel, clientStatusTone } from "@/lib/clients/client-entity-status";
import { ENTITY_BADGE_CLASSES, getEntityStatusColor } from "@/lib/entities/entity-identity";

export interface ClientIdentityPackProps {
  clientId: string;
  name: string;
  /** Referencia canónica ya formateada (CL-XXXXXX). */
  reference?: string | null;
  logoUrl?: string | null;
  /** `clients.status` crudo; se traduce con el lenguaje del design system. */
  status?: string | null;
  /** Venue principal; si no hay, se muestra el conteo. */
  primaryVenue?: string | null;
  venueCount?: number;
  /** Señales de calidad de datos (contacto, duplicados…). */
  dataQualityLabel?: string | null;
  dataQualityTone?: "info" | "warning" | "critical";
  /** Estado de mapeo Connecteam, sólo cuando aplique. */
  connecteamStatus?: "configured" | "pending" | null;
  actions?: React.ReactNode;
  className?: string;
  /** Variante para cabeceras estrechas (drawer de Servicio). */
  density?: "comfortable" | "compact";
}

function Chip({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "warning" | "critical";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-medium leading-tight",
        ENTITY_BADGE_CLASSES[tone],
      )}
    >
      {children}
    </span>
  );
}

function ClientIdentityPackImpl({
  clientId,
  name,
  reference,
  logoUrl,
  status,
  primaryVenue,
  venueCount,
  dataQualityLabel,
  dataQualityTone = "warning",
  connecteamStatus,
  actions,
  className,
  density = "comfortable",
}: ClientIdentityPackProps) {
  const accent = clientAccentColor(clientId);
  const accentSoft = clientAccentSoft(clientId, 0.08);
  const tone = clientStatusTone(status);
  const statusColor = getEntityStatusColor(tone);

  const venueLine =
    primaryVenue ??
    (typeof venueCount === "number"
      ? venueCount === 0
        ? "Sin lugares"
        : `${venueCount} lugar${venueCount === 1 ? "" : "es"}`
      : null);

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 overflow-hidden rounded-2xl border border-border/50 bg-card",
        density === "compact" ? "p-2.5 pl-4" : "p-3.5 pl-5",
        className,
      )}
      style={accentSoft ? { backgroundImage: `linear-gradient(90deg, ${accentSoft}, transparent 55%)` } : undefined}
    >
      {accent ? (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[4px]"
          style={{ backgroundColor: accent }}
        />
      ) : null}

      <ClientAvatar
        name={name}
        clientId={clientId}
        logoUrl={logoUrl}
        size={density === "compact" ? "md" : "lg"}
        className={cn("ring-2 ring-offset-2 ring-offset-background", statusColor.ring)}
      />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate font-semibold leading-tight",
            density === "compact" ? "text-[13px]" : "text-[15px]",
          )}
        >
          {name}
        </p>

        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
          {reference ? <span className="shrink-0 font-mono tabular-nums">{reference}</span> : null}
          {reference ? <span className="text-muted-foreground/40">•</span> : null}
          <span className="shrink-0">{clientStatusLabel(status)}</span>
          {venueLine ? (
            <>
              <span className="text-muted-foreground/40">•</span>
              <span className="truncate">{venueLine}</span>
            </>
          ) : null}
        </p>

        {(dataQualityLabel || connecteamStatus) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {dataQualityLabel ? <Chip tone={dataQualityTone}>{dataQualityLabel}</Chip> : null}
            {connecteamStatus ? (
              <Chip tone={connecteamStatus === "configured" ? "info" : "warning"}>
                {connecteamStatus === "configured" ? "Connecteam listo" : "Connecteam sin mapear"}
              </Chip>
            ) : null}
          </div>
        )}
      </div>

      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  );
}

export const ClientIdentityPack = memo(ClientIdentityPackImpl);
export default ClientIdentityPack;
