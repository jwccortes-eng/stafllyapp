# P0 — PUBLISH READINESS REALITY FAILURE · QK-001608 (Quality Staff)

Fecha: 2026-08-18 · **AUDIT ONLY — CERO ESCRITURAS** · Ningún registro, config, RPC ni política fue modificado.
Antecedente: `docs/qa/P0_PUBLISH_READINESS_PHASE1_REMEDIATION.md` (§14 deuda 1 y 2).

## 1. Causa raíz exacta

Phase 1 alineó **cuatro** superficies (chip, bulk, botón individual, RPC) sobre un único adapter, pero ese adapter cubre solo los invariantes de *forma del servicio* (fecha, horario, terminalidad, dotación). **Los requisitos configurables de la compañía nunca entraron al adapter**: siguen viviendo exclusivamente en `getServicePublishReadiness()` (`src/lib/shifts/service-publish-readiness.ts`), que es la regla que alimenta el editor y el **PrePublishDialog**.

Quality Staff tiene `shifts_config.require_location = true`. QK-001608 no tiene ningún destino (`location_id`, `job_site_location_id` y `job_site_address` vacíos), por lo que:

- `resolveServiceLocationTruth(...).destinationStatus = MISSING_DESTINATION` → `hasJobSite = false`
- `getServicePublishReadiness` emite el blocker `job_site` → `canPublish = false` → "No se puede publicar todavía · Falta definir el lugar del servicio".
- `resolveDraftPublishReadiness` (Phase 1) **no lee `shifts_config`**, ve `claimable=true`, `slots=1`, fecha y horario completos → `ready = true`.

El texto contradictorio del mismo diálogo ("Los trabajadores podrán reclamar este turno aunque algunos detalles estén por confirmar") **no viene de la regla de readiness**: procede de `computeShiftPendingFlags` vía `buildPrePublishReview`, que describe el modelo de claim con detalles pendientes. Es copy informativo de un modelo *permisivo* renderizado junto a un veredicto *restrictivo*. Ambos son correctos en su propio modelo; la incoherencia es que conviven dos modelos.

**Causa raíz en una frase:** la readiness de publicación tiene todavía dos definiciones — la de forma (adapter Phase 1 + RPC) y la de política de compañía (`getServicePublishReadiness`, solo cliente, solo editor) — y ninguna de las dos conoce a la otra.

## 2. Estado real de QK-001608 (lectura directa)

| Campo | Valor |
|---|---|
| company_id | `00000000-0000-0000-0000-000000000001` (Quality Staff by Keury) |
| shift_ref | QK-001608 (servicio raíz, sin `parent_shift_id`) |
| title | Turno |
| publication_status | `draft` |
| status | `draft` |
| claimable | `true` |
| slots | 1 |
| assignments activas | 0 |
| client_id | `3e6f9c2f-…f50a` (presente) |
| location_id | **null** |
| job_site_location_id | **null** |
| job_site_address | **vacío** |
| meeting_point / meeting_point_location_id | null / null |
| transportation_required | false |
| shift_admin_id | null |
| date | 2026-09-03 |
| start_time / end_time | 08:00 / 17:00 (9 h) |

Único incumplimiento: **destino del servicio ausente** con `require_location = true`.

## 3. Configuración real de Quality Staff (`company_settings.shifts_config`)

```json
{"allow_claims": true, "auto_publish": false, "default_slots": 1,
 "require_client": true, "require_location": true, "require_shift_admin": false,
 "max_shift_hours": 16, "default_start_time": "08:00", "default_end_time": "17:00",
 "copy_week_assignments": true}
```

Comparación de tenants:

| Compañía | require_location | require_client | require_shift_admin | max_shift_hours |
|---|---|---|---|---|
| Quality Staff by Keury | **true** | **true** | false | 16 |
| My Staff Solution LLC | **true** | **true** | false | 16 |
| JKitchen Staff | *(sin fila)* → default `false` | default `false` | false | default 16 |

Nota: los defaults del código (`SHIFTS_CONFIG_DEFAULTS.require_location = false`) y el default del helper (`getServicePublishReadiness` asume `requireLocation ?? true`) son opuestos. Un tenant sin fila de config obtiene `false` por el hook, pero cualquier llamada al helper sin pasar `requirements` obtiene `true`. Es una tercera divergencia latente.

## 4. Matriz de las 5 superficies · QK-001608

