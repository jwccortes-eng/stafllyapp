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
