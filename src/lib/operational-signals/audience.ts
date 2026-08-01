import type {
  AudienceMember,
  NotificationFamily,
  SignalContext,
} from "./types";

interface AudienceResult {
  recommended: AudienceMember[];
  excluded: AudienceMember[];
}

function push(
  target: AudienceMember[],
  ids: string[] | undefined,
  role: AudienceMember["role"],
  reason: string,
): void {
  for (const userId of ids ?? []) {
    if (!target.some((m) => m.userId === userId && m.role === role)) {
      target.push({ userId, role, reason });
    }
  }
}

/**
 * Contextual audience resolution. PURE — no queries, no sends.
 * Every inclusion and exclusion carries an explicit reason.
 */
export function resolveAudience(
  family: NotificationFamily,
  ctx: SignalContext,
): AudienceResult {
  const recommended: AudienceMember[] = [];
  const excluded: AudienceMember[] = [];

  // Universal exclusions: removed workers, other tenants.
  push(
    excluded,
    ctx.removedWorkerIds,
    "assigned_worker",
    "removido del turno: ya no participa en la operación",
  );

  const workers = (ctx.activeAssignedWorkerIds ?? []).filter(
    (id) => !(ctx.removedWorkerIds ?? []).includes(id),
  );

  switch (family) {
    case "meeting_point":
    case "transportation":
      push(recommended, workers, "assigned_worker", "debe presentarse en el punto correcto");
      push(recommended, ctx.captainUserIds, "captain", "coordina la llegada del equipo");
      push(recommended, ctx.supervisorUserIds, "supervisor", "responsable operativo del turno");
      if (family === "transportation") {
        push(
          recommended,
          ctx.transportCoordinatorUserIds,
          "transport_coordinator",
          "gestiona el transporte del turno",
        );
      }
      break;

    case "assignment":
    case "shift_change":
    case "cancellation":
    case "replacement":
      push(recommended, workers, "assigned_worker", "su compromiso de trabajo cambia");
      push(recommended, ctx.captainUserIds, "captain", "debe reajustar el equipo del turno");
      if (family === "replacement") {
        push(recommended, ctx.dispatcherUserIds, "dispatcher", "debe cubrir la vacante");
      }
      break;

    case "no_show":
    case "clock_in":
    case "attendance":
      push(recommended, ctx.captainUserIds, "captain", "responsable directo de asistencia");
      push(recommended, ctx.dispatcherUserIds, "dispatcher", "puede reasignar cobertura");
      if (family === "no_show") {
        push(
          recommended,
          ctx.operationsManagerUserIds,
          "operations_manager",
          "riesgo de incumplimiento con el cliente",
        );
      }
      push(
        excluded,
        workers,
        "assigned_worker",
        "no requiere acción del resto del equipo: evita ruido masivo",
      );
      break;

    case "incident":
      push(recommended, ctx.captainUserIds, "captain", "presente en sitio");
      push(recommended, ctx.supervisorUserIds, "supervisor", "debe intervenir");
      push(
        recommended,
        ctx.operationsManagerUserIds,
        "operations_manager",
        "responsable de escalamiento",
      );
      break;

    case "payroll_exception":
      push(
        recommended,
        ctx.payrollReviewerUserIds,
        "payroll_reviewer",
        "autorizado para revisar la excepción",
      );
      push(
        excluded,
        workers,
        "assigned_worker",
        "no requiere acción del trabajador: se resuelve en Centro de Validación",
      );
      break;

    case "general_information":
    default:
      push(recommended, workers, "assigned_worker", "información contextual del turno");
      break;
  }

  return { recommended, excluded };
}
