# P0 — Stafly como espejo de la realidad operativa

Ciclo de vida de Servicios, staffing y exportación a Connecteam.
Fecha: 2026-08-09. Alcance: UI + helpers puros. Sin BD, sin migraciones.

## Principio

Stafly refleja el estado real de cada Servicio en cada momento. No inventa datos,
no exige información que todavía no existe y no mezcla los requisitos de una
acción con los de otra. PENDIENTE ≠ 0. APROXIMADO ≠ CONFIRMADO.

## 1. Readiness separados

Fuente única: `src/lib/shifts/service-lifecycle-readiness.ts`
(`getServiceLifecycleReadiness`). Cinco compuertas independientes:

| Compuerta | Exige |
|---|---|
| READY_TO_CREATE_DRAFT | empresa activa, fecha, referencia/descripción, origen trazable |
| READY_TO_STAFF | fecha, hora de inicio, lugar del servicio, cantidad/roles definidos |
| READY_TO_EXPORT_CONNECTEAM | fecha, inicio, fin (duración > 0), título, timezone, Job, capacidad |
| READY_TO_PUBLISH | reglas de `getServicePublishReadiness` (sin cambios) |
| READY_TO_CLOSE | operación finalizada y equipo registrado |

No se duplican reglas: publicar y exportar se delegan en
`getServiceOperationalReadiness`, que a su vez refleja `validateShiftForExport`.

## 2. Evidencia del template Connecteam

Revisado `src/lib/integrations/connecteam-export.ts` (`validateShiftForExport`).
Mínimo técnico real para crear el turno: Date, Start, End (distinto de Start),
Shift title, Timezone, Job y capacidad (`Number of users` o workers aceptados).
NO exige: workers asignados, meeting point, roles ni staffing completo.

Consecuencia: se agregaron a la capa canónica los blockers de export
`export.missing_end` y `export.zero_duration`, que antes solo bloqueaban la
publicación y dejaban pasar filas que Connecteam descartaba en silencio.

## 3. Caso real obligatorio

Input: `Imperial Aug 30/31 Sep 1/2/3/4/5/6/7 sin hora definida pero aprox 5pm
cantidad de meseros pendientes`.

Resultado: 9 borradores independientes, 9 QK únicos, `Aprox. 17:00` visible,
personal `Pendiente`. Cada uno se evalúa por separado:

- Stafly: BORRADOR
- Staffing: PENDIENTE (falta lugar y cantidad de personal)
- Connecteam: falta 1 dato (hora de fin)

Nada se inventa: no se rellena 0 workers, ni hora final, ni cliente, ni venue.

## 4. Calendario

`ServiceCalendarChip` muestra los tres estados separados: SERVICE STATE
(BORRADOR), STAFFING STATE (pendiente / N de M / completo) y CONNECTEAM STATE
(listo / faltan N datos), siempre con `QK-00XXXX`. "Vacante" no se usa como
identidad de Servicio.

## 5. CTA por acción

Cada compuerta tiene su CTA contextual: "Completar para staffing",
"Completar para Connecteam", "Completar para publicar". No hay validación
genérica única.

## 6. Exportación parcial

`ExportConnecteamBulkDialog` mantiene el flujo parcial: "Exportar N listos" y
"Revisar M pendientes". Un lote nunca se bloquea entero.

## 7. Mensajes humanos

`LIFECYCLE_COPY` centraliza el lenguaje: "Este trabajo ya está guardado como
borrador.", "Todavía falta definir el equipo.", "Este servicio todavía está en
preparación.", "Esta información aún no existe y está bien dejarla pendiente."
Ningún mensaje interno (`invalid`, `conflict`, `pending new entity`) llega al
coordinador.

## 8. QA

`src/test/service-lifecycle-readiness.test.ts` (11 casos) cubre A–J:
draft mínimo, hora aproximada, sin workers, sin venue, listo/no listo para
staffing, listo/no listo para Connecteam, semana mixta y export parcial.
Suites relacionadas: `service-operational-readiness` (6) y
`calendar-service-identity` (10). 27 tests en verde + typecheck.

Desktop, mobile y refresh: los helpers son puros y las superficies leen del
mismo modelo, por lo que el estado no depende del viewport ni de la sesión;
dos admins ven la misma verdad porque no hay estado local de readiness.

## 9. No tocado

payroll, time_entries, cálculo de horas, VWC, auth, RLS, tenants, ELDM,
extracción de Smart Intake, contrato de assignments y datos de producción.

## Confirmación

Stafly representa el estado real de cada Servicio en cada momento, permitiendo
registrar trabajos incompletos sin inventar información y exigiendo únicamente
los datos necesarios para cada acción específica.