| # | SURFACE | ¿READY? | BLOCKERS | SOURCE OF TRUTH |
|---|---|---|---|---|
| A | Chip "Borradores listos para publicar" | ✅ SÍ (lo cuenta) | ninguno | `resolveDraftPublishReadiness` (`publish-readiness.ts`) — Shifts.tsx:711 |
| B | Bulk "Publicar listos" | ✅ SÍ (lo intentaría) | ninguno | `selectPublishableDrafts` → mismo adapter — Shifts.tsx:1870 |
| C | Botón individual Publicar (lista/tarjeta) | ✅ SÍ | ninguno (solo gate extra `require_shift_admin`, aquí false) | mismo adapter + `shiftsConfig.require_shift_admin` — Shifts.tsx:1759, 1789 |
| D | PrePublishDialog (editor) | ❌ **NO** | `job_site` — "Falta definir el lugar del servicio" | `getServicePublishReadiness` + `buildPrePublishReview` (`require_location` de `shifts_config`) |
| E | RPC `publish_shift_draft` | ✅ SÍ | ninguno | SQL en BD: permiso, tenant, terminalidad, `date`, `start_time`, `end_time`, y `slots>0` por rama claim |

Tres fuentes de verdad distintas: adapter (A/B/C), helper del editor (D), función SQL (E). A/B/C y E coinciden; D es el único que aplica la política de compañía — y es el único que la operación real toca al abrir el servicio.

## 5. ¿QK-001608 estaba dentro de los 28 READY de Phase 1?

**Sí.** El censo de Phase 1 se calculó con la misma expresión del adapter (fecha + horario + claim con `slots>0`), sin leer `shifts_config`. QK-001608 y QK-001607 se contaron como READY siendo impublicables desde el editor. La cifra "28 publicables reales" del reporte anterior es **incorrecta**: es el número que pasa el RPC, no el que pasa la operación real.

## 6. Qué ocurriría si se invocara `publish_shift_draft(QK-001608)` — **no ejecutado**

- **El backend permitiría la publicación.** Pasa permiso (`service.publish` sobre su propia compañía), no es terminal, tiene `date`, `start_time`, `end_time`, y por la rama Claim solo exige `slots > 0` (=1).
- **El backend NO bloquearía por ubicación.** La función no lee `location_id`, `job_site_location_id`, `job_site_address` ni `shifts_config` en absoluto.
- Consecuencia: el servicio quedaría `published` + `claimable`, visible en "Disponibles" del portal, reclamable por cualquier trabajador elegible, **sin destino** → sin geofence (Quality tiene geofence activo, radio 200 m), sin mapa, sin dirección que mostrar al trabajador que lo reclame. La política `require_location` de la compañía sería evadida silenciosamente.
- El bulk "Publicar listos" es la vía práctica para que esto ocurra hoy, sin que ningún operador vea nunca el diálogo que lo prohíbe.

## 7. Clasificación de los 8 claimable

| shift_ref | Fecha | Cliente | Destino | Clasificación |
|---|---|---|---|---|
| QK-001584 | 2026-09-02 | ✅ | `job_site_address = "Imperial"` (texto manual) | ✅ READY real — pasa el diálogo con **warning** `job_site_unsaved` (sin lugar guardado → sin mapa ni geofence) |
| QK-001585 | 2026-09-03 | ✅ | "Imperial" (texto) | ✅ READY real (mismo warning) |
| QK-001586 | 2026-09-04 | ✅ | "Imperial" (texto) | ✅ READY real (mismo warning) |
| QK-001587 | 2026-09-05 | ✅ | "Imperial" (texto) | ✅ READY real (mismo warning) |
| QK-001588 | 2026-09-06 | ✅ | "Imperial" (texto) | ✅ READY real (mismo warning) |
| QK-001589 | 2026-09-07 | ✅ | "Imperial" (texto) | ✅ READY real (mismo warning) |
| QK-001607 | 2026-10-08 | ✅ | **ninguno** | ❌ **Falta ubicación** |
| QK-001608 | 2026-09-03 | ✅ | **ninguno** | ❌ **Falta ubicación** |

Ninguno falta de cliente, ninguno excede `max_shift_hours`, ninguno requiere shift admin, ninguno tiene transporte activo. **6 verdaderamente READY, 2 falsos positivos.** Los 6 "READY" lo son solo con dirección de texto libre: publicables pero sin geofence, lo que degrada la validación de clock-in que Quality tiene activada.

## 8. Cuántos de los 28 pasarían realmente el PrePublishDialog

| Compañía | READY según Phase 1 | Pasan el diálogo | Bloqueados por ubicación | Bloqueados por cliente |
|---|---|---|---|---|
| Quality Staff by Keury | 21 | **10** | 11 | 0 |
| My Staff Solution LLC | 6 | **0** | 4 | 6 |
| JKitchen Staff (sin config → sin requisitos) | 1 | **1** | 0 | 0 |
| **Total** | **28** | **11** | **15** | **6** |

*(las categorías se solapan en MyStaff: allí los 6 fallan por cliente y 4 de ellos además por ubicación)*

