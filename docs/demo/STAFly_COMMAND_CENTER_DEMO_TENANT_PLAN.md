# Stafly Command Center v1 — Demo Tenant Plan (Sprint 47)

**Documentation-only.** No cambia código, base de datos, RLS, auth, payroll, `time_entries`, `shift_assignments`, `scheduled_shifts`, edge functions, tenants productivos, payments, bookings ni chat.

Este plan define un **tenant demo aislado** ("STAFly Demo Hospitality Ops") para desbloquear Sprint 46 (screenshots + Looms + deck) sin exponer datos productivos.

---

## 1. Por qué Sprint 46 fue bloqueado

Al ejecutar Sprint 46, la única sesión disponible en el sandbox estaba en **"Vista global" con 8 empresas productivas** visibles en el sidebar. Cualquier captura o Loom desde esa sesión habría expuesto:

- Nombres reales de clientes y workers.
- Turnos productivos con horarios y ubicaciones reales.
- Cierres, evidencia y horas reales pendientes de payroll.
- IDs de tenants y `shift_id` de producción.

Eso viola las reglas de seguridad ("no datos reales", "no producción", "no información sensible"), por lo que Sprint 46 publicó únicamente un shell mobile neutro y dejó 21 assets pendientes.

## 2. Riesgo de usar Vista global / tenants productivos

- Filtrado a canales de venta o slides externos → violación de privacidad y contratos.
- Exposición de PII de workers (nombres, teléfonos, direcciones).
- Filtración de estrategia comercial de clientes.
- Posible confusión operativa: un admin ve un demo con datos reales y ejecuta acciones sobre producción.
- Reputación: cualquier screenshot filtrado es evidencia pública.

**Regla dura:** prohibido capturar screenshots o grabar Looms desde Vista global o desde cualquier tenant productivo. Cero excepciones.

## 3. Requisito: tenant demo aislado

Un único tenant demo, claramente marcado como DEMO, con:

- Company name: **STAFly Demo Hospitality Ops**.
- Environment label visible: **DEMO / STAGING**.
- Sin URLs de producción asociadas.
- Sin miembros humanos reales — solo cuentas demo.
- Aislado en base de datos: los admins de producción no ven este tenant y este tenant no ve datos de producción.
- Solo alcanzable en staging/sandbox.

Provisioning **no** se ejecuta en este sprint. Este documento define el modelo y las condiciones; el provisioning técnico debe ser revisado y ejecutado en un sprint posterior por alguien con acceso a staging (ver Sprint 47 Runbook).

## 4. Modelo de datos demo

### Company

| Campo | Valor |
|---|---|
| Name | STAFly Demo Hospitality Ops |
| Slug | `stafly-demo-hospitality-ops` |
| Label | DEMO / STAGING |
| Timezone | America/New_York (o el que use el pitch) |
| Status | Active (solo staging) |

### Workers demo (8)

| Nombre | Email | Teléfono | Rol sugerido |
|---|---|---|---|
| Ana Demo | ana.demo@example.com | 555-0101 | Server |
| Luis Demo | luis.demo@example.com | 555-0102 | Bartender |
| Maria Demo | maria.demo@example.com | 555-0103 | Event Captain |
| Carlos Demo | carlos.demo@example.com | 555-0104 | Cook |
| Sofia Demo | sofia.demo@example.com | 555-0105 | Server |
| Diego Demo | diego.demo@example.com | 555-0106 | Runner |
| Priya Demo | priya.demo@example.com | 555-0107 | Bartender |
| Jordan Demo | jordan.demo@example.com | 555-0108 | Dishwasher |

Emails **siempre** `@example.com` (RFC 2606, nunca entregan). Teléfonos siempre en el rango 555-01XX (no asignables).

### Venues demo (5)

- Harbor Event Hall
- Midtown Catering Kitchen
- Riverside Hotel Ballroom
- Garden Terrace Venue
- Union Station Banquet Room

### Roles demo

Server · Bartender · Cook · Dishwasher · Event Captain · Runner.

## 5. Escenarios demo (9 turnos)

| # | Escenario | Fecha/hora | Estado esperado | Notas |
|---|---|---|---|---|
| 1 | Futuro | mañana +10h | Fase "Antes del turno" · sin cierre | Workers pending/accepted |
| 2 | En curso | hoy, hora actual ±1h | Fase "En curso" · un worker clocked-in | CTA Time Clock visible |
| 3 | Terminado sin cierre | ayer | "Sin cierre enviado" | Requiere follow-up |
| 4 | Cierre enviado | anteayer | "Cierre enviado · en revisión" | AttendanceEvidenceCard visible |
| 5 | Requiere corrección | -3d | "Requiere corrección" | Missing clock-out demo |
| 6 | Pendiente final | -4d | "Pendiente final" | Aprobado por María |
| 7 | Aprobado (opcional) | -5d | "Aprobado · pasa a payroll" | Cierre limpio |
| 8 | No-show / replacement | hoy | Fase "En curso" · alerta no-show | Uno de 3 workers no llegó |
| 9 | Missing location/meeting point | mañana | Fase "Antes del turno" · alerta info faltante | Sin punto de encuentro |

Todos los `time_entries` demo generados para estos escenarios deben:

- Vivir bajo `company_id` del tenant demo únicamente.
- Nunca alimentar cálculos de payroll productivo.
- Estar etiquetados en notas internas como `DEMO`.

## 6. Reglas de seguridad (recordatorio permanente)

