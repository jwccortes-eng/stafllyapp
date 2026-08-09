# P0 — DRAFT VISIBILITY + CONNECTEAM READINESS (calendario mensual/semanal)

Fecha: 2026-08-09 · Alcance: UI + helper puro de presentación. Sin cambios en
payroll, time_entries, assignments, parser de Smart Intake, ELDM, VWC, auth,
RLS, tenants ni en el formato CSV de Connecteam.

## 1. Causa raíz observada

En vista mensual, `MonthView` renderizaba **cualquier** servicio sin
asignaciones con la tarjeta "Vacant" en color rosa y borde punteado. El mismo
rosa se usa para el contador de **no-disponibilidades** (`UserX`) de la cabecera
del día. Resultado: los drafts recién creados (Imperial, Aug 29/30) se leían
como vacantes o como no-disponibilidad.

Confirmación de solapamiento:

| Elemento | Antes | Componente | Color |
|---|---|---|---|
| Servicio sin personal | "Vacant" | `MonthView.renderShiftCard` | rose + borde punteado |
| No-disponibilidad | contador `UserX` | cabecera de día en `MonthView` | rose |
| Draft | (sin identidad propia) | caía en "Vacant" | rose |

No comparten data adapter (la no-disponibilidad viene de
`isEmployeeAvailable`, el servicio de `scheduled_shifts`), pero sí compartían
color y lectura. Ahora comparten cero: el draft tiene chip propio, la vacante
es ámbar y la no-disponibilidad conserva el rojo con icono `UserX`.

## 2. Jerarquía de estados (tres preguntas separadas)

Fuente única: `src/lib/shifts/calendar-service-identity.ts`
(`getCalendarServiceIdentity`), puro y sin efectos.

- **SERVICE STATE** — `draft` / `published` / `cancelled` / `archived`.
- **STAFFING STATE** — `2/4 · faltan 2`, `Completo 4/4`, o
  `Personal pendiente` cuando la cantidad no está definida (nunca `0/0`).
- **CONNECTEAM STATE** — delegado a `getServiceOperationalReadiness`
  (no se creó otro validador): `Listo` o `Faltan N datos` con las razones
  exactas y su ancla de edición.

Ningún badge representa más de una de las tres.

## 3. Identidad visual del draft

`src/components/shifts/calendar/ServiceCalendarChip.tsx`:

```text
QK-001578  Imperial
BORRADOR   Aprox. 17:00   ⚠
```

- referencia humana `QK-00XXXX` siempre visible (nunca UUID; si el turno es
  histórico se muestra "Sin referencia", no el id);
- chip `BORRADOR` explícito con borde punteado en color primario;
- indicador discreto de Connecteam (✓ / ⚠) sin saturar la celda;
- al tocar abre un popover con fecha, horario, estado, staffing, readiness y
  la lista exacta de blockers;
- CTA **"Completar para Connecteam"** que abre el editor del mismo Servicio
  (`onShiftClick`), sin cambiar de pantalla ni perder el rango del calendario.

Aplicado en `MonthView` (desktop y mobile) y `WeekView`.

## 4. Vacante vs draft

- Draft → `ServiceCalendarChip` (identidad de Servicio).
- Publicado sin personal → chip ámbar **"Sin cubrir"** con la referencia QK
  (estado de staffing, no de servicio).
- No-disponibilidad → sigue siendo el contador `UserX` de la cabecera del día;
  nunca se renderiza como tarjeta de Servicio, y ninguna tarjeta de Servicio
  usa su estilo.

En `WeekView` se eliminó además el recorte `slice(0, 2)` que ocultaba servicios
sin personal: los 9 drafts de Imperial se ven completos.

## 5. Exportación por lote (parcial, nunca todo-o-nada)

`ExportConnecteamBulkDialog` ya evaluaba cada servicio de forma independiente y
excluía solo los bloqueados. Se hizo explícita la lectura:

```text
6 seleccionados · 2 listos para Connecteam · 4 necesitan completar.
Se exportan sólo los listos.
```

y cada fila del detalle muestra su `QK-00XXXX`. El helper puro
`summarizeConnecteamSelection` produce los copys "Exportar 2 listos" /
"Revisar 4 pendientes".

## 6. Matriz de blockers — caso Imperial (drafts de intake)

Estado real de los 9 drafts creados desde el input del video
(`Imperial / Aug 30/31 / Sep 1..7 / aprox 5pm / meseros pendientes`):

| QK | Draft? | ReadyToExportConnecteam? | Blocker(s) exactos |
|---|---|---|---|
| QK-0015xx (Aug 30) | sí | **no** | `publish.end_time` (hora final pendiente: inicio = fin), `export.missing_job_context` (Imperial sin vincular a cliente/venue), `export.missing_timezone` cuando la empresa no declara zona |
| Aug 31 … Sep 7 | sí | **no** | idénticos, evaluados uno por uno |

Nada se inventa: la hora aproximada se muestra como `Aprox. 17:00`, la hora
final se declara pendiente y el personal aparece como `Personal pendiente`
(no `0`). Al completar **un** servicio (venue vinculado + hora final + Job),
ese pasa a `Listo` sin afectar a los otros ocho — cubierto por test.

## 7. QA

Tests: `src/test/calendar-service-identity.test.ts` — 10 en verde.

- identidad QK + título + BORRADOR;
- staffing pendiente ≠ 0;
- hora final no inventada;
- readiness Connecteam explicable (todo blocker tiene razón y ancla);
- draft completo → listo para exportar;
- publicado no se etiqueta como borrador;
- histórico sin `shift_ref` no expone UUID;
- lote 6 = 2 listos + 4 pendientes con export parcial;
- 9 drafts Imperial con QK único y readiness individual.

Typecheck limpio. Las celdas usan `truncate` y `min-w-0`, sin scroll
horizontal añadido en mobile.

## 8. No tocado

payroll · time_entries · shift_assignments · cálculo de asignaciones ·
parser de Smart Intake · ELDM · Tenant Dictionary · VWC · auth · RLS ·
tenants · formato CSV de Connecteam. No se bajó ningún requisito de
publicación ni de exportación.
