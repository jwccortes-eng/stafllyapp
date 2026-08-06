# ECC — Fase 3. Shadow reconciliation + cutover readiness

Fecha: 2026-08-06 · Modo: **shadow**. Legacy sigue gobernando el acceso.
Modelo: `src/lib/ecc/reconciliation.ts` (puro) · UI: `src/components/billing/EccReadinessPanel.tsx` · Tests: `src/test/ecc-phase3-reconciliation.test.ts`.

No se modificó `ModuleGate`, `useSubscription`, `plan_code`, `company_modules`, ningún acceso, ni Stripe. Las consultas a la base fueron de solo lectura.

---

## 1. Inventario por compañía

Datos leídos (solo lectura) de `companies`, `company_modules`, `employees`, `company_users`, `subscriptions`.

| Compañía | Aprobación | Comercial | Acceso | plan_code | paid_features | Módulos activos | Personas | Admins | Límite personas / admins | Plan version ECC | Suscripción legacy |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Quality Staff by Keury | approved | manual | active | enterprise | sí | 15 | 1418 | 51 | 9999 / 99 | `stafly.enterprise@v1` | 1 (informativa) |
| My Staff Solution LLC | approved | manual | active | enterprise | sí | 14 | 205 | 14 | 9999 / 99 | `stafly.enterprise@v1` | 1 (informativa) |
| Parceros | approved | manual | active | enterprise | sí | 0 | 185 | 1 | 9999 / 99 | `stafly.enterprise@v1` | 1 (informativa) |
| JKitchen Staff | approved | manual | active | free | no | 14 | 18 | 8 | 10 / 2 | `stafly.free@v2` | 1 (informativa) |
| Stafly Demo | approved | manual | active | enterprise | no | 4 | 21 | 9 | 10 / 2 | `stafly.enterprise@v1` | 0 |
| Sandbox | approved | manual | active | free | no | 14 | 5 | 2 | 10 / 2 | `stafly.free@v2` | 1 (informativa) |
| QA Testing | approved | manual | active | free | no | 14 | 5 | 1 | 10 / 2 | `stafly.free@v2` | 1 (informativa) |
| Llc | approved | manual | **suspended** | free | no | 0 | 0 | 0 | 10 / 2 | `stafly.free@v2` | 1 (informativa) |

Ninguna compañía fue modificada.

## 2. Matriz legacy vs ECC y clasificación de diferencias

Se compara capability por capability: `legacy enabled` (plan tier OR `company_modules.is_active`, igual que el gate real), `ecc enabled`, fuente de cada lado y estado (`match`, `mismatch`, `legacy_only`, `ecc_only`, `unknown`, `missing_mapping`), más diferencias de límite, de override y de dependencia.

Clases aplicadas:

| Clase | Significado | Ocurrencias observadas |
|---|---|---|
| A | Mapeo faltante | Capacidades críticas sin entrada de catálogo (`documents`, `compliance`, `worker_portal`, `audit`) y módulos legacy sin capability |
| B | Legacy inconsistente | Módulo activo que el plan ya concede (override redundante) |
| C | ECC incompleto | Capability canónica sin gate legacy equivalente (`ecc_only`) |
| D | Override manual | Diferencias de límite y overrides derivados de `company_modules` |
| E | Dato ambiguo | `paid_features_enabled` sin `plan_code` declarado |
| F | Riesgo operativo | Diferencia en capacidad crítica o uso por encima del límite canónico |
| G | Riesgo comercial | Diferencia no crítica que cambia el paquete facturable |
| H | Riesgo cross-tenant | Ninguna detectada: toda resolución está acotada por `company_id` / `account_id` |

Cada diferencia se emite como `ReconciliationFinding` con `classification`, `risk`, `owner`, `evidence`, `rollback`, `accessImpact`, `commercialImpact` y `tenantImpact`.

## 3. Readiness (explicable, nunca un score opaco)

Reglas implementadas en `reconcileCompany`:

- **BLOCKED** — sin versión de plan canónica vigente, u overrides sin motivo/aprobador (clasificados `desconocido`).
- **NOT_READY** — contradicciones de estado, diferencia en capacidad crítica, uso por encima del límite canónico, plan ambiguo o capacidades críticas sin mapeo.
- **CONDITIONAL** — sólo diferencias menores explicadas (límites por override controlado, módulos legacy sin capability, hallazgos no críticos).
- **READY** — 100 % de capacidades críticas mapeadas coinciden, límites coinciden, sin unknowns críticos, sin contradicciones y sin dependencia legacy no explicada.

Resultado actual de la flota: **0 READY**. Las ocho compañías quedan en **NOT_READY** por el mismo bloqueo estructural: cuatro capacidades operativas críticas (`stafly.documents`, `stafly.compliance`, `stafly.worker_portal`, `shared.audit`, y `shared.documents`) todavía no existen en el catálogo canónico y hoy están gobernadas por rutas y RLS, no por un gate de plan. Se suman blockers específicos:

