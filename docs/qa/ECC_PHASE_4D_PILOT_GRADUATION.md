# ECC — Fase 4D · Graduación del piloto y contrato de adopción

Fecha: 2026-08-06 · Alcance: `company_id = 7c1458db-109a-4042-a2b0-78e04427ec2d` (QA Testing).
Modelo puro: no se tocó Stripe, billing, payroll, `time_entries`, `company_modules`, `plan_code`, `subscriptions`, auth ni RLS. Legacy **no** se retiró.

## 1. Estado objetivo

Modo nuevo `ecc_stable`. Modos permitidos: `legacy_only`, `compare`, `ecc_pilot`, `ecc_stable`, `rolled_back`.

`ecc_stable` sólo se asigna con: criterios de observación aprobados, `expected_version` coincidente, aprobación humana con rol autorizado (`global_owner` | `owner`), motivo explícito y auditoría. El rollback sigue disponible y ninguna otra compañía cambia de modo.

## 2. Graduación

Transición canónica e idempotente en `src/lib/ecc/graduation.ts`:

```
graduateEccPilot(companyId, expectedVersion, approvedBy, reason, { approverRole, currentVersion, registry, evidence, at })
```

No es un update directo: revalida Fases 4B y 4C antes de cambiar el modo.

| Criterio | Esperado | Observado | Resultado |
| --- | --- | --- | --- |
| Reporte 4B (criterios) | aprobados | aprobados | ✅ |
| ECC gobernó en el piloto | sí | sí | ✅ |
| Reporte 4C (veredicto) | `stable` | `stable` | ✅ |
| Ventana de observación | completa | completa (108 decisiones / 6 sesiones) | ✅ |
| Mismatches legacy vs ECC | 0 | 0 | ✅ |
| Alertas | 0 | 0 | ✅ |
| Confidence HIGH en críticas | 60/60 | 60/60 | ✅ |
| Cross-tenant | 0 | 0 | ✅ |
| Rollbacks | 0 | 0 | ✅ |
| Latencia p95 | ≤ 250 ms | p50 14 ms · p95 22 ms | ✅ |
| Criterios de salida 4C | todos | todos | ✅ |

Aprobación: `ECC_GRADUATION_APPROVAL` — `global_owner`, `2026-08-06T14:00:00.000Z`, `expected_version = 2`.
Auditoría registrada: `company_id`, `flag_key`, `from_mode`, `to_mode`, `expected_version`, `current_version`, `approved_by`, `approver_role`, motivo, timestamp, idempotencia y `otherCompaniesAffected = 0`.

Repetir la llamada devuelve `alreadyGraduated = true` (no-op explicado). Version drift, rol sin permiso, motivo vacío, falta de evidencia u observación no estable bloquean la transición.

## 3. Comportamiento en `ecc_stable`

- ECC gobierna la decisión efectiva en las 18 superficies del piloto.
- Legacy se sigue calculando en sombra en cada decisión (`legacyDecision` nunca nulo).
- Cualquier divergencia se registra como incidente; **no hay fallback silencioso**: cuando legacy gobierna, queda el motivo escrito y un incidente `resolver_error` / `legacy_mismatch`.
- Un error crítico dispara rollback según política.
- Observabilidad intacta: `correlation_id`, latencia, confidence y motivo por decisión.

## 4. Protección de flota

`assertFleetContainment()` confirma sobre la flota real (8 compañías):

- `ecc_stable`: sólo QA Testing (1).
- `legacy_only`: las otras 7, sin cambios.
- No existe bandera global que active ECC para la flota (`globalFlagExists = false`).
- `company_id` obligatorio; compañía desconocida o ausente ⇒ `legacy_only` (fail-closed).
- El cambio de tenant nunca hereda el modo anterior (`resolveModeAfterTenantSwitch`).

## 5. Contrato de adopción futura

`ADOPTION_CONTRACT` — 11 fases obligatorias, en orden estricto y no salteables:

1. Readiness READY o CONDITIONAL sin blocker · 2. Capabilities críticas 100 % representadas · 3. Límites explicados · 4. Overrides conocidos · 5. Sin contradicciones de acceso · 6. Payroll evaluado · 7. Rollback probado · 8. Aprobación humana · 9. Período en sombra · 10. Observación del piloto · 11. Criterios de graduación.

`evaluateAdoptionContract()` bloquea en la primera fase incumplida y marca como no cumplidas todas las posteriores: no se puede saltar ninguna.

## 6. Retiro futuro de Legacy (diseño, no ejecutado)

`buildLegacyRetirementPlan()` — `executed: false`, ventana de rollback de 30 días.

| Fuente | Rol actual | Riesgo al retirar | Qué debe demostrarse antes |
| --- | --- | --- | --- |
| `useSubscription` | Plan efectivo y límites en cliente | Pantallas sin plan | ECC entrega plan version, límites y estado con la misma forma consumida hoy |
| `ModuleGate` | Gate visual por plan/módulos | Fugas o bloqueos indebidos | 100 % de superficies mapeadas y 0 mismatches sostenidos |
| `plan_code` | Tier comercial legacy | Pérdida de trazabilidad | Plan versions inmutables cubren el histórico |
| `company_modules` | Override manual | Overrides no representados | Todo override clasificado como entitlement |
| Fallback legacy | Red de seguridad | Denegaciones duras | 0 fallbacks durante toda la ventana estable |
| Observabilidad dual | Comparación legacy vs ECC | Ceguera ante regresiones | Observabilidad ECC autónoma equivalente |
| Rollback window | Retorno seguro | Sin reversión | 30 días en `ecc_stable` sin incidentes con política de rollback |

Precondiciones adicionales: ventana estable sostenida, 0 mismatches acumulados, aprobación humana específica con `expected_version` y plan de reversión probado. **No se retiró ninguna fuente.**

## 7. Incidentes ECC

| Código | Severidad | Acción automática | Rollback | Owner |
| --- | --- | --- | --- | --- |
| `unexpected_allow` | crítica | Congelar ECC y restaurar legacy | sí | ecc-core |
| `unexpected_deny` | crítica | Restaurar legacy de inmediato | sí | ecc-core |
| `cross_tenant` | crítica | Rollback y bloqueo del resolver | sí | ecc-core |
| `low_confidence` | alta | Gobierna legacy con motivo registrado | sí | ecc-core |
| `resolver_error` | crítica | Fallback explicado + alerta | sí | plataforma |
| `version_drift` | alta | Bloquear transición y reconciliar | sí | ecc-core |
| `dependency_missing` | alta | Denegar ECC y usar legacy | sí | ecc-core |
| `limit_mismatch` | media | Registrar y revisar plan version | no | comercial |
| `legacy_mismatch` | alta | Registrar incidente, sin silencio | no | ecc-core |

Cada incidente incluye severidad, `company_id`, capability, superficie, actor, `correlation_id`, decisión ECC, decisión Legacy, acción automática, rollback y owner.

## 8. QA

Suite `src/test/ecc-phase4d-graduation.test.ts` — **22 tests en verde**, cubriendo los 14 escenarios exigidos: graduación idempotente, version drift bloqueado, usuario sin permiso, QA Testing en `ecc_stable`, resto de compañías sin cambios, mobile y desktop, cambio de tenant, refresh, dos pestañas (correlación estable), mismatch simulado, rollback, recuperación posterior, cero impacto en payroll y cero impacto en billing.

Suite ECC completa: **90 tests en verde** (4A, 4B, 4C, 4D, read model y reconciliación). `tsgo --noEmit` sin errores.
Deuda ajena preexistente: `docs/qa/DEBT_DRIVER_SYNC_ROUNDTRIP_TEST_FAILURE.md`.

## 9. Confirmación

**QA Testing opera de forma estable bajo ECC, con Legacy en comparación temporal, rollback inmediato y cero cambios sobre las demás compañías.**