- No usar datos reales de ningún tipo.
- No copiar workers, clientes, venues, turnos, teléfonos ni emails reales.
- No usar tenants productivos.
- No mezclar tenants.
- No activar companies nuevas desde signup público.
- No tocar payroll real ni cálculos.
- No alterar `time_entries`, `shift_assignments`, `scheduled_shifts` reales.
- No modificar RLS, auth, edge functions, payments, bookings ni chat sin revisión explícita.
- No exponer tokens, consola, Supabase dashboard ni variables de entorno.
- No capturar desde Vista global si aparecen tenants productivos.

## 7. Checklist antes de capturar screenshots

- [ ] Sesión admin logueada **solo** al tenant demo.
- [ ] Sidebar muestra **una** empresa: STAFly Demo Hospitality Ops.
- [ ] Ningún tenant productivo visible.
- [ ] Ningún dato personal real visible.
- [ ] Consola / network / Supabase dashboard cerrados.
- [ ] URL en la barra: staging (no producción).
- [ ] Zoom 100%, viewport correcto (1280×800 desktop, 390×844 mobile).
- [ ] Estado UI alineado con el escenario demo esperado.
- [ ] Nombrado según convención `NN-descripcion-{desktop|mobile}.png`.

## 8. Checklist antes de grabar Looms

- [ ] Todo lo anterior.
- [ ] Guion abierto en segunda pantalla (`STAFly_COMMAND_CENTER_LOOM_GUIDE.md`).
- [ ] Micrófono probado, notificaciones OS silenciadas.
- [ ] Pestañas del navegador limpias (sin producción).
- [ ] Placeholders demo listos: `SHIFT_DEMO_FUTURE`, `SHIFT_DEMO_INPROGRESS`, etc. (ver §9).
- [ ] Nunca leer en voz alta IDs reales de producción.
- [ ] Recordar frases prohibidas ("paga solo", "sin revisión", "reemplaza al contador").

## 9. Placeholders/IDs demo

Usar estos alias en documentación, guiones y URLs de ejemplo. En staging se resolverán a `uuid` reales del tenant demo.

| Alias | Uso |
|---|---|
| `COMPANY_DEMO_ID` | company_id del tenant demo |
| `SHIFT_DEMO_FUTURE` | escenario 1 |
| `SHIFT_DEMO_INPROGRESS` | escenario 2 |
| `SHIFT_DEMO_ENDED` | escenario 3 |
| `SHIFT_DEMO_SUBMITTED` | escenario 4 |
| `SHIFT_DEMO_NEEDS_CORR` | escenario 5 |
| `SHIFT_DEMO_PENDING_FINAL` | escenario 6 |
| `SHIFT_DEMO_APPROVED` | escenario 7 (opcional) |
| `SHIFT_DEMO_NO_SHOW` | escenario 8 |
| `SHIFT_DEMO_MISSING_INFO` | escenario 9 |

URLs demo:

- `https://<staging-host>/app/command-center`
- `https://<staging-host>/app/shift-ops?id=SHIFT_DEMO_INPROGRESS`
- `https://<staging-host>/app/timeclock?shiftId=SHIFT_DEMO_INPROGRESS`
- `https://<staging-host>/app/payroll-review-queue?shiftId=SHIFT_DEMO_SUBMITTED`

## 10. Criterios para considerar el tenant demo aprobado

- [ ] Tenant creado únicamente en staging.
- [ ] Un admin demo puede loguearse y ver **solo** ese tenant.
- [ ] Los 9 escenarios existen con datos ficticios.
- [ ] Ningún email/teléfono real en la base demo.
- [ ] `time_entries` demo aislados por `company_id`.
- [ ] Payroll productivo no cambió durante la seed (verificable por checksum antes/después).
- [ ] Sprint 46 puede re-ejecutarse contra este tenant sin exponer datos reales.

## 11. Plan para re-ejecutar Sprint 46

1. Con el tenant demo aprobado, loguearse en staging con la cuenta admin demo.
2. Verificar checklist §7.
3. Capturar los 21 screenshots pendientes según `STAFly_COMMAND_CENTER_SPRINT_45_ASSET_RUNBOOK.md` §3.
4. Publicar PNG en `docs/demo/screenshots/` con la convención de nombres.
5. Actualizar `docs/demo/screenshots/README.md` marcando cada asset como `[x]`.
6. Grabar los 5 Looms siguiendo el `LOOM_GUIDE.md`.
7. Enlazar Looms en la carpeta compartida del equipo comercial (no en el repo).
8. Actualizar `SALES_DECK_OUTLINE.md` desbloqueando slides 1, 4, 5, 6, 7, 10.

---

## Confirmación de alcance

Este sprint es **documentation-only**. No hay migraciones, no hay writes, no se creó ningún tenant, no se generaron `time_entries`, no se tocó RLS ni auth ni edge functions ni payments ni bookings ni chat.

---

## Nota Sprint 48 — Provisioning bloqueado

Sprint 48 verificó que el proyecto opera sobre Lovable Cloud con **una única base de datos** que contiene 8 tenants productivos. **No existe staging separado**. Por seguridad, el tenant demo `STAFly Demo Hospitality Ops` **no fue provisionado**. Todos los IDs y el usuario `admin.demo@example.com` siguen pendientes.

Ver razón completa y opciones de desbloqueo en `STAFly_COMMAND_CENTER_SPRINT_48_PROVISIONING_REPORT.md`.

Hasta que se elija Opción A (proyecto Supabase separado), B (guardrails + feature flag) o C (mockups sintéticos), **prohibido** ejecutar el runbook de seed en esta DB.