| Compañía | Readiness | Blockers principales |
|---|---|---|
| Quality Staff by Keury | NOT_READY | Capacidades críticas sin mapeo. Productiva: excluida de cutover por política. |
| My Staff Solution LLC | NOT_READY | Igual que la anterior. Productiva. |
| Parceros | NOT_READY | Capacidades críticas sin mapeo; cero módulos activos con plan enterprise (todo por plan). |
| JKitchen Staff | NOT_READY | **Uso 18 personas sobre límite canónico 10** (plan free) y 8 admins sobre 2. Riesgo operativo F. |
| Stafly Demo | NOT_READY | **`max_employees=10` contra plan enterprise** (override de límite) y 21 personas sobre el tope legacy. |
| Sandbox | NOT_READY | Sólo capacidades críticas sin mapeo; sin excesos. Candidata natural tras cerrar el catálogo. |
| QA Testing | NOT_READY | Igual que Sandbox. |
| Llc | NOT_READY | `access_state=suspended` con datos vacíos: readiness sin señal operativa. |

## 4. Capacidades críticas

| Alias solicitado | Capability canónica | Estado |
|---|---|---|
| stafly.services | `stafly.ops.shifts` | mapeada |
| stafly.scheduling | `stafly.ops.shifts` | mapeada (misma capability) |
| stafly.team_hub | `stafly.ops.command_center` | mapeada |
| stafly.time_clock | `stafly.ops.timeclock` | mapeada |
| stafly.payroll_review | `stafly.payroll.reconciliation` | mapeada |
| stafly.documents | — | **sin mapeo (A)** |
| stafly.compliance | — | **sin mapeo (A)** |
| stafly.worker_portal | — | **sin mapeo (A)** |
| shared.identity | `shared.identity.directory` | mapeada |
| shared.documents | — | **sin mapeo (A)** |
| shared.audit | — | **sin mapeo (A)** |
| shared.notifications | `shared.comms.announcements` | mapeada |

Ninguna compañía puede ser READY mientras una capacidad operativa crítica difiera o carezca de explicación.

## 5. Límites

Comparados: personas, administradores. Registrados con valor legacy, valor ECC, uso actual, riesgo de exceso, impacto de cutover y resolución recomendada. Los demás límites del alcance (compañías por cuenta, servicios activos, almacenamiento, documentos, API, integraciones, white label, periodos de nómina, límites por producto) **no existen todavía como `limit_key` canónico**: se declaran como brecha de catálogo clase A, no se inventan valores.

| Compañía | Límite | Legacy | ECC | Uso | Riesgo | Recomendación |
|---|---|---|---|---|---|---|
| JKitchen Staff | personas | 10 | 10 | 18 | **excedido** | Crear override explícito o subir de plan |
| JKitchen Staff | admins | 2 | 2 | 8 | **excedido** | Crear override explícito |
| Stafly Demo | personas | 10 | ∞ (enterprise) | 21 | diferencia | Corregir dato: la columna contradice el plan |
| Stafly Demo | admins | 2 | ∞ | 9 | diferencia | Corregir dato |
| Sandbox / QA Testing | personas y admins | 10 / 2 | 10 / 2 | dentro | ninguno | Adoptar ECC |
| Quality Staff / My Staff / Parceros | personas y admins | 9999 / 99 | ∞ | dentro | diferencia formal | Revisión comercial (∞ vs 9999) |

No se aplicó ningún límite nuevo.

## 6. Overrides

Fuentes legacy inventariadas y mapeadas sin borrarlas: `company_modules`, `paid_features_enabled`, excepciones de columna (`max_employees`, `max_admins`), accesos temporales y beneficios de partner.

Clasificación implementada: `permanente`, `temporal`, `comercial`, `soporte`, `migracion`, `desconocido`. Los overrides derivados de `company_modules` se clasifican como `migracion`; los de columnas de límite como `comercial`. **Todo override `desconocido` fuerza readiness = BLOCKED** hasta revisión humana. Hoy no hay overrides desconocidos: todos los generados en shadow llevan motivo y aprobador (`ecc-migration` / `ecc-core`).

## 7. Plan de resolución de contradicciones

Propuestas, no ejecutadas. Cada hallazgo incluye riesgo, owner, evidencia, rollback e impacto en acceso, comercial y multi-tenant.

| Diferencia | Propuesta | Owner | Riesgo |
|---|---|---|---|
| Capacidades críticas sin catálogo | Crear mapping (nuevas capabilities `*.documents`, `*.compliance`, `*.worker_portal`, `shared.audit`) | ecc-core (catálogo) | Alto |
| JKitchen sobre límite | Crear override explícito o cambio de plan antes de cualquier cutover | Operaciones Stafly | Alto |
| Stafly Demo con límites contradictorios | Corregir dato en la compañía demo | Datos / soporte | Medio |
| `paid_features_enabled` sin `plan_code` | Corregir dato y fijar plan declarado | Comercial | Alto |
| Capability `ecc_only` | Adoptar ECC al cutover (hoy sin gate) | ecc-core | Bajo |
| Módulo legacy activo redundante | Mantener legacy; representar como override | Operaciones Stafly | Bajo |
| `access_state` incoherente | Bloquear cutover | Operaciones Stafly | Alto |
| Suscripciones legacy | Mantener legacy, informativas | Comercial | Bajo |

