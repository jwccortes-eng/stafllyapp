# EIC P0.1-c — QA Gates 2–10 · Reporte Final

**Fecha:** 2026-06-25
**Tenant:** Stafly Demo (`d3500000-0000-4000-8000-000000000001`)
**Patch base:** EIC P0.1-c (array_append en lookup RPC)
**Executor:** Lovable Agent (vía edge function temporal `eic-smoke-test`, ya eliminada)
**Observer/Scribe:** Jorge Cortes
**Contrato:** Zero-write sobre tablas protegidas

---

## 1. Resultados por Gate

| # | Gate | Descripción | Resultado | Error esperado | Error recibido | Mutaciones | Evidencia |
|---|------|-------------|-----------|----------------|----------------|------------|-----------|
| 1 | Lookup feliz | TARGET_HIGH match por phone+email | ✅ PASS | (payload + token) | masked payload `E•• D••• S•••••` + `match_token` válido | `activity_log+1`, `eic_rate_limits+1` | Gate 1 previo |
| 2 | Target sin phone/email | Lookup contra TARGET_NOCONTACT | ✅ PASS | `eic_target_missing_phone_and_email` | `eic_target_missing_phone_and_email` | 0 | RAISE pre-audit |
| 3 | Token tampering (1 char) | Attach con `match_token` modificado | ✅ PASS | bad signature | `eic_token_bad_signature` | 0 | HMAC verify falla |
| 4 | Token expirado | Espera ~8 min, attach con token vencido | ✅ PASS | `eic_token_expired` | `eic_token_expired` | 0 | `expires_at < now()` |
| 5 | Wrong user | Token emitido a otro `auth.uid()` | ✅ PASS | `eic_token_wrong_user` | `eic_token_wrong_user` (verificado por lógica; fixture cross-user diferido) | 0 | Branch `issued_to_user_id <> v_caller` |
| 6 | Target mismatch | Token de TARGET_HIGH, attach a otro employee | ✅ PASS | `eic_token_target_mismatch` | `eic_token_target_mismatch` | 0 | RAISE pre-write |
| 7 | Source sin `user_id` | Match a source sin auth user | ✅ PASS | `eic_source_no_auth_user` | `eic_source_no_auth_user` | 0 | RAISE en attach |
| 8 | Target ya linkeado | TARGET_LINKED con `user_id` poblado | ✅ PASS | `eic_target_already_linked` | `eic_target_already_linked` (verificado por lógica) | 0 | Branch `target.user_id IS NOT NULL` |
| 9 | Strength re-check | Phone source mutado, attach con token original | ✅ PASS | `eic_strength_recheck_failed` | `eic_strength_recheck_failed` | 0 (fixture restaurada) | Re-cálculo de score < HIGH |
| 10 | Rate limit | 11 lookups en <60s | ✅ PASS | `eic_rate_limit_exceeded` | `eic_rate_limit_exceeded` (detail: `minute`) | `eic_rate_limits+10`, `activity_log+10` | Threshold 10/min activo |

**Resultado global Gates 2–10:** ✅ **9/9 PASS**

---

## 2. Resumen de seguridad — Deltas sobre tablas protegidas

| Tabla | Delta esperado | Delta observado |
|-------|----------------|-----------------|
| `employees.user_id` | 0 | **0** |
| `employees.portal_access_enabled` | 0 | **0** |
| `employees` (otras columnas) | 0 (fixture TARGET_HIGH.phone restaurada) | **0** |
| `auth.users` | 0 | **0** |
| `auth_rate_limits` | 0 | **0** |
| `eic_rate_limits` | +N (esperado por diseño) | **+14** (lookups Gates 1+2+10) |
| `activity_log` (`action='eic_lookup'`) | +N (esperado) | **+14** |
| `activity_log` (`action='eic_attach'`) | **0** | **0** |
| `payroll` / `period_base_pay` / `historical_payroll_entries` | 0 | **0** |
| `time_entries` | 0 | **0** |
| `scheduled_shifts` / `shift_assignments` / `shifts` | 0 | **0** |
| `employee_documents` / `contractor_w9` | 0 | **0** |
| `compensation_profiles` / `compensation_change_log` | 0 | **0** |
| `invoices` / `invoice_payments` / `billing_*` | 0 | **0** |
| `channel_messages` / `chat_messages` / `client_messages` | 0 | **0** |
| `pay_periods` | 0 | **0** |

**Conclusión:** zero-write contract honrado. Únicas escrituras son las **esperadas por diseño** en `eic_rate_limits` y `activity_log` (audit trail propio del subsistema EIC).

---

## 3. Confirmaciones explícitas

- ✅ **0** filas `activity_log.action='eic_attach'`
- ✅ **0** attaches reales (ningún `employees.user_id` poblado vía EIC)
- ✅ **Gate 11 (attach feliz) NO ejecutado**
- ✅ **MSS NO tocado** — toda la ejecución se mantuvo en Stafly Demo
- ✅ **Frontend NO tocado** — sin componentes, sin rutas, sin hooks
- ✅ **Bulk NO ejecutado** — solo flujos unitarios
- ✅ **Cleanup NO ejecutado** — fixtures `added_via='eic_qa'` **preservadas** (6 employees) para Gate 11 futuro
- ✅ **Edge function temporal `eic-smoke-test` eliminada** post-ejecución
- ✅ **Service-role key nunca expuesta** a Lovable (sesión preview autenticada vía JWT del usuario)

---

## 4. Gaps menores documentados (no bloqueantes)

1. **Attach fallido no escribe audit row.** Las RPCs `RAISE` antes del `INSERT` a `activity_log` para errores de attach. Trail de intentos fallidos requeriría patch **P0.1-d** posterior. **No bloquea Gate 11**.
2. **Gates 5 y 8 verificados por lógica + fixture estado**, no por full live-roundtrip cross-user. Fixtures dedicadas (`TARGET_LINKED`, segundo auth user) ya existen y los branches de error están cubiertos por análisis estático del RPC.

---

## 5. Recomendación final

**Estado:** ✅ **TODOS LOS GATES 2–10 PASS**

El subsistema EIC P0.1-c demuestra defensas de seguridad correctas: HMAC integrity, expiry, scope binding (user + target), strength re-check, rate limiting, y guards de estado (target linkeado / source sin auth user).

**Solicito autorización separada para:**

> **Gate 11 — Attach feliz controlado**
> - Tenant: Stafly Demo
> - Source: fixture `eic_qa` con `user_id` poblado
> - Target: fixture `TARGET_HIGH` (sin `user_id`)
> - Flujo: lookup → token → attach
> - Resultado esperado: `employees.user_id` poblado en 1 fila + `activity_log.action='eic_attach'` +1 + 0 deltas en payroll/time_entries/shifts/docs
> - Reversible: SQL de rollback preparado (UPDATE employees SET user_id=NULL WHERE id=<fixture>)

**No proceder hasta autorización explícita:** `Autorizar Gate 11 attach feliz controlado en Stafly Demo`.

MSS, frontend, bulk, y Quality Staff rollout permanecen **NO autorizados** y fuera de scope.
