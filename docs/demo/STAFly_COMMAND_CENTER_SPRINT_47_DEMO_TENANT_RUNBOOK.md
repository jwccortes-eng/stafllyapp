# Stafly Command Center v1 — Sprint 47 Demo Tenant Runbook

**Documentation-only.** Este runbook describe **cómo** provisionar el tenant demo "STAFly Demo Hospitality Ops" definido en `STAFly_COMMAND_CENTER_DEMO_TENANT_PLAN.md`. **No ejecuta cambios** — cualquier paso técnico debe ser revisado y aprobado explícitamente antes de correrse contra staging.

---

## 0. Precondiciones

- [ ] Ambiente de destino confirmado: **staging** (nunca producción).
- [ ] Backup verificado de staging (para poder revertir la seed si algo sale mal).
- [ ] Alguien con acceso a staging aprobó el plan (`DEMO_TENANT_PLAN.md`).
- [ ] Nadie está corriendo demos en vivo mientras se ejecuta el seed.

## 1. Paso A — Crear la company demo (staging)

**Modo preferido:** UI de admin/onboarding en staging. Nada de scripts directos a la base productiva.

1. Loguearse con cuenta admin de staging.
2. Crear nueva company:
   - Name: `STAFly Demo Hospitality Ops`
   - Slug: `stafly-demo-hospitality-ops`
   - Timezone: `America/New_York` (o el del pitch)
   - Label interno: `DEMO / STAGING`
3. Guardar `company_id` como `COMPANY_DEMO_ID` en el vault del equipo (no en el repo).

## 2. Paso B — Crear cuentas demo (staging)

Crear las 8 cuentas worker demo del §4 del plan, siempre con emails `@example.com` y teléfonos 555-01XX. No invitar cuentas humanas reales.

Crear también una cuenta admin demo (por ejemplo `admin.demo@example.com`) restringida a `COMPANY_DEMO_ID`.

## 3. Paso C — Seedear venues y roles

- Cargar los 5 venues del §4.
- Cargar los 6 roles del §4.
- Verificar que aparezcan **solo** dentro del tenant demo (aislamiento por `company_id`).

## 4. Paso D — Seedear los 9 escenarios

Ejecutar la seed **desde la UI operativa** (crear turnos + asignar workers + registrar clock manual donde aplique + enviar closeout donde aplique). Evitar SQL directo a `time_entries` o `scheduled_shifts` a menos que exista un script versionado revisado.

Escenarios en el orden recomendado (respeta dependencias temporales):

1. `SHIFT_DEMO_APPROVED` (-5d, cierre limpio)
2. `SHIFT_DEMO_PENDING_FINAL` (-4d)
3. `SHIFT_DEMO_NEEDS_CORR` (-3d)
4. `SHIFT_DEMO_SUBMITTED` (-2d)
5. `SHIFT_DEMO_ENDED` (-1d)
6. `SHIFT_DEMO_INPROGRESS` (hoy)
7. `SHIFT_DEMO_NO_SHOW` (hoy)
8. `SHIFT_DEMO_FUTURE` (+1d)
9. `SHIFT_DEMO_MISSING_INFO` (+1d, sin meeting point)

## 5. Paso E — Verificación de aislamiento

- [ ] Login con `admin.demo@example.com` → sidebar muestra **solo** STAFly Demo Hospitality Ops.
- [ ] Login con un admin productivo → **no** ve el tenant demo.
- [ ] Query interna (revisada) confirma que ningún `time_entries` demo comparte `company_id` con un tenant productivo.
- [ ] Payroll productivo no cambió: correr el checksum estándar antes/después del seed.
- [ ] Ningún dato real quedó copiado o referenciado por accidente.

## 6. Paso F — Registrar IDs demo

Una vez creados, guardar los `uuid` reales en la carpeta interna del equipo (nunca en el repo público). Mantener el mapeo:

```
COMPANY_DEMO_ID          = <uuid>
SHIFT_DEMO_FUTURE        = <uuid>
SHIFT_DEMO_INPROGRESS    = <uuid>
SHIFT_DEMO_ENDED         = <uuid>
SHIFT_DEMO_SUBMITTED     = <uuid>
SHIFT_DEMO_NEEDS_CORR    = <uuid>
SHIFT_DEMO_PENDING_FINAL = <uuid>
SHIFT_DEMO_APPROVED      = <uuid>
SHIFT_DEMO_NO_SHOW       = <uuid>
SHIFT_DEMO_MISSING_INFO  = <uuid>
```

En documentación pública siempre usar los alias, nunca los `uuid`.

## 7. Paso G — Handoff a Sprint 46 (re-ejecución)

- [ ] Confirmar checklist §10 del plan.
- [ ] Programar sesión de captura de screenshots (2h).
- [ ] Programar sesión de grabación de Looms (2h).
- [ ] Compartir link del tenant demo con Jorge + equipo comercial.

## 8. Rollback

Si algo sale mal durante el seed:

1. Suspender la company demo (no borrar hard, para preservar auditoría).
2. Restaurar staging desde backup previo si hubo daño colateral.
3. Documentar la falla en `docs/demo/` para futuros sprints.

## 9. Reglas de seguridad (recordatorio)

- Todo lo enumerado en `DEMO_TENANT_PLAN.md` §6.
- Nunca ejecutar este runbook contra producción.
- Nunca commitear `uuid` reales, tokens, o secrets.
- Nunca usar workers/clientes/venues reales para acelerar.

---

**Estado Sprint 47:** documentation-only. El provisioning técnico queda pendiente de aprobación explícita.

---

## Nota Sprint 48 — Provisioning bloqueado

Sprint 48 verificó que el proyecto opera sobre Lovable Cloud con **una única base de datos** que contiene 8 tenants productivos. **No existe staging separado**. Por seguridad, el tenant demo `STAFly Demo Hospitality Ops` **no fue provisionado**. Todos los IDs y el usuario `admin.demo@example.com` siguen pendientes.

Ver razón completa y opciones de desbloqueo en `STAFly_COMMAND_CENTER_SPRINT_48_PROVISIONING_REPORT.md`.

Hasta que se elija Opción A (proyecto Supabase separado), B (guardrails + feature flag) o C (mockups sintéticos), **prohibido** ejecutar el runbook de seed en esta DB.
