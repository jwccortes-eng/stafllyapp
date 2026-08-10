# P0 — SERVICE COMMAND CENTER

Fecha: 2026-08-10 · Alcance: UI-only sobre el editor de Servicio (Command Center).

Servicios deja de ser un formulario: el editor recomienda UNA cosa, la explica con
contexto y ofrece la acción que la resuelve.

## 1. Acciones resolutivas

`getServiceCopilot` ahora devuelve `nextStep.action`:

| Tipo | Cuándo | Ejemplo |
| --- | --- | --- |
| `focus` | La sección vive en el editor | Confirmar cliente, Asignar personas, Publicar |
| `link` | La resolución vive en otra superficie canónica | Cerrar clock-out → `/app/timeclock`, Revisar horas → `/app/payroll-review-queue`, Preparar Payroll → Centro de Validación |

Si no hay acción posible, no se muestra botón (nada de callejones sin salida).
La pista "cierra el modal para asignar" desaparece del selector de equipo.

## 2. Cero falsos positivos

- Transporte OFF → Meeting Point es `na`, nunca se recomienda.
- Borrador o sin equipo → los ítems de fichaje son `na` aunque la fecha haya pasado.
- Sin clock-in registrado → no se exige clock-out; se recomienda "Revisar asistencia".
- Servicio cancelado/archivado → sin acciones, banda `closed`.

## 3. Un solo resumen operativo

Con copiloto activo, `WorkspaceSummary` muestra únicamente el bloque del copiloto;
semáforo, descriptor de publicación y tarjeta de readiness quedan ocultos y el
detalle operativo (`ShiftSummaryPanel`) vive plegado en "Ver detalle operativo".

## 4. Contexto en la recomendación

Cada `nextStep` trae chips: Servicio (QK) · Cliente · Fecha · Horario · Cobertura,
con tono `attention` cuando el dato es el que bloquea.

## 5. Staffing inteligente

`SmartStaffingPanel` (etapa Equipo) rankea con `rankCandidate` — historial con el
cliente, reputación, disponibilidad, conflictos y preferencias — y asigna con la
RPC existente `assign_worker_to_shift` sin salir del Servicio.
Las señales se cargan con el hook único `useRecommendationSignals`, extraído del
hub móvil (`MobileShiftTeamHub` perdió ~260 líneas duplicadas).

## Archivos

| Archivo | Cambio |
| --- | --- |
| `src/lib/shifts/service-copilot.ts` | Acciones resolutivas, chips de contexto, guardas anti falso positivo |
| `src/hooks/useRecommendationSignals.ts` | Nuevo — señales de recomendación compartidas |
| `src/components/shifts/copilot/SmartStaffingPanel.tsx` | Nuevo — asignación asistida en el editor |
| `src/components/shifts/copilot/ServiceCopilotPanel.tsx` | CTA resolutivo + grid de contexto |
| `src/components/shifts/ShiftEditDialog.tsx` | Compone contexto y etapa de staffing |
| `src/components/shifts/ShiftFormFields.tsx` | Etapa `staffing` en el layout por etapas |
| `src/components/shifts/form/TeamSection.tsx` | `hideAssignHint` |
| `src/components/shifts/workspace/WorkspaceSummary.tsx` | Detalle operativo plegado |
| `src/test/service-copilot.test.ts` | 16 pruebas (6 nuevas del Command Center) |

## QA

`vitest run src/test/service-copilot.test.ts` → 16/16. Suite completa: 1062 pasan;
el único rojo es `driver-sync-roundtrip` (deuda previa documentada).
Typecheck limpio. Preview sin errores de runtime.

## Fuera de alcance

Payroll · Time Entries · RLS · Edge Functions · lógica financiera · migraciones.
Cero cambios de esquema.
