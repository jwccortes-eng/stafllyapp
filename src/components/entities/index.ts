/**
 * UNIFIED ENTITY DESIGN SYSTEM — punto de entrada único.
 *
 * REGLA DE PRODUCTO
 *  Nadie crea una tarjeta nueva para representar Personas, Clientes, Lugares
 *  o Partners. Toda superficie (actual o futura: Parceros, Bookings, Comunidad,
 *  Campañas, Proveedores) consume EntityCard desde aquí.
 */
export { EntityCard, EntityBadgePill } from "./EntityCard";
export type { EntityCardProps, EntityCardDensity } from "./EntityCard";

export {
  ENTITY_PREFIX,
  ENTITY_LABEL,
  ENTITY_BADGE_CLASSES,
  formatEntityRef,
  getEntityStatusColor,
  sortEntityBadges,
  entityInitials,
} from "@/lib/entities/entity-identity";
export type {
  EntityKind,
  EntityStatusTone,
  EntityStatusColor,
  EntityBadgeSpec,
  EntityBadgeTone,
} from "@/lib/entities/entity-identity";

export {
  buildWorkerEntityView,
  buildClientEntityView,
  buildVenueEntityView,
  buildPartnerEntityView,
} from "@/lib/entities/entity-presenters";
export type {
  EntityView,
  WorkerEntityInput,
  WorkerEntitySignals,
  ClientEntityInput,
  VenueEntityInput,
  PartnerEntityInput,
} from "@/lib/entities/entity-presenters";
