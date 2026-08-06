# ECC — Fase 2. Plan Versions + Entitlements canónicos

Estado: **entregado en modo sombra**. Legacy sigue gobernando el acceso real.
Fecha: 2026-08-06.

## 1. Alcance ejecutado

| Bloque | Entregable | Archivo |
|---|---|---|
| Capability catalog | Catálogo canónico namespaced `shared.*` / `stafly.*` / `parceros.*` con tipo, tier, dependencias, default, config requerida, módulo legacy equivalente y auditoría | `src/lib/ecc/capability-catalog.ts` |
| Plan versions | Entidad inmutable con `planKey`, `version`, producto, moneda, cadencia, vigencia, estado, autoría, aprobación, auditoría y **checksum FNV-1a verificable** | `src/lib/ecc/plan-versions.ts` |
| Limits | Límites canónicos (`limit_key`, valor, scope, hard/soft, umbral de aviso, política de exceso, ventana de medición, fuente, plan version, override) separados de permisos | `src/lib/ecc/plan-versions.ts` + `entitlements.ts` |
| Overrides | Registros append-only con target, valor, motivo obligatorio, aprobador, vigencia, prioridad, revocabilidad, versión, checksum e id idempotente | `src/lib/ecc/overrides.ts` |
| Resolver | `resolveEntitlements`, `resolveLimits`, `canUseCapability`, `explainCapability`, `getEffectiveCommercialAccess` | `src/lib/ecc/entitlements.ts` |
| Mapeo legacy + shadow | `mapLegacyCompanyToEcc`, `buildResolutionContext`, `buildShadowReport`, `summarizePhase2` | `src/lib/ecc/legacy-mapping.ts` |
| Command Center | Panel de solo lectura con plan version, checksum, límites, overrides, diffs legacy vs ECC, mapeos faltantes, dependencias legacy y readiness | `src/components/billing/EccPlanVersionPanel.tsx` |
| QA | 21 tests nuevos (31 en total con Fase 1) | `src/test/ecc-phase2-plan-versions.test.ts` |

## 2. Reglas de inmutabilidad

- Una versión publicada no se edita: `assertPlanVersionEditable` la rechaza y `draftNextVersion` produce siempre `version + 1` en estado `draft`.
- `effective_from` no puede anteceder a la versión vigente: no se reescribe historia.
- El checksum se calcula sobre el contenido comercial (capacidades, límites, cadencia, moneda, vigencia) con serialización estable; `verifyPlanVersion` detecta cualquier deriva.
- Los contratos anclados por `planVersionId` conservan su versión aunque exista una posterior (`stafly.free@v1` frente a `v2`).

## 3. Resolver: nunca un booleano suelto

Cada decisión devuelve `result`, `source`, `reason`, `confidence`, `contradiction`, `planVersion`, `override`, `limit`, `dependencies`, `missingConfig` y `effectiveAt`.

Orden de resolución: **override activo (mayor prioridad, más reciente) → versión de plan → default del catálogo**, y después el filtro de dependencias: una capacidad concedida cuya base está apagada queda inactiva con `source = "dependency"` y `contradiction = true`.

## 4. Mapeo inicial (sin escrituras)

| Fuente legacy | Destino canónico | Acción |
|---|---|---|
| `companies.plan_code` (+ `paid_features_enabled`) | `stafly.free` / `stafly.pro` / `stafly.enterprise` | `mapped`, reversible por tabla explícita |
| `company_modules` que difiere del plan | override de capability (concesivo o restrictivo) | `override_created` |
| `companies.max_employees` / `max_admins` distintos del plan | override de límite | `override_created` |
| `subscriptions` legacy | referencia | `informational` (no gobierna acceso ni cobro) |
| Módulo legacy sin capacidad canónica | — | `unmapped`, bloquea el cutover |

Propiedades verificadas: **idempotente** (el id del override deriva del checksum del contenido), **auditable** (motivo, autor, aprobador, nota), **reversible** (tablas de traducción bidireccionales), **tenant-safe** (overrides filtrados por `company_id` / `account_id`) y **explicable** (cada entrada trae `detail`).

Ninguna fuente legacy fue leída con escritura ni modificada: el mapeo es una función pura sobre el input del read model.

