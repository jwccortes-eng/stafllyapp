# ECC — Fase 4A.1 + 4B · Capability completion y piloto real controlado (QA Testing)

Fecha: 2026-08-06 · Alcance: `shared.invitations` + piloto ECC exclusivo para QA Testing (`7c1458db-109a-4042-a2b0-78e04427ec2d`).
Modelo puro: no se tocó Stripe, billing, payroll, `time_entries`, `company_modules`, `plan_code`, `subscriptions`, auth ni RLS.

## 1. Capability añadida

`shared.invitations` — una sola vez en `shared.*` (validado por `validateCatalog()` y por test).

| Atributo | Valor |
| --- | --- |
| key | `shared.invitations` |
| producto | `shared` (transversal: admins, workers, proveedores, partners, comunidad, futuras apps) |
| tipo / tier | `feature` / `core` (no addon) |
| dependencias | `shared.identity.directory`, `shared.comms.notifications`, `shared.audit.trail` |
| permiso requerido | `has_company_role(admin\|manager\|owner)` para emitir; la persona invitada sólo canjea su token |
| fuentes legacy | `company_modules.invite + plan_code`, `employee_invitations`, `useEmployeeInvitations`, `/accept-invite`, edge functions de envío + `email_send_log` |
| límites | `shared.limit.employees`, `shared.limit.admins` |
| config requerida | canal de entrega (email o enlace) configurado |
| auditoría | `addedIn: ecc.phase-4a.1`, owner `ecc-core` |
| versión | `ecc.phase-4a.1` |

No se crearon `stafly.invitations`, `parceros.invitations` ni `invitation_management`. El dominio `invitations` quedó en `SHARED_ONLY_DOMAINS`: cualquier duplicado por producto rompe la validación del catálogo.

**ECC declara disponibilidad comercial, no autorización.** Habilitar la capability no concede permisos administrativos: auth + RLS siguen decidiendo quién puede invitar.

## 2. Mapping legacy

`company_modules.invite → shared.invitations`, vía `legacyModuleKey` (índice `LEGACY_MODULE_TO_CAPABILITY`).

- Idempotente: derivado del catálogo, mismos insumos ⇒ mismo resultado.
- Reversible: retirar `legacyModuleKey` restaura el estado anterior.
- Explicable: `legacyGovernance = company_modules`, con evidencia de fuentes.
- Tenant-safe: la decisión legacy se calcula por `company_id` (`plan tier OR módulo activo`).
- No modifica `company_modules` ni el acceso real (test de no-mutación del input).

Versiones de plan nuevas (inmutables, `effective_from = 2026-08-06`): `stafly.free@v4`, `stafly.pro@v3`, `stafly.enterprise@v3`, `parceros.talent_free@v3`. Ninguna versión previa fue editada.

## 3. Readiness antes / después

Antes (cierre Fase 3.1): 15 capacidades críticas, `company_modules.invite` **sin mapping** → QA Testing quedaba `CONDITIONAL` con gap de capability.

Después (recálculo sobre la flota real, 2026-08-06):

| Compañía | Readiness | Críticas en match | `shared.invitations` | Modo | Blockers |
| --- | --- | --- | --- | --- | --- |
| JKitchen Staff | NOT_READY | 16/16 | match | legacy_only | 2 (exceso de límite) |
| Llc | NOT_READY | 16/16 | match | legacy_only | 1 (acceso suspendido) |
| My Staff Solution LLC | CONDITIONAL | 16/16 | match | legacy_only | 0 |
| Parceros | CONDITIONAL | 16/16 | match | legacy_only | 0 |
| **QA Testing** | **CONDITIONAL** | **16/16** | **match** | **ecc_pilot** | **0** |
| Quality Staff by Keury | CONDITIONAL | 16/16 | match | legacy_only | 0 |
| Sandbox | CONDITIONAL | 16/16 | match | legacy_only | 0 |
| Stafly Demo | NOT_READY | 16/16 | match | legacy_only | 2 (exceso de límite) |

QA Testing: 0 mappings faltantes, 0 unresolved capabilities, 0 dependency mismatches, 0 contradicciones de acceso, límites dentro de uso (5/10 personas, 1/2 admins), overrides conocidos, plan version estable (`stafly.free@v4`), `expected_version = 2` válida.

