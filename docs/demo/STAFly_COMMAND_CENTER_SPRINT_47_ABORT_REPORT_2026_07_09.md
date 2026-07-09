# STAFly Command Center — Sprint 47 (intento 2, 2026-07-09): ABORTADO por gate SP52

**Fecha del intento:** 2026-07-09
**Resultado:** ⛔ **ABORTADO antes de cualquier write.**
**Motivo:** el gate obligatorio de Sprint 52 no está cumplido. Ejecutar el seed en este momento significaría escribir datos sintéticos en la **DB productiva** (proyecto Lovable Cloud con 8 tenants reales). Prohibido explícitamente por las reglas del propio Sprint 47.

Cero writes ejecutados. Cero cambios a `src/**`, RLS, auth, payroll, edge functions, tenants reales, `time_entries`, `shift_assignments`, `scheduled_shifts`, payments, bookings, chat, documents. Ningún email/SMS/webhook disparado.

---

## 1. Evidencia del gate fallido

| Check requerido por SP47 | Estado | Evidencia |
|---|---|---|
| Formulario SP52 §0 completado | ❌ FAIL | `Fecha de ejecución: YYYY-MM-DD`, `Responsable: <nombre / handle interno>`, `Últimos 4 chars del project ref staging: xxxx`, `Región: <región>` — todos los checkboxes siguen sin marcar. |
| Supabase staging/demo creado | ❌ FAIL | Sin project ref staging registrado. |
| Segundo proyecto Lovable apuntando a staging | ❌ FAIL | Sin fecha de deploy Lovable staging. |
| Badge STAGING/DEMO capturado en staging | ❌ FAIL | `docs/demo/screenshots/sp52-badge-staging-desktop.png` y `sp52-badge-staging-mobile.png` **no existen** en el repo. |
| Side effects externos auditados y neutralizados | ❌ FAIL | Sin lista de triggers/funciones neutralizados en SP52 §0. |
| Producción no tocada | ✅ Sigue intacta | Confirmado: sin migraciones ni writes desde SP48. |

Además, en este proyecto Lovable actual:

- `PGHOST` termina en `-us-east-1.pooler.supabase.com` — corresponde al pooler del **proyecto productivo** (`jplhtputzixwqarqlrth`).
- `SELECT count(*) FROM public.companies` = **8**, coincide con los 8 tenants productivos registrados en SP48.
- No hay variables de entorno ni credenciales del proyecto staging (no puede haberlas: staging todavía no existe).

Conclusión: cualquier `INSERT` que corriera desde aquí escribiría en la DB productiva. Ejecutar el seed sería una violación directa de:

- *"El seed solo puede correr contra el proyecto Supabase staging/demo."*
- *"Está estrictamente prohibido correr seed, migraciones o writes contra producción, especialmente contra el project ref productivo `jplhtputzixwqarqlrth`."*
- *"Si cualquiera de estos puntos falta, ABORTAR. No ejecutar seed."*

---

## 2. Qué acciones NO tomé (y por qué)

- ❌ No corrí `INSERT` en `companies`, `profiles`, `user_roles`, `employees`, `worker_profiles`, `locations_v2`, `shifts`, `scheduled_shifts`, `shift_assignments`, `time_entries`, `shift_closeout_reports`, ni ninguna otra tabla.
- ❌ No creé `admin.demo@example.com` en `auth.users` (requeriría service role staging, que no existe).
- ❌ No abrí ninguna transacción de prueba "solo para validar el shape del seed".
- ❌ No creé archivos nuevos en `supabase/seed/demo/` ni `scripts/demo/` — un seed script que apuntara al ambiente actual sería trampa esperando a ser detonada.
- ❌ No toqué `docs/demo/STAFly_COMMAND_CENTER_SPRINT_47_DEMO_TENANT_RUNBOOK.md` para "marcarlo como en progreso" — su nota SP48 sigue siendo la fuente de verdad hasta que SP52 esté cerrado.

---

## 3. Qué SÍ hice

- ✅ Verifiqué el estado del gate SP52 (§0 vacío, sin screenshots).
- ✅ Verifiqué que la DB conectada es producción (8 companies, host productivo).
- ✅ Escribí este reporte de abort.

---

## 4. Reporte final (formato SP47)

- **Ambiente usado:** ninguno. Abortado antes de tocar ningún ambiente.
- **Project staging/demo confirmado:** ❌ no existe. Sin secrets expuestos porque no hay secrets que exponer.
- **NO producción:** ✅ confirmado — producción no tocada.
- **Fecha de ejecución del seed:** N/A (abortado).
- **Responsable:** agente Lovable (aborta por gate).
- **Company demo creada:** 0.
- **Workers demo:** 0.
- **Venues demo:** 0.
- **Roles demo:** 0.
- **Shifts demo:** 0.
- **Escenarios creados:** 0 de 9.
- **`time_entries` demo:** 0.
- **Closeouts/evidence demo:** 0.
- **Side effects neutralizados:** N/A (no auditados aún en staging que no existe).
- **QA desktop:** N/A (no hay data para revisar).
- **QA mobile:** N/A.
- **Cero producción tocada:** ✅.
- **Cero datos reales manipulados:** ✅.
- **Cero cambios a payroll/auth/RLS/edge functions:** ✅.

---

## 5. Riesgos pendientes

1. **Bloqueo humano de infraestructura (mismo de SP52):** sin owner ejecutando Pasos 1–6 del runbook SP52 §2, SP47 seguirá abortando en cada intento.
2. **Riesgo de "atajo":** existe la tentación de correr un "seed pequeño solo para ver cómo se ve" contra la DB actual. Esto contaminaría producción con `Demo` workers/companies y podría filtrarse a queues operativas reales, notificaciones y payroll. **No hacerlo bajo ningún concepto.**
3. **Side effects sin auditar:** aun cuando staging exista, si no se completa SP52 Paso 4 antes del seed, los triggers de `public.*` podrían enviar emails/SMS/Stripe reales con datos ficticios.

---

## 6. Próximo paso recomendado

1. **Cerrar SP52 primero.** Owner + DevOps ejecutan Pasos 1–6 del runbook SP52 §2, rellenan el formulario SP52 §0 y suben los dos screenshots `sp52-badge-staging-{desktop,mobile}.png`.
2. **Recién entonces, reintentar SP47** apuntando al project ref staging (nunca al productivo).
3. **Después de SP47 verde:** Sprint 46B (los 10 PNGs de `SPRINT_51 §4`) → deck comercial (guion de 3 min, `SPRINT_51 §6`).
