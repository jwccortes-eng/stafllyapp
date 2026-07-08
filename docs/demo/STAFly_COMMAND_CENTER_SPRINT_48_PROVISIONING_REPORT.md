# Stafly Command Center v1 — Sprint 48 Provisioning Report

**Status:** BLOQUEADO. No se provisionó el tenant demo.
**Ambiente detectado:** Lovable Cloud, base de datos única, sin staging separado.
**Documentation-only.** Cero writes a DB, cero cambios en `src/**`, RLS, auth, payroll, `time_entries`, `shift_assignments`, `scheduled_shifts`, edge functions, tenants productivos, payments, bookings ni chat.

---

## 1. Resultado

Sprint 48 pedía ejecutar el runbook de Sprint 47 en **staging**. La verificación inicial confirma que:

- El proyecto opera sobre **Lovable Cloud** con **una única base de datos Supabase**.
- Esa base contiene **8 companies productivas** (consulta read-only `SELECT count(*) FROM companies` = 8).
- No existe un proyecto Supabase separado marcado como "staging" al que apuntar.

Provisionar `STAFly Demo Hospitality Ops` en esta DB **es** provisionar en producción, aunque se aísle por `company_id`. Esto choca con las reglas duras del sprint:

- "Ejecutar solo en staging."
- "No tocar producción."
- "No mezclar tenants."
- "No activar companies nuevas automáticamente desde signup público."

Por lo tanto, ejecutar el seed hoy es un **bloqueo de seguridad**, no un bug técnico. Sprint 48 termina como **provisioning bloqueado con razón exacta**, opción explícitamente permitida por los criterios de aceptación.

## 2. Riesgos concretos si se hubiera ejecutado igual

1. **Contaminación de payroll**: cualquier tenant nuevo comparte los mismos triggers, funciones y jobs (`notify_review_on_clockout`, `auto_close_periods`, cálculos de PRQ). Un bug en el seed podría disparar notificaciones a operadores reales o mover contadores.
2. **Riesgo de RLS**: escribir workers/employees/`time_entries` demo en la misma DB requiere que las políticas actuales aíslen perfectamente por `company_id`. Cualquier error en el seed queda visible para admins productivos.
3. **Confusión operativa**: un admin real podría ver "STAFly Demo Hospitality Ops" en logs, dashboards internos, exports, o filtros globales.
4. **Reversibilidad**: soft-delete de una company deja huella en múltiples tablas (`shifts`, `time_entries`, `shift_closeout_reports`, `payroll_review_notes`, `movements`, …). Rollback limpio no es trivial.
5. **Auditoría**: cualquier `time_entries` demo entra en tablas de auditoría reales.

## 3. Qué se necesita para desbloquear

Antes de ejecutar el runbook, alguno de los siguientes:

- **Opción A — Proyecto Supabase separado para staging/demo.** Un segundo proyecto (staging) donde se pueda correr el seed sin tocar la DB productiva. Es el patrón industry-standard y lo que asume el plan Sprint 47.
- **Opción B — Instancia demo con feature flag y guardrails.** Documentar y revisar explícitamente:
  - trigger/filtro global que oculte cualquier company con label `DEMO` a admins productivos;
  - exclusión explícita de tenants `DEMO` en jobs de payroll, notificaciones, exports, y `auto_close_periods`;
  - script de rollback aprobado que borre todos los rastros del tenant demo;
  - aprobación humana explícita antes del seed;
  - revisión de RLS para confirmar aislamiento por `company_id` en todas las tablas tocadas por el seed.
- **Opción C — Screenshots sintéticos.** Diseñar mockups a partir de la UI real (sin seed en DB) usando datos genéricos renderizados en un entorno controlado. Descarta 100% el riesgo pero produce assets menos "vivos".

Ninguna de las tres decisiones pertenece a este sprint — todas requieren aprobación explícita de quien opere la producción.

## 4. Qué NO se ejecutó

- **Cero writes**: no se creó company, employees, clients, locations, shifts, shift_assignments, time_entries, closeouts ni evidence.
- **Cero cambios de schema**: no migration.
- **Cero cambios RLS/auth/edge functions/payments/bookings/chat**.
- **Cero exposición de datos productivos**: la única lectura fue `SELECT count(*) FROM companies`, sin nombres, sin PII.
- **Cero pantallazos desde Vista global** (regla Sprint 47).

## 5. Estado de los placeholders/IDs

Todos siguen como alias sin resolver. No se generó ningún `uuid` real:

```
COMPANY_DEMO_ID          = pendiente
SHIFT_DEMO_FUTURE        = pendiente
SHIFT_DEMO_INPROGRESS    = pendiente
SHIFT_DEMO_ENDED         = pendiente
SHIFT_DEMO_SUBMITTED     = pendiente
SHIFT_DEMO_NEEDS_CORR    = pendiente
SHIFT_DEMO_PENDING_FINAL = pendiente
SHIFT_DEMO_APPROVED      = pendiente
SHIFT_DEMO_NO_SHOW       = pendiente
SHIFT_DEMO_MISSING_INFO  = pendiente
```

Los alias se siguen usando en `LOOM_GUIDE.md`, `SALES_DECK_OUTLINE.md` y `screenshots/README.md`.

## 6. Estado del usuario demo

`admin.demo@example.com` **no fue creado**. No hay cuenta a la cual entregar acceso.

## 7. Estado de los 9 escenarios

Todos siguen **definidos pero no seedeados**. Ver `STAFly_COMMAND_CENTER_DEMO_TENANT_PLAN.md` §5.

## 8. Próximo paso recomendado

1. Decidir entre Opción A (proyecto Supabase separado) u Opción B (guardrails + feature flag) u Opción C (mockups sintéticos) del §3.
2. Si es A: crear el segundo proyecto Supabase, apuntar una build de staging a él, y ejecutar `STAFly_COMMAND_CENTER_SPRINT_47_DEMO_TENANT_RUNBOOK.md` allí.
3. Si es B: escribir el sprint de guardrails + rollback antes de tocar cualquier tabla.
4. Si es C: definir el sprint de mockups como alternativa temporal para desbloquear el deck.
5. Solo después de esa decisión + su ejecución, se puede **re-ejecutar Sprint 46B** para capturar los 21 screenshots pendientes y grabar los 5 Looms.

---

## Confirmaciones finales

- **Provisionamiento:** no ejecutado.
- **Entorno:** Lovable Cloud, DB única compartida con 8 tenants productivos.
- **Producción:** no tocada.
- **Datos reales:** no leídos, no copiados, no expuestos.
- **Mezcla de tenants:** no ocurrió porque no se creó ningún tenant demo.
- **Payroll logic:** sin cambios.
- **RLS / auth / edge functions:** sin cambios.
- **Payments / bookings / chat:** sin cambios.

---

## Nota Sprint 49 — Opción A elegida (segundo proyecto Supabase)

Sprint 49 formaliza el plan para crear un **segundo proyecto Supabase** dedicado a staging/demo, separado de la DB productiva. Es la ruta principal para desbloquear Sprint 48 (seed del tenant demo) y Sprint 46B (screenshots + Looms).

Ver `STAFly_COMMAND_CENTER_SPRINT_49_STAGING_ENV_PLAN.md` para arquitectura, schema sync sin datos, seed demo, RLS/payroll-safe y checklist de aprobación.

Hasta que el segundo proyecto exista y pase el checklist §10 del plan Sprint 49, **prohibido** correr el runbook de seed contra la DB productiva actual.