**11 de 28.** El chip corregido en Phase 1 sigue exagerando en **17 servicios** (61 %). Antes decía 108, luego 28, la verdad operativa es 11.

## 9. Riesgo operacional

1. **Evasión de política por bulk (alto).** "Publicar listos" publicaría 17 servicios que el editor rechaza, incluidos 15 sin destino. Ninguno pasa por el diálogo, así que la política de la compañía nunca se evalúa.
2. **Publicación reclamable sin destino (alto, específico de claim).** Un trabajador puede reclamar QK-001607/001608 y llegar el día del turno sin dirección; con geofence activo (200 m) su clock-in no tendría referencia geoespacial válida.
3. **MyStaff es el peor caso (alto).** Sus 6 borradores READY no tienen cliente y `require_client=true`: el bulk publicaría 6 servicios sin cliente → riesgo aguas abajo en facturación y atribución de horas.
4. **Confianza del operador (medio).** El chip dice "listo", el diálogo dice "no se puede". El operador no sabe cuál creer y el mensaje mixto sobre claim ("podrán reclamar aunque falten detalles") sugiere que el bloqueo es un bug, empujando al uso del bulk como atajo.
5. **Divergencia de defaults (medio).** `require_location` vale `false` por hook y `true` por helper. Un tenant nuevo sin config puede comportarse distinto según qué superficie lo evalúe.
6. **Sin riesgo retroactivo.** Nada de esto afecta servicios ya publicados, asignaciones, notificaciones ni claims existentes. El daño potencial es solo prospectivo, en el próximo bulk publish.

## 10. Recomendación para SSOT · Phase 2 (no implementar sin autorización)

1. **Una sola función de readiness, en la base de datos.** Crear `service_publish_readiness(_shift_id)` que lea el servicio **y** `company_settings.shifts_config` y devuelva `{ok, blockers[], warnings[], staffing_mode, coverage}`. `publish_shift_draft` debe llamarla y rechazar con los mismos códigos; nadie puede publicar evadiendo la política de compañía, ni por RPC directo ni por bulk.
2. **El cliente deja de tener regla propia.** `resolveDraftPublishReadiness` y `getServicePublishReadiness` se fusionan en un único adapter puro que es espejo literal de esa función, alimentado por `shifts_config` real, y consumido por las cinco superficies. El chip, el bulk, el botón y el diálogo pasan a mostrar exactamente el mismo veredicto.
3. **Separar blocker de warning con una sola semántica.** `require_location=true` sin destino es blocker; dirección de texto libre es warning (`job_site_unsaved`). Hoy el modelo ya lo distingue bien en el editor — hay que llevarlo intacto al backend.
4. **Resolver la pregunta de negocio antes de codificar** (§11): decidir si `claimable` relaja `require_location` o no, y hacer esa decisión explícita y configurable en lugar de emergente.
5. **Unificar el default.** Un solo valor de `require_location` por defecto para hook, helper y función SQL.
6. **Copy coherente en el diálogo.** Cuando hay blockers, no mostrar el mensaje permisivo de claim; cuando no los hay, mantenerlo.

## 11. Regla de negocio actualmente implementada (hallazgo, sin decidir)

**Están implementadas las dos reglas a la vez, en capas distintas:**

- Backend + adapter Phase 1: `claimable=true` **permite** publicar sin ubicación (solo exige `slots>0`).
- Editor + PrePublishDialog: la ubicación es **hard invariant** cuando `require_location=true`, y `claimable` **no** la relaja — `claimable` solo exime del requisito de *equipo asignado* (blocker `team`), nunca del de *lugar*.

La intención observable en el código del editor es que `claimable` es una excepción de **dotación**, no de **lugar**. La rama Claim del backend generalizó esa excepción a todo. Cuál debe ganar es la decisión pendiente para Phase 2; esta auditoría no la toma.

## 12. Veredicto

🟡 **GO WITH CONDITIONS**

- La divergencia está demostrada y es reproducible: QK-001608 es READY en 4 superficies y BLOCKED en la que el operador realmente usa.
- No hay daño consumado: cero servicios publicados indebidamente, cero notificaciones emitidas, cero claims afectados.
- **Condición 1 (bloqueante):** no usar "Publicar listos" en Quality Staff ni en MyStaff hasta cerrar Phase 2 — publicaría 17 servicios que la política de compañía rechaza. La publicación individual desde el editor sí es segura, porque pasa por el diálogo.
- **Condición 2:** corregir el chip para que refleje 11, no 28, en cuanto se autorice el fix.
- **Condición 3:** completar la ubicación de QK-001607 y QK-001608 antes de publicarlos, y valorar convertir las 6 direcciones "Imperial" de texto libre en lugar guardado para recuperar geofence.
