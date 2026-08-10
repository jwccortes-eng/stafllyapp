/**
 * CLIENT TRUTH LAYER V1 — tarjeta de directorio.
 *
 * UNIFIED ENTITY DESIGN SYSTEM: esta tarjeta NO define diseño propio.
 * Consume el componente canónico EntityCard igual que Workers, Venues y
 * Partners. La calidad de datos NUNCA se presenta como error.
 */
import { ExternalLink, Pencil, Phone, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EntityCard } from "@/components/entities/EntityCard";
import { buildClientEntityView } from "@/lib/entities/entity-presenters";
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

const ACTION_BTN =
  "inline-flex items-center justify-center h-7 w-7 rounded-lg transition-colors";

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

  const view = buildClientEntityView({
    clientId: truth.clientId,
    humanReference: truth.humanReference,
    canonicalName: formatDisplayText(truth.canonicalName, "name"),
    isActive: truth.isActive,
    lifecycle: truth.lifecycle,
    primaryContactName: truth.primaryContact
      ? formatPersonName(truth.primaryContact.name)
      : null,
    hasPrimaryContact: truth.dataQuality.hasPrimaryContact,
    venueCount: truth.venues.length,
    connecteamConfigured: truth.connecteamMappingStatus === "configured",
    duplicateWarnings: truth.duplicateWarnings.length,
  });

  return (
    <EntityCard
      kind="client"
      name={view.name}
      reference={view.reference}
      primaryDetail={view.primaryDetail ?? "Sin contacto principal"}
      status={view.status}
      statusLabel={view.statusLabel}
      badges={view.badges}
      onClick={onOpen}
      className={cn(highlighted && "ring-2 ring-primary/50")}
      actions={
        <>
          {phone && (
            <a
              href={`tel:${phone}`}
              className={cn(ACTION_BTN, "text-earning hover:bg-earning/10")}
              aria-label={`Llamar a ${view.name}`}
            >
              <Phone className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={onOpen}
            className={cn(ACTION_BTN, "text-primary hover:bg-primary/10")}
            aria-label="Abrir cliente"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          {canEdit && truth.lifecycle !== "archived" && (
            <button
              type="button"
              onClick={onEdit}
              className={cn(ACTION_BTN, "text-muted-foreground hover:bg-muted")}
              aria-label="Editar cliente"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {canDelete && truth.lifecycle !== "archived" && (
            <button
              type="button"
              onClick={onArchive}
              className={cn(ACTION_BTN, "text-destructive hover:bg-destructive/10")}
              aria-label="Archivar cliente"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {truth.lifecycle === "archived" && canEdit && (
            <button
              type="button"
              onClick={onRestore}
              className={cn(ACTION_BTN, "text-primary hover:bg-primary/10")}
              aria-label="Restaurar cliente"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      }
    />
  );
}

export default ClientDirectoryCard;
