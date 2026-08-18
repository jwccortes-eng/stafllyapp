/**
 * CLAIM RESOLUTION — copy único para la ruta canónica de aprobación.
 *
 * La resolución de solicitudes (claim/request) viaja SIEMPRE por
 * `resolveShiftRequest` → RPC `resolve_shift_request` → `assign_worker_to_shift`.
 * Este módulo sólo traduce los errores canónicos del backend a lenguaje
 * operativo: no valida, no cuenta capacidad, no decide nada.
 */
export function claimResolutionErrorCopy(raw?: string): string {
  const m = (raw ?? "").toLowerCase();
  if (m.includes("no_capacity")) return "Sin cupo disponible: el servicio ya está cubierto.";
  if (m.includes("solapa")) return "La persona ya tiene otro servicio que se solapa en ese horario.";
  if (m.includes("already_assigned")) return "La persona ya está asignada a este servicio.";
  if (m.includes("compliance_override_required")) return "Falta documentación: requiere autorización para asignar.";
  if (m.includes("compliance_blocked")) return "La persona no cumple los requisitos para ser asignada.";
  if (m.includes("employee_inactive")) return "La persona está inactiva en esta empresa.";
  if (m.includes("tenant_mismatch") || m.includes("wrong_company")) return "La persona y el servicio pertenecen a empresas distintas.";
  if (m.includes("shift_cancelled")) return "El servicio está cancelado.";
  if (m.includes("shift_not_found")) return "El servicio ya no existe.";
  if (m.includes("request_not_pending")) return "La solicitud ya fue resuelta. Actualiza la vista.";
  if (m.includes("forbidden")) return "No tienes permiso para resolver solicitudes en esta empresa.";
  return raw || "No se pudo procesar la solicitud.";
}
