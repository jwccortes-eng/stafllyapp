# Stafly Command Center v1 — Sprint 49 Staging/Demo Environment Plan

**Status:** planning / architecture / documentation-only.
**No writes.** No cambia código, DB productiva, RLS, auth, payroll, `time_entries`, `shift_assignments`, `scheduled_shifts`, edge functions, tenants, payments, bookings ni chat.

Sprint 49 formaliza la **Opción A** identificada en Sprint 48: crear un **segundo proyecto Supabase real** para staging/demo, separado de la DB productiva de Lovable Cloud. Este documento es el plan; ninguna acción externa se ejecuta desde este sprint.

---

## 1. Por qué un ambiente staging/demo separado

- Sprint 48 confirmó que Lovable Cloud opera sobre **una única base de datos** con **8 companies productivas**.
- Provisionar un tenant demo en esa DB implica escribir en producción, aunque se aísle por `company_id`. Prohibido por reglas duras del sprint.
- Sin ambiente separado no hay forma segura de:
  - capturar los 21 screenshots pendientes,
  - grabar los 5 Looms,
  - correr QA/training,
  - hacer pruebas destructivas sin arriesgar payroll real.

## 2. Riesgos concretos de seguir con DB única

1. Contaminación de payroll (triggers, jobs, notificaciones).
2. RLS drift: un error deja workers/turnos demo visibles a admins productivos.
3. Aparición de "STAFly Demo Hospitality Ops" en exports, dashboards internos, filtros globales.
4. Rollback no trivial: soft-delete de una company deja huella en `shifts`, `time_entries`, `shift_closeout_reports`, `payroll_review_notes`, `movements`.
5. Auditoría contaminada: `time_entries` demo entran en tablas de auditoría reales.
6. Riesgo reputacional: cualquier screenshot filtrado desde esta DB puede exponer clientes reales.

## 3. Arquitectura recomendada

```text
┌─────────────────────────────────────┐        ┌─────────────────────────────────────┐
│         PRODUCTION                  │        │         STAGING / DEMO              │
│  Supabase project (Lovable Cloud)   │        │  Second Supabase project (nuevo)    │
│  - 8 companies reales               │        │  - 1 company: STAFly Demo Hosp. Ops │
│  - Datos reales, PII, payroll real  │        │  - Cero datos reales                │
│  - Payroll jobs activos             │        │  - Payroll jobs desactivados / no-op│
│  - Edge functions productivas       │        │  - Edge functions estáticas / mocks │
│                                     │        │  - Cero pagos, cero bookings reales │
│  Uso: operación real                │        │  Uso: screenshots, Looms, demo, QA  │
│  NO usar para capturas              │        │  Único origen válido de assets      │
└─────────────────────────────────────┘        └─────────────────────────────────────┘
        ▲                                                     ▲
        │ frontend build prod                                 │ frontend build staging
        │ VITE_SUPABASE_URL=<prod>                            │ VITE_SUPABASE_URL=<staging>
        │ VITE_SUPABASE_PUBLISHABLE_KEY=<prod anon>           │ VITE_SUPABASE_PUBLISHABLE_KEY=<staging anon>
```

Reglas:
- Cada proyecto Supabase tiene su propio Auth, su propia DB, sus propias RLS, sus propios secrets.
- El frontend de Lovable se apunta a **uno solo por build**.
- Ningún job del staging puede llamar servicios reales (Stripe, notificaciones, webhooks a clientes reales, Connecteam real).

## 4. Variables / envs necesarias

En el frontend (Vite):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Estos vienen de la conexión Cloud/Supabase — **no** se commitean valores staging al repo. En Lovable se maneja como una conexión distinta cuando se apunta al proyecto staging.

En edge functions/backend del proyecto staging:

- Ninguna clave de pago real (usar `STRIPE_TEST_*` si aplica).
- Ningún webhook a clientes reales.
- `LOVABLE_API_KEY` propia del proyecto staging si aplica.
- Cualquier secret manejado por `add_secret`/`generate_secret`, jamás en repo.

## 5. Cómo conectar Lovable al proyecto staging/demo

Este paso requiere aprobación humana explícita. Documentación-only aquí; no se ejecuta.

1. En Lovable, crear/duplicar el proyecto Stafly como una segunda instancia apuntada al nuevo Supabase (o alternar la conexión Cloud).
2. Verificar en `.env` que las variables `VITE_SUPABASE_*` corresponden al proyecto staging.
3. Etiquetar visualmente la build: un badge "STAGING / DEMO" en la UI (fuera de alcance de este sprint; documentar como TODO en Sprint 50).
4. Prohibir explícitamente que cualquier miembro del equipo capture o grabe desde el build productivo.

