/**
 * service-focus — puente único entre "siguiente paso" y la sección del editor.
 *
 * El editor está organizado por etapas, así que la sección objetivo puede estar
 * en una etapa que no es la visible. `requestServiceFocus` emite un evento que
 * el layout de etapas escucha para cambiar de etapa y luego enfocar el ancla.
 * Si nadie escucha (editor plano, móvil), cae al scroll directo de siempre.
 *
 * UI-only. Sin estado global, sin BD.
 */
import { focusServiceSection } from "./service-publish-readiness";

export const SERVICE_TEAM_ANCHOR = "service-team-section";
export const SERVICE_PAY_ANCHOR = "service-pay-section";
export const SERVICE_INFO_ANCHOR = "service-info-section";

export const SERVICE_FOCUS_EVENT = "stafly:service-focus";

export function requestServiceFocus(anchorId: string): void {
  if (typeof window === "undefined") return;
  const event = new CustomEvent<{ anchorId: string; handled: boolean }>(SERVICE_FOCUS_EVENT, {
    detail: { anchorId, handled: false },
  });
  window.dispatchEvent(event);
  if (!event.detail.handled) focusServiceSection(anchorId);
}