Uso productivo verificado en QA Testing: `pay_periods=0`, `cerrados/pagados=0`, `period_base_pay=0`, `time_entries=0`, `employee_documents=0`, `scheduled_shifts=0`, `employee_invitations=3`.

## 4. Aprobación del piloto

`ECC_PILOT_APPROVAL`: aprobado por `global_owner`, `2026-08-06T05:00:00.000Z`, sólo `company_id = 7c1458db-109a-4042-a2b0-78e04427ec2d`.
`activateEccPilot()` rechaza otra compañía, la ausencia de aprobador y cualquier drift de versión.

## 5. Activación

Bandera `ecc_access_pilot_enabled = true`, modo `ecc_pilot`, únicamente en `PILOT_REGISTRY_LIVE` (una sola entrada). El default global sigue siendo `legacy_only`; toda compañía fuera del registro resuelve legacy.

## 6–8. Decisiones ECC, comparación legacy y confidence

18 superficies evaluadas (Home, Servicios, Programación, Team Hub, Workers, Documentos, Revisión documental, Cumplimiento, Portal, Auditoría, Time Clock, Revisión de nómina, Notificaciones, Invitaciones, Configuración, Command Center, navegación mobile y desktop). Sin flujos de pago.

- Gobierna ECC: 18/18 decisiones en QA Testing.
- Legacy calculado en paralelo: 0 desajustes (`legacy == ecc` en todas).
- Confidence: HIGH 18, MEDIUM 0, LOW 0. El nivel se deriva de señales explícitas (mapping completo, plan version conocida, dependencias resueltas, sin contradicciones, legacy match, override conocido, fuente confiable) — no de un porcentaje arbitrario.
- LOW nunca gobierna: fuerza fallback a legacy y queda registrado con motivo.

Cada decisión registra: `company_id`, `user_id`, superficie, ruta, dispositivo, capability, decisión legacy, decisión ECC, decisión efectiva, fuente, confidence y su razón, plan version, override, contradicción, resultado de dependencia, resultado de límite, latencia, fallback y motivo, timestamp y `correlation_id`.

## 9. Alertas

Catálogo activo: `unexpected_deny`, `unexpected_allow`, `unresolved_capability`, `dependency_mismatch`, `limit_mismatch`, `cross_tenant_resolution`, `version_drift`, `low_confidence`, `rollback_triggered`.
Resultado en QA Testing: **0 alertas**.

## 10. QA (25 escenarios)

Suite `src/test/ecc-phase4b-real-pilot.test.ts` — 19 tests que cubren los 25 escenarios exigidos: mapping, readiness, aprobación humana, ECC gobernando sólo QA Testing, resto legacy_only, capability permitida/denegada, límite dentro/excedido, dependencia satisfecha/faltante, usuario autorizado/sin permisos, cambio de compañía, mobile, desktop, refresh, dos pestañas, version drift, rollback manual y automático, reintento idempotente, cero cross-tenant, cero payroll, cero billing.

Estado: **19/19 en verde**; suite ECC completa (4A.1 + 4B + fases previas) en verde; `tsgo --noEmit` sin errores.
Fallos preexistentes ajenos a ECC: `src/test/driver-sync-roundtrip.test.ts` (mock de cliente backend), sin relación con este bloque.

## 11. Rollback

`rollbackEccPilot(companyId, trigger)`:
- cambia QA Testing a `rolled_back` y restaura legacy como decisión efectiva;
- conserva ECC en sombra, auditoría, observabilidad, plan versions y entitlements;
- es idempotente y no afecta a ninguna otra compañía (no-op explicado fuera del registro).

Rollback automático probado ante: mismatch crítico, cross-tenant, `unexpected_deny`/`unexpected_allow`, low confidence persistente, dependencia faltante, error de resolver, latencia sobre `LATENCY_THRESHOLD_MS = 250 ms` y version drift.

## 12. Confirmación

**QA Testing opera con ECC como fuente efectiva de acceso, Legacy continúa en comparación paralela y todas las demás compañías permanecen bajo Legacy.**

No se conectó Stripe, no se tocó billing, payroll, `time_entries`, `company_modules`, `plan_code`, `subscriptions`, auth ni RLS, y no se modificó ninguna otra compañía.