## 6. Schema sync desde producción sin datos reales

**Objetivo:** replicar la **estructura**, nunca las filas.

1. Exportar migraciones del proyecto productivo desde `supabase/migrations/` (ya están versionadas en el repo Lovable — no hay que tocar la DB productiva para obtenerlas).
2. Aplicar el mismo conjunto de migraciones en el proyecto staging (secuencial, en orden).
3. Verificar que se creen:
   - todas las tablas (`companies`, `employees`, `shifts`, `time_entries`, `shift_closeout_reports`, `payroll_review_notes`, etc.),
   - RLS policies,
   - functions (`has_role`, `has_company_role`, `canAccessAdminForCompany` si aplica),
   - triggers no destructivos.
4. **No** copiar tablas con PII (`profiles`, `employees`, `auth.users`, `clients`, `client_contacts`, `worker_profiles`, `worker_documents`, `employee_documents`, `contractor_w9`, `tax_forms_1099`, `finance_*`, `historical_payroll_entries`, `reconciliation_*`, `passport_*`).
5. **No** copiar buckets de storage con documentos reales.
6. **No** copiar `auth.users` reales — Auth del staging se rearma con cuentas demo.
7. Deshabilitar / marcar como no-op cualquier trigger que llame servicios externos (notificaciones, Stripe, Connecteam).

Checklist schema sync:

- [ ] Migraciones aplicadas en orden en staging.
- [ ] RLS habilitado en cada tabla pública.
- [ ] Grants a `authenticated` / `service_role` presentes.
- [ ] Funciones críticas (`has_role`, `has_company_role`) existen y compilan.
- [ ] Ningún row real fue copiado (verificable con `SELECT count(*)` = 0 en cada tabla de negocio antes del seed demo).

## 7. Seed demo (staging)

Cero datos reales. Todo ficticio. Ejecutar desde la UI operativa del staging siempre que sea posible; solo caer a SQL cuando sea imprescindible y con script versionado.

Contenido del seed (ver `STAFly_COMMAND_CENTER_DEMO_TENANT_PLAN.md` §4–§5):

- 1 company: `STAFly Demo Hospitality Ops`.
- 1 admin demo: `admin.demo@example.com`.
- 8 workers demo (`@example.com`, teléfonos 555-01XX).
- 5 venues demo.
- 6 roles demo.
- 9 shifts demo (Futuro, En curso, Terminado, Cierre enviado, Requiere corrección, Pendiente final, Aprobado, No-show, Missing info).
- Assignments demo.
- `time_entries` demo aislados.
- Closeouts / evidencia demo aislados.
- Estados PRQ demo.

Checklist seed demo:

- [ ] Todo `company_id` de rows demo apunta a la company demo.
- [ ] Emails terminan en `@example.com`.
- [ ] Teléfonos en 555-01XX.
- [ ] Nombres contienen "Demo".
- [ ] Ningún `time_entries` demo se filtra a payroll productivo (imposible por diseño: son DB distintas).

## 8. RLS / Auth en staging

- RLS **encendido** en todas las tablas públicas, igual que producción.
- Grants estándar (`authenticated`, `service_role`, `anon` solo cuando la policy lo permite).
- `has_role` / `has_company_role` funcionando.
- Cuentas Auth solo demo: `admin.demo@example.com` + workers demo.
- Verificar que el admin demo **solo** ve `STAFly Demo Hospitality Ops` y ningún otro tenant.
- Verificar que no existe cuenta con acceso cruzado producción↔staging (imposible por diseño, pero explicitar).

## 9. Payroll-safe en staging

- Payroll sigue calculándose con **horas reales** de `time_entries` o ajustes aprobados. En staging esas horas son ficticias.
- **No** conectar staging a Stripe/pagos reales.
- **No** conectar staging a Connecteam real.
- **No** activar jobs cron reales (payroll consolidation, exports, notificaciones a workers reales). Si el proyecto Supabase clonado tiene jobs programados, deshabilitarlos manualmente antes del seed.
- Notificaciones (email/SMS/push): apuntar a un dominio/número catch-all o desactivar totalmente.
- Copy del deck sigue con las mismas frases prohibidas ("paga automáticamente", "sin revisión", etc.).

## 10. Checklist de aprobación antes de usarlo

