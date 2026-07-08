# Stafly Command Center v1 — Staging Demo Checklist (Sprint 44)

**Documentation-only.** No cambia código, base de datos, RLS, auth, payroll, `time_entries`, `shift_assignments`, `scheduled_shifts`, edge functions, tenants ni datos reales.

Checklist para preparar staging antes de grabar Looms o presentar en vivo. Todo turno debe ser **demo**, nunca producción.

---

## 1. Sesión y ambiente

- [ ] Login admin en staging (nunca prod).
- [ ] Tenant demo aislado.
- [ ] Idioma español (mercado objetivo actual).
- [ ] Zona horaria consistente con el turno demo.

## 2. Turnos demo a tener listos

Cada uno con worker demo asignado y cliente demo asociado.

- [ ] **Turno futuro** (>2h en el futuro) — para mostrar staffing.
- [ ] **Turno inminente** (empieza en <30 min) — para mostrar transición a "en curso".
- [ ] **Turno en curso** — para mostrar asistencia y evidencia.
- [ ] **Turno terminado sin cierre** — para mostrar chip "Sin cierre enviado".
- [ ] **Turno con cierre enviado** — chip "Cierre enviado · en revisión".
- [ ] **Turno con cierre rechazado / needs_followup** — chip "Requiere corrección".
- [ ] **Turno con cierre aprobado por María** — chip "Pendiente final".
- [ ] *(Opcional)* **Turno aprobado final** — chip "Aprobado · pasa a payroll".

## 3. Estados de evidencia por worker (dentro de un turno en curso)

- [ ] Worker con fichaje completo (clock-in + clock-out).
- [ ] Worker con clock-in pero sin clock-out.
- [ ] Worker sin clock-in (para demo "Falta clock-in").
- [ ] Worker con validación admin previa ("Lo vi en sitio").

## 4. Deep-links a verificar

- [ ] `/app/command-center` carga con tabs.
- [ ] `/app/shift-ops?id=<id>` abre el turno correcto.
- [ ] `/app/timeclock?shiftId=<id>` enfoca el turno.
- [ ] `/app/payroll-review-queue?shiftId=<id>` enfoca el turno.
- [ ] Chip de estado en Shift Ops navega a PRQ preservando `shiftId`.

## 5. QA desktop

- [ ] Recorrido izquierda→derecha: Shift Ops → Time Clock → Evidence → Closeout → PRQ es fluido.
- [ ] Chips de fase y cierre visibles sin scroll.
- [ ] Copy en español operativo, sin jerga técnica.
- [ ] Banner de payroll visible en el bloque de evidencia.

## 6. QA mobile (390×844)

- [ ] Command Center pill tabs scrollables.
- [ ] Shift Ops muestra cards + KPIs compactos, sin charts.
- [ ] Diálogo de validación admin cabe sin scroll horizontal.
- [ ] Deep-links `/app/timeclock?shiftId=<id>` y `/app/payroll-review-queue?shiftId=<id>` abren la vista mobile enfocada.
- [ ] CTAs primarios (Llamar, Marcar presente, Ver fichajes, Revisar horas) visibles.

## 7. Higiene visual

- [ ] Sin datos reales visibles (nombres, teléfonos, emails, direcciones).
- [ ] Sin banners de debug ni feature flags internos.
- [ ] Sin errores en consola durante la demo.
- [ ] Sin toasts de error inesperados.

## 8. Talking points seguros (recordar antes de demo)

- ✅ "Stafly protege payroll con evidencia auditable."
- ✅ "Payroll se calcula con horas reales de fichaje o ajustes aprobados."
- ✅ "Cada validación admin queda con razón registrada."
- ❌ **No decir:** "esto paga solo", "payroll automático", "sin revisión humana", "reemplaza al contador", "cumple la ley por sí solo".

## 9. Cierre de sesión

- [ ] Cerrar sesión admin en staging al terminar.
- [ ] Borrar cache/cookies del navegador antes de la próxima demo si se cambió de tenant.

---

## Nota Sprint 47 — Tenant demo obligatorio

A partir de Sprint 47 la captura de assets **solo** puede hacerse desde el tenant demo aislado `STAFly Demo Hospitality Ops`. Prohibido capturar desde "Vista global" o desde cualquier tenant productivo.

Ver:
- `STAFly_COMMAND_CENTER_DEMO_TENANT_PLAN.md`
- `STAFly_COMMAND_CENTER_SPRINT_47_DEMO_TENANT_RUNBOOK.md`

Checklist mínimo agregado:

- [ ] Sidebar muestra **una sola** empresa: STAFly Demo Hospitality Ops.
- [ ] Cuenta usada es admin demo (`admin.demo@example.com` o equivalente), no personal.
- [ ] Ningún tenant productivo visible ni accesible desde esta sesión.
- [ ] Todos los emails visibles terminan en `@example.com`.
- [ ] Todos los teléfonos visibles están en el rango 555-01XX.
- [ ] Todos los nombres visibles contienen "Demo".

---

## Nota Sprint 48 — Provisioning bloqueado

Sprint 48 verificó que el proyecto opera sobre Lovable Cloud con **una única base de datos** que contiene 8 tenants productivos. **No existe staging separado**. Por seguridad, el tenant demo `STAFly Demo Hospitality Ops` **no fue provisionado**. Todos los IDs y el usuario `admin.demo@example.com` siguen pendientes.

Ver razón completa y opciones de desbloqueo en `STAFly_COMMAND_CENTER_SPRINT_48_PROVISIONING_REPORT.md`.

Hasta que se elija Opción A (proyecto Supabase separado), B (guardrails + feature flag) o C (mockups sintéticos), **prohibido** ejecutar el runbook de seed en esta DB.
