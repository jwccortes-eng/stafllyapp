# Stafly Command Center v1 — Screenshots requeridos (Sprint 44)

**Documentation-only.** No cambia código, base de datos, RLS, auth, payroll ni datos reales.

Esta carpeta guarda los placeholders y (cuando se generen) los PNG reales para el deck comercial y los Looms. Todas las capturas deben tomarse en **staging/sandbox** con datos demo. **Prohibido** usar datos reales de clientes o workers.

---

## Convenciones

- Resolución desktop: 1280×800 mínimo, escala 1x.
- Resolución mobile: 390×844 (iPhone 14/15).
- Guardar como `NN-descripcion-desktop.png` o `NN-descripcion-mobile.png`.
- Sin barra de navegador con URL real. Usar staging URL genérica visible.
- Sin nombres/emails reales visibles — usar datos demo tipo "María Ops", "Worker Demo 1".

---

## Screenshots requeridos por fase

### Fase A — Command Center

- `01-command-center-hoy-desktop.png` — tab "Hoy / Mañana" con turnos del día.
- `02-command-center-attention-desktop.png` — tab "Necesita atención".
- `03-command-center-live-desktop.png` — tab "En vivo".
- `04-command-center-payroll-desktop.png` — tab "Listo para pago" con guardrail visible.
- `05-command-center-mobile.png` — vista mobile con pill tabs.

### Fase B — Shift Ops por fase de turno

- `10-shift-ops-futuro-desktop.png` — chip fase "Antes del turno", prioridad staffing.
- `11-shift-ops-encurso-desktop.png` — chip fase "En curso", prioridad asistencia.
- `12-shift-ops-terminado-desktop.png` — chip fase "Después", prioridad cierre.
- `13-shift-ops-cerrado-desktop.png` — chip fase "Cerrado", resumen.
- `14-shift-ops-mobile.png` — vista mobile de Shift Ops.

### Fase C — Attendance Evidence

- `20-evidence-falta-clockin-desktop.png` — worker con estado "Falta clock-in".
- `21-evidence-dialog-validacion-desktop.png` — diálogo "Registrar validación admin".
- `22-evidence-banner-payroll-desktop.png` — banner recordatorio payroll.
- `23-evidence-mobile.png` — bloque evidence en mobile.

### Fase D — Time Clock

- `30-timeclock-focus-desktop.png` — `/app/timeclock?shiftId=<id>` con foco.
- `31-timeclock-mobile.png` — vista mobile del deep-link.

### Fase E — Closeout / Chip de estado

- `40-shift-ops-chip-sin-cierre-desktop.png` — chip "Sin cierre enviado".
- `41-shift-ops-chip-in-review-desktop.png` — chip "Cierre enviado · en revisión".
- `42-shift-ops-chip-needs-correction-desktop.png` — chip "Requiere corrección".
- `43-shift-ops-chip-pending-final-desktop.png` — chip "Pendiente final".
- `44-shift-ops-chip-ready-desktop.png` — chip "Aprobado · pasa a payroll".

### Fase F — Payroll Review Queue

- `50-prq-focus-shift-desktop.png` — `/app/payroll-review-queue?shiftId=<id>`.
- `51-prq-buckets-desktop.png` — vista de buckets del PRQ.
- `52-prq-mobile.png` — vista mobile del PRQ.

---

## Checklist antes de publicar cada screenshot

- [ ] Sin datos reales de clientes/workers.
- [ ] Sin tokens, IDs sensibles, URLs de producción.
- [ ] Sin extensiones del navegador visibles.
- [ ] Zoom del navegador al 100%.
- [ ] Estado UI coherente con el guion del Loom asociado.
- [ ] Nombrado según convención `NN-descripcion-{desktop|mobile}.png`.
