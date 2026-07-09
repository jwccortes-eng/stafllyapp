# Command Center Demo Screenshots — Inventario

**Última actualización:** 2026-07-08 (Sprint 46)
**Ambiente de captura permitido:** staging/sandbox con tenant demo aislado.
**Prohibido:** capturar tenants productivos, mostrar datos reales, tokens, URLs de producción, teléfonos, emails, consola o network tab.

---

## Estado de captura Sprint 46

La sesión disponible en el sandbox actual está en **"Vista global"** con **8 empresas productivas** visibles. Cualquier captura que entre en un tenant real expondría clientes, workers y turnos productivos, violando las reglas de seguridad del sprint (no datos reales, no producción, no información sensible).

Por eso Sprint 46 **solo publica assets neutrales** (empty states y shell mobile). Las capturas por fase/estado quedan **pendientes hasta que exista un tenant demo aislado** con turnos seed en cada estado (ver `STAFly_COMMAND_CENTER_STAGING_CHECKLIST.md` §2).

---

## Assets publicados

| Archivo | Descripción | Contiene datos reales |
|---|---|---|
| `05-command-center-mobile-emptystate.png` | Command Center mobile mostrando el empty state "Selecciona una empresa" con la nav bar inferior (Hoy · Turnos · Reloj · Equipo · Más). Sirve como shell/layout de referencia para el deck y como preview del bottom nav sin exponer ningún tenant. | No |

---

## Assets pendientes (bloqueados por falta de tenant demo aislado)

Nombres esperados según `STAFly_COMMAND_CENTER_SPRINT_45_ASSET_RUNBOOK.md` §3. Deben capturarse en un tenant demo dedicado con datos genéricos ("Cliente Demo Eventos", "Worker Demo 1", etc.), no en producción.

### Command Center
- [ ] `01-command-center-hoy-desktop.png`
- [ ] `02-command-center-attention-desktop.png`
- [ ] `03-command-center-live-desktop.png`
- [ ] `04-command-center-payroll-desktop.png`
- [x] `05-command-center-mobile-emptystate.png` (publicado; shell neutro)
- [ ] `05-command-center-mobile.png` (con contenido demo)

### Shift Ops por fase
- [ ] `10-shift-ops-futuro-desktop.png`
- [ ] `11-shift-ops-encurso-desktop.png`
- [ ] `12-shift-ops-terminado-desktop.png`
- [ ] `13-shift-ops-cerrado-desktop.png`
- [ ] `14-shift-ops-mobile.png`

### Attendance Evidence
- [ ] `20-evidence-falta-clockin-desktop.png`
- [ ] `21-evidence-dialog-validacion-desktop.png`
- [ ] `22-evidence-banner-payroll-desktop.png`
- [ ] `23-evidence-mobile.png`

### Time Clock (deep-link con `shiftId` demo)
- [ ] `30-timeclock-focus-desktop.png`
- [ ] `31-timeclock-mobile.png`

### Closeout chips
- [ ] `40-shift-ops-chip-sin-cierre-desktop.png`
- [ ] `41-shift-ops-chip-in-review-desktop.png`
- [ ] `42-shift-ops-chip-needs-correction-desktop.png`
- [ ] `43-shift-ops-chip-pending-final-desktop.png`
- [ ] `44-shift-ops-chip-ready-desktop.png`

### Payroll Review Queue (deep-link con `shiftId` demo)
- [ ] `50-prq-focus-shift-desktop.png`
- [ ] `51-prq-buckets-desktop.png`
- [ ] `52-prq-mobile.png`

---

## Checklist de seguridad visual antes de publicar cualquier PNG nuevo

- [ ] Tenant demo aislado, no productivo.
- [ ] Sin nombres/teléfonos/emails/direcciones reales.
- [ ] Sin tokens, IDs sensibles, URLs de producción visibles.
- [ ] Sin consola del navegador, network tab, ni Supabase dashboard.
- [ ] Sin extensiones del navegador visibles.
- [ ] Zoom 100%, viewport correcto (1280×800 desktop, 390×844 mobile).
- [ ] Estado UI coherente con el guion Loom asociado.
- [ ] Nombre según convención `NN-descripcion-{desktop|mobile}.png`.