## 5. Shadow mode

`buildShadowReport` compara, capability por capability, la decisión legacy real (`plan tier OR company_modules.is_active`, igual que `useSubscription.canAccessModule`) contra la decisión canónica, y clasifica en `match`, `mismatch`, `legacy_only`, `ecc_only`, `unknown` y `missing_mapping`. También compara límites y expone las dependencias legacy restantes (`useSubscription.canAccessModule`, `ModuleGate`, `company_modules`, `companies.plan_code`, `companies.paid_features_enabled`, `subscriptions`).

`cutoverReady = sin mismatch, sin legacy_only y sin mapeos faltantes`.

## 6. Multi-company y multi-product

- Los overrides de scope `company` sólo aplican a su `companyId`; los de scope `account` sólo si el contexto pertenece a esa cuenta.
- El resolver sólo evalúa las capacidades de los productos contratados más `shared.*`. Consultar una capacidad de otro producto devuelve una explicación (“el producto no está contratado; no hay herencia automática”), nunca un `false` mudo.
- Quality Staff y My Staff / Parceros no heredan capacidades entre sí salvo contrato explícito (`products`).

## 7. VWC (escrituras futuras)

Fase 2 es de solo lectura. Cuando se persistan estas entidades, la política obligatoria será:

- `PATCH` versionado con `expected_version` sobre entitlements, limits y overrides.
- RPC transaccional única por transición (`ecc_publish_plan_version`, `ecc_apply_override`, `ecc_revoke_override`), idempotente por checksum de contenido.
- Eventos auditados append-only; las plan versions y los overrides no admiten `UPDATE`/`DELETE` (trigger de inmutabilidad, mismo patrón que `payroll_period_rate_snapshots`).
- Prohibido `.update()` directo desde el cliente sobre plan versions, entitlements, limits u overrides.

## 8. QA

| # | Caso | Resultado |
|---|---|---|
| 1 | Plan con dos versiones | OK — `stafly.free` v1/v2 con checksums distintos y verificables |
| 2 | Company conserva versión anterior | OK — contrato anclado a `stafly.free@v1` |
| 3 | Nueva company usa versión nueva | OK — resuelve v2 por fecha |
| 4 | Capability heredada | OK — `source = plan_version`, razón explícita |
| 5 | Capability revocada por override | OK — dependiente cae con `source = dependency` |
| 6 | Limit aumentado temporalmente | OK — `source = override`, sin exceso |
| 7 | Override expirado | OK — vuelve al plan; revocación append-only deja el original intacto |
| 8 | Multi-company | OK — override ajeno no se propaga; override de cuenta sí aplica dentro de la cuenta |
| 9 | Multi-product | OK — sin herencia Stafly ↔ Parceros |
| 10 | Contradicción legacy vs ECC | OK — expuesta en el shadow report, sin cambiar acceso |
| 11 | Usuario sin permisos | OK — el panel vive dentro del Command Center, ya restringido a propietario global; el modelo no expone escrituras |
| 12 | Global owner | OK — ve plan version, overrides, diffs y readiness |
| 13 | Tenant admin | OK — sin acceso al panel ni a APIs de escritura (no existen en esta fase) |
| 14 | Cero writes sobre legacy | OK — modelo puro, sin I/O ni mutación del input |
| 15 | Cero cambios de acceso real | OK — `ModuleGate`, `useSubscription` y `company_modules` intactos |

Ejecución: `vitest run src/test/ecc-phase2-plan-versions.test.ts src/test/ecc-commercial-read-model.test.ts` → **31 tests en verde**. Typecheck limpio.

## 9. Criterios de aceptación

- [x] Plan Versions inmutables con checksum
- [x] Catálogo canónico namespaced
- [x] Entitlements y limits explicables
- [x] Overrides auditados y append-only
- [x] Shadow mode compara contra legacy
- [x] Ningún gate real modificado (`ModuleGate`, `useSubscription`, `company_modules`, `plan_code`)
- [x] Multi-tenant aislado
- [x] Tests y typecheck en verde

**El ECC ya puede representar planes versionados, capacidades, límites y overrides de forma canónica y explicable, sin cambiar todavía el acceso real de ninguna compañía.**
