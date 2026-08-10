/**
 * Estado visual canónico del Cliente para superficies de planificación.
 * Módulo PURO: sólo traduce `clients.status` al lenguaje del Unified Entity
 * Design System. No lee datos, no muta nada, no define colores nuevos.
 */

import type { EntityStatusTone } from "@/lib/entities/entity-identity";

export function clientStatusTone(status?: string | null): EntityStatusTone {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "blocked" || s === "suspended") return "blocked";
  if (s === "archived" || s === "inactive") return "historical";
  if (s === "prospect" || s === "pending" || s === "on_hold") return "attention";
  return "operational";
}

export function clientStatusLabel(status?: string | null): string {
  const s = (status ?? "").trim().toLowerCase();
  switch (s) {
    case "blocked":
    case "suspended":
      return "Bloqueado";
    case "archived":
      return "Archivado";
    case "inactive":
      return "Inactivo";
    case "prospect":
      return "Prospecto";
    case "pending":
      return "Pendiente";
    case "on_hold":
      return "En pausa";
    default:
      return "Activo";
  }
}