---

## Regla de payroll (recordatorio)

Ninguna captura debe sugerir que Stafly paga automáticamente. Payroll se calcula con horas reales de `time_entries` o ajustes aprobados en el Centro de Validación. Screenshots del PRQ deben mostrar el guardrail visible.

---

## Nota Sprint 47 — Origen obligatorio de las capturas

Los 21 assets pendientes deben capturarse **exclusivamente** desde el tenant demo `STAFly Demo Hospitality Ops` (ver `STAFly_COMMAND_CENTER_DEMO_TENANT_PLAN.md`). Cualquier PNG capturado desde Vista global o tenant productivo debe ser rechazado y borrado.

Placeholders demo válidos en nombres de archivo / captions:
`COMPANY_DEMO_ID`, `SHIFT_DEMO_FUTURE`, `SHIFT_DEMO_INPROGRESS`, `SHIFT_DEMO_ENDED`, `SHIFT_DEMO_SUBMITTED`, `SHIFT_DEMO_NEEDS_CORR`, `SHIFT_DEMO_PENDING_FINAL`, `SHIFT_DEMO_APPROVED`, `SHIFT_DEMO_NO_SHOW`, `SHIFT_DEMO_MISSING_INFO`.

---

## Nota Sprint 48 — Provisioning bloqueado

Sprint 48 verificó que el proyecto opera sobre Lovable Cloud con **una única base de datos** que contiene 8 tenants productivos. **No existe staging separado**. Por seguridad, el tenant demo `STAFly Demo Hospitality Ops` **no fue provisionado**. Todos los IDs y el usuario `admin.demo@example.com` siguen pendientes.

Ver razón completa y opciones de desbloqueo en `STAFly_COMMAND_CENTER_SPRINT_48_PROVISIONING_REPORT.md`.

Hasta que se elija Opción A (proyecto Supabase separado), B (guardrails + feature flag) o C (mockups sintéticos), **prohibido** ejecutar el runbook de seed en esta DB.

---

## Nota Sprint 49 — Opción A elegida (segundo proyecto Supabase)

Sprint 49 formaliza el plan para crear un **segundo proyecto Supabase** dedicado a staging/demo, separado de la DB productiva. Es la ruta principal para desbloquear Sprint 48 (seed del tenant demo) y Sprint 46B (screenshots + Looms).

Ver `STAFly_COMMAND_CENTER_SPRINT_49_STAGING_ENV_PLAN.md` para arquitectura, schema sync sin datos, seed demo, RLS/payroll-safe y checklist de aprobación.

Hasta que el segundo proyecto exista y pase el checklist §10 del plan Sprint 49, **prohibido** correr el runbook de seed contra la DB productiva actual.

---

## Nota Sprint 50 — Badge visual obligatorio en toda captura

A partir de Sprint 50 el frontend renderiza un **badge global "STAGING / DEMO"** (amarillo, esquina inferior centrada, no bloqueante) siempre que el build corra contra un ambiente no productivo. La detección es 100% build-time (env vars) y **nunca** consulta la base de datos.

**Regla de captura:**

- ✅ Todo screenshot publicado en `docs/demo/screenshots/` DEBE incluir el badge amarillo "STAGING / DEMO · Synthetic data only" visible.
- ❌ Cualquier PNG **sin** el badge se considera capturado desde producción y debe ser **rechazado y borrado** inmediatamente.

**Cómo verificar el ambiente antes de capturar:**

1. Cargar la app y revisar la esquina inferior centrada — debe verse el chip amarillo.
2. Abrir la consola del navegador y confirmar en el log `[stafly-build]` que `supabaseUrl` apunta al proyecto **staging/demo** (no al project ref productivo).
3. Confirmar que `VITE_APP_ENV=staging` o `demo` en la configuración del build (o que se está sirviendo desde un host de preview Lovable, que por defecto se marca como staging).
4. Si el badge no aparece: **NO capturar**. El build está apuntando a producción.

Ver `../STAFly_COMMAND_CENTER_STAGING_CHECKLIST.md` §10 para el procedimiento completo.