## 8. Shadow period

Política: **mínimo 30 días** de observación continua (`SHADOW_PERIOD_POLICY`). Se registran mismatches de capacidad, de límite y de acceso, fuentes desconocidas, expiración de overrides, cambios de readiness, compañías recién bloqueadas y dependencias legacy.

`evaluateShadowPeriod` devuelve siempre `cutoverAllowed: false` y `approvalGranted: false`: cumplir los días **no** habilita cutover. Se exige aprobación humana explícita.

## 9. Candidatos futuros de cutover

Política aplicada: sólo compañías demo o no críticas, y sólo con readiness aceptable. Excluidas por defecto Quality Staff, My Staff, Parceros y cualquier compañía con payroll activo, documentos críticos, overrides sin explicar o `access_state` inconsistente.

Propuesta (no ejecutada), condicionada a cerrar la brecha de catálogo de la sección 4:

1. **Sandbox** — sin excesos, sin overrides desconocidos, sin payroll productivo.
2. **QA Testing** — mismo perfil.
3. **Stafly Demo** — sólo tras corregir la contradicción de límites.

`Llc` queda fuera por estar suspendida. Ninguna compañía es candidata hoy: todas están NOT_READY.

## 10. Cutover contract (diseño, inactivo)

`buildCutoverContractDraft` produce: `company_id`, `expected_version`, `readiness`, `approved_by` (null), `cutover_at` (null), ventana de rollback de 72 h, `legacyFallback: true`, `tenantSafe`, auditoría, snapshot de capacidades y snapshot de límites, con `executable: false` invariable. No existe ninguna ruta que lo ejecute.

## 11. Rollback (por compañía, inmediato)

1. Desactivar la bandera de resolución ECC de la compañía piloto.
2. Restaurar el gate legacy (`useSubscription` + `company_modules`), que nunca fue removido.
3. Conservar el audit del intento (append-only).
4. Mantener plan version y entitlements ECC en shadow.
5. Revertir la resolución de acceso al valor legacy, sin pérdida de acceso.
6. Conservar overrides con motivo y aprobador.
7. No tocar billing ni suscripciones.

## 12. Command Center

Nueva vista de solo lectura dentro de la pestaña de billing de `/app/companies`, visible **sólo para el propietario global**: readiness con explicación, blockers, capacidades críticas, límites con uso, overrides clasificados, dependencia legacy, periodo de observación y acción recomendada por diferencia. Única acción disponible: **“Revisar preparación”**. No hay botón de cutover.

## 13. Multi-company

`reconcileAccounts` valida cuentas con varias compañías, planes distintos por compañía, overrides con scope `company` frente a `account`, coherencia de capacidades `shared.*` a nivel de cuenta y ausencia de propagación indebida. Quality Staff y My Staff conservan resolución independiente: no hay herencia entre compañías ni entre productos salvo contrato explícito. `crossTenantLeak = false` en toda la flota.

## 14. Seguridad

- Solo `global_owner` ve readiness multi-tenant (`readinessVisibility`); el panel se renderiza únicamente con `role === "owner"`.
- Tenant admin sólo puede ver su propia compañía y **no puede aprobar cutover** (`canApproveCutover: false` para todos los roles en esta fase).
- Sin cambios en auth, RLS, tenants, `access_state`, payroll, `time_entries`, documentos, datos productivos, billing ni lógica de partners.
- El modelo es puro: no ejecuta I/O y no muta su input (verificado por test).

## 15. QA

| # | Caso | Resultado |
|---|---|---|
| 1 | Company con match total | OK — sin mismatch en capacidades críticas mapeadas |
| 2 | Company con override | OK — inventariado y clasificado |
| 3 | Company con limit mismatch | OK — exceso detectado y marcado riesgo alto |
| 4 | Company con unknown mapping | OK — clase A con propuesta `create_mapping` |
| 5 | Company con plan contradictorio | OK — clase E, plan ambiguo |
| 6 | Company con access state inconsistente | OK — `block_cutover` |
| 7 | Multi-company account | OK — resolución independiente, sin fuga |
| 8 | Global owner | OK — ve flota, no aprueba |
| 9 | Tenant admin | OK — sólo su compañía |
| 10 | Usuario sin permisos | OK — sin lectura |
| 11 | Cero writes | OK — input inmutado, sólo `SELECT` en base |
| 12 | Cero cambios de acceso real | OK — gates legacy intactos |

Ejecución: 14 tests nuevos en verde; suites ECC Fase 1+2+3 en verde; typecheck limpio.

## 16. Dependencias legacy vigentes

`useSubscription.canAccessModule`, `ModuleGate`, `company_modules`, `companies.plan_code`, `companies.paid_features_enabled`, `companies.max_employees` / `max_admins`, `subscriptions` (informativa), y las capacidades operativas gobernadas por rutas y RLS sin capability canónica (documentos, cumplimiento, portal del trabajador, auditoría).

---

**El ECC puede determinar qué compañías están listas para un futuro cutover, cuáles no y por qué, sin modificar todavía el acceso real.**
