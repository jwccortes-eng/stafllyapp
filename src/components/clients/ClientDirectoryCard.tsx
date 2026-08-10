/**
 * CLIENT TRUTH LAYER V1 — tarjeta de directorio.
 *
 * Muestra la verdad del cliente: identidad estable, estado, contacto
 * principal, lugares, actividad reciente, calidad de datos y Connecteam.
 * La calidad de datos NUNCA se presenta como error.
 */
import { Building2, ExternalLink, Mail, MapPin, Pencil, Phone, RotateCcw, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ClientAvatar } from "@/components/ui/client-avatar";
import { formatDisplayText, formatPersonName } from "@/lib/format-helpers";
import type { ClientTruth } from "@/lib/clients/client-truth";

interface Props {
  truth: ClientTruth;
  highlighted?: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}

export function ClientDirectoryCard({
  truth,
  highlighted,
  canEdit,
  canDelete,
  onOpen,
  onEdit,
  onArchive,
  onRestore,
}: Props) {
  const phone = (truth.primaryContact?.phone ?? "").replace(/[^+\d]/g, "");

  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-border/40 bg-card p-4 shadow-xs hover:shadow-md transition-all overflow-hidden",
        !truth.isActive && "opacity-70 border-dashed",
        highlighted && "ring-2 ring-primary/50",
      )}
    >
      <button type="button" onClick={onOpen} className="relative z-10 flex items-start gap-3 w-full text-left">
        <ClientAvatar name={truth.canonicalName} size="lg" />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-bold truncate leading-tight">
            {formatDisplayText(truth.canonicalName, "name")}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="font-mono text-[10px] text-muted-foreground">{truth.humanReference}</span>
            <Badge
              variant={truth.isActive ? "default" : "secondary"}
              className="text-[9px] px-1.5 py-0"
            >
              {truth.lifecycle === "active" ? "Activo" : truth.lifecycle === "archived" ? "Archivado" : "Inactivo"}
            </Badge>
          </div>

          <div className="mt-2 space-y-0.5">
            <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
              <Users className="h-3 w-3 shrink-0" />
              {truth.primaryContact ? formatPersonName(truth.primaryContact.name) : "Sin contacto principal"}
            </p>
            {truth.primaryContact?.email && (
              <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                <Mail className="h-3 w-3 shrink-0" /> {truth.primaryContact.email}
              </p>
            )}
            {truth.primaryContact?.phone && (
              <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                <Phone className="h-3 w-3 shrink-0" /> {truth.primaryContact.phone}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              {truth.venues.length === 0 ? "Sin lugar asociado" : `${truth.venues.length} lugar(es)`}
            </p>
            <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
              <Building2 className="h-3 w-3 shrink-0" />
              {truth.serviceCount} servicio(s)
              {truth.lastServiceAt ? ` · último ${truth.lastServiceAt}` : ""}
            </p>
          </div>
        </div>
      </button>

      <div className="relative z-10 mt-3 pt-3 border-t border-border/30 space-y-2">
        <div className="flex items-center justify-between gap-2 text-[10px]">
          <span className="text-muted-foreground">
            Connecteam:{" "}
            {truth.connecteamMappingStatus === "configured" ? "✓ destino configurado" : "⚠ falta mapping"}
          </span>
          <span className="text-muted-foreground">{truth.dataQuality.completenessPct}%</span>
        </div>

        {truth.dataQuality.gaps.length > 0 && (
          <p className="text-[10px] text-muted-foreground">
            Pendiente: {truth.dataQuality.gaps.map((g) => g.label).join(", ")}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {phone && (
            <a
              href={`tel:${phone}`}
              className="flex-1 min-w-[3.5rem] flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-semibold bg-earning/10 text-earning hover:bg-earning/20 transition-colors"
            >
              <Phone className="h-3 w-3" /> Llamar
            </a>
          )}
          <button
            onClick={onOpen}
            className="flex-1 min-w-[3.5rem] flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <ExternalLink className="h-3 w-3" /> Abrir
          </button>
          {canEdit && truth.lifecycle !== "archived" && (
            <button
              onClick={onEdit}
              className="flex-1 min-w-[3.5rem] flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-semibold bg-muted/40 hover:bg-muted/70 transition-colors"
            >
              <Pencil className="h-3 w-3" /> Editar
            </button>
          )}
          {canDelete && truth.lifecycle !== "archived" && (
            <button
              onClick={onArchive}
              className="flex-1 min-w-[3.5rem] flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
            >
              <Trash2 className="h-3 w-3" /> Archivar
            </button>
          )}
          {truth.lifecycle === "archived" && canEdit && (
            <button
              onClick={onRestore}
              className="flex-1 min-w-[3.5rem] flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              <RotateCcw className="h-3 w-3" /> Restaurar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ClientDirectoryCard;