- [ ] Segundo proyecto Supabase creado (por quien administra Lovable Cloud / Supabase).
- [ ] Nombre del proyecto claramente marcado como STAGING/DEMO.
- [ ] Migraciones aplicadas (§6).
- [ ] Seed ejecutado (§7).
- [ ] RLS verificado (§8).
- [ ] Payroll-safe verificado (§9).
- [ ] Cuenta admin demo verificada: solo ve la company demo.
- [ ] Deep-links funcionando: `/app/timeclock?shiftId=<SHIFT_DEMO_ID>`, `/app/payroll-review-queue?shiftId=<SHIFT_DEMO_ID>`.
- [ ] Ningún pago real, notificación real, webhook real activo.
- [ ] Nadie del equipo tiene permiso para capturar screenshots/Looms desde el build productivo.

## 11. Plan para re-ejecutar Sprint 48 y Sprint 46B

1. Con el ambiente staging aprobado (§10), volver a correr `STAFly_COMMAND_CENTER_SPRINT_47_DEMO_TENANT_RUNBOOK.md` **allí** (no en producción).
2. Registrar los `uuid` demo en el vault interno del equipo (nunca en repo). Los alias del plan siguen siendo la referencia pública.
3. Ejecutar Sprint 46B para los 21 screenshots pendientes y los 5 Looms, siguiendo `STAFly_COMMAND_CENTER_SPRINT_45_ASSET_RUNBOOK.md`.
4. Publicar screenshots en `docs/demo/screenshots/` y actualizar el README con `[x]`.
5. Marcar como grabables los 5 Looms del `LOOM_GUIDE.md`.
6. Desbloquear slides 1, 4, 5, 6, 7, 10 del `SALES_DECK_OUTLINE.md`.

## 12. Decisión recomendada final (A/B/C de Sprint 48)

- **A — Proyecto Supabase separado.** Recomendado. Es el patrón industry-standard, elimina el riesgo de contaminación de producción de raíz, y habilita training y QA futuros.
- **B — Guardrails + feature flag en la DB única.** Solo si crear un segundo proyecto no es viable. Requiere trabajo de plataforma (filtros globales, exclusión en jobs, rollback script). Mayor riesgo residual.
- **C — Mockups sintéticos.** Táctico. Sirve para deck comercial rápido, no habilita training ni QA operativo.

**Recomendación:** ejecutar **A** como camino principal; usar **C** solo como puente temporal si el deck necesita salir antes de que **A** esté listo.

## 13. Checklist para crear segundo Supabase project (Opción A)

- [ ] Crear proyecto Supabase nuevo (fuera de este sprint; requiere acceso Lovable/Supabase).
- [ ] Nombrarlo `stafly-staging-demo` (o equivalente inequívoco).
- [ ] Region: la más cercana al equipo de ventas.
- [ ] Plan mínimo suficiente para los 9 escenarios.
- [ ] Guardar URL/anon/service key en el vault interno; nunca en repo.
- [ ] Conectar Lovable a este proyecto en una build separada.
- [ ] Aplicar migraciones (§6).
- [ ] Ejecutar seed (§7).
- [ ] Verificar checklist §10 completo antes de compartir con el equipo.

## 14. Riesgos pendientes

- **Costo del segundo Supabase project**: bajo, pero existe.
- **Divergencia de schema**: cada migración nueva en producción debe aplicarse también en staging; falta proceso automático.
- **Divergencia de datos demo**: si el schema evoluciona, la seed puede romperse; documentar en el runbook la re-seed.
- **Riesgo humano**: alguien puede confundirse de build y capturar desde producción. Mitigar con badge "STAGING/DEMO" visible en la UI (TODO Sprint 50).
- **Almacenamiento de UUIDs demo**: si se filtran, exponen la estructura de escenarios; poco sensible pero recordar mantenerlos fuera del repo.

## 15. Próximo paso recomendado

1. Aprobar formalmente la Opción A.
2. Ejecutar §13 (crear el segundo proyecto Supabase).
3. Ejecutar §6 (schema sync sin datos).
4. Ejecutar §7 (seed demo) via el runbook Sprint 47 apuntado al staging.
5. Correr §10 (checklist de aprobación).
6. Recién entonces, disparar Sprint 46B (screenshots + Looms + deck).

---

## Confirmaciones finales

- **Documentation-only.** No writes, no migraciones, no cambios en `src/**`, RLS, auth, payroll, `time_entries`, `shift_assignments`, `scheduled_shifts`, edge functions, tenants, payments, bookings ni chat.
- **Producción:** no tocada.
- **Datos reales:** no leídos, no copiados, no expuestos.
- **Secrets:** ninguno guardado en repo.
