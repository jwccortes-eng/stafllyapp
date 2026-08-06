# ECC — Fase 4A · Pilot cutover DRY RUN (QA Testing)

**Compañía candidata:** QA Testing — `7c1458db-109a-4042-a2b0-78e04427ec2d`
**Fecha de ejecución:** 2026-08-06 · **Modo:** `compare` · **Bandera:** `ecc_access_pilot_enabled = false`

Modelo: `src/lib/ecc/pilot.ts` (puro, sin red, sin escrituras). Pruebas: `src/test/ecc-phase4a-pilot-dry-run.test.ts` (14 casos).
**No se ejecutó cutover. No se modificó `ModuleGate`, `useSubscription`, Stripe, payroll ni ninguna fuente legacy.**

---

## 1. Motivo del estado CONDITIONAL (y no READY)

QA Testing no alcanza READY por dos razones, ninguna de ellas un riesgo de acceso:

1. **Módulo legacy sin capacidad canónica: `invite`.** `company_modules.invite` está activo pero no existe en el catálogo ECC. Hoy las invitaciones se gobiernan por código y RLS, no por plan, así que el ECC no puede declarar cobertura total del inventario legacy. Clasificación C (ECC incompleto), owner `ecc-core`, propuesta: crear la capability o declararla explícitamente fuera de alcance comercial.
2. **Dos diferencias no críticas clasificadas.** Overrides de migración derivados de `company_modules` que conceden capacidades fuera del plan `stafly.free@v3`. Todas están clasificadas (`migracion`) y ninguna afecta capacidades críticas.

Las 15 capacidades críticas están en `match`. No hay blockers, no hay contradicciones y no hay riesgos operativos sin explicar (`unexplainedRisks = []`).

---

## 2. Precheck

| Campo | Valor |
|---|---|
| approval_state | `approved` |
| commercial_state | `manual` |
| access_state | `active` (`is_active=true`, `status=active`) |
| Plan legacy | `free` (`plan_code=free`, `paid_features_enabled=false`) |
| Plan version ECC | `stafly.free@v3` |
| Capabilities legacy | 15 críticas evaluadas: 13 permitidas, 2 denegadas (Team Hub, Revisión de nómina) |
| Capabilities ECC | Idénticas: 13 permitidas, 2 denegadas |
| Limits legacy | employees 10 · admins 2 |
| Limits ECC | employees 10 · admins 2 (coinciden) |
| Overrides | 9, todos `migracion` desde `company_modules`; **0 desconocidos** |
| Uso actual | 5 personas / 10 · 1 admin / 2 |
| Dependencias | Todas satisfechas (0 faltantes) |
| Payroll periods | 0 · base pay 0 · time entries 0 · periodos cerrados o pagados 0 |
| Servicios | 0 turnos programados |
| Usuarios | 1 |
| Documentos | 0 |
| Actividad operativa | 50 eventos en `activity_log` |
| Suscripción legacy | 1 fila `free/active`, sin customer ni subscription de Stripe |
| Contradictions | 0 |
| Version (companies) | 2 |

**Riesgos operativos no explicados: ninguno.** El precheck permite continuar.

### Criterios mínimos (sección 2 del encargo)

| Criterio | Resultado | Evidencia |
|---|---|---|
| 100 % capabilities críticas coinciden | PASA | 15/15 en match |
| Sin payroll productivo | PASA | base pay = 0, time entries = 0 |
| Sin periodos cerrados o pagados | PASA | periodos = 0 |
| Sin overrides desconocidos | PASA | 9 overrides, 0 sin clasificar |
| Sin contradicciones de access state | PASA | approved / active, 0 contradicciones |
| No excede límites efectivos | PASA | 5/10 personas, 1/2 admins |
| Sin dependencia legacy sin mapping | PASA | 0 dependencias faltantes |
| Rollback por company_id | PASA | bandera `ecc_access_pilot_enabled` aislada por company_id |
| Global owner autorizado | PASA | el cutover exige propietario global autenticado |
| Restaurable sin afectar otras | PASA | registro de piloto con una sola compañía |

**10/10 criterios cumplidos.**

---

## 3. Matriz legacy vs ECC (dry run por superficie)

| Superficie | Ruta | Dispositivo | Legacy | ECC | Match | Fuente | Impacto si cutover | Rollback |
|---|---|---|---|---|---|---|---|---|
| Servicios | `/app/shifts` | ambos | permitido | permitido | sí | `company_modules` → plan v3 (core) | ninguno | legacy inmediato |
| Programación | `/app/schedule` | ambos | permitido | permitido | sí | `company_modules` → plan v3 (core) | ninguno | legacy inmediato |
| Team Hub | `/app/team-hub` | ambos | denegado | denegado | sí | `company_modules` → no incluida en v3 | ninguno | legacy inmediato |
| Workers | `/app/employees` | ambos | permitido | permitido | sí | `company_modules` → plan v3 (core) | ninguno | legacy inmediato |
| Documentos | `/app/documents` | desktop | permitido | permitido | sí | `code_and_rls` → plan v3 (core) | ninguno | legacy inmediato |
| Revisión documental | `/app/documents` | desktop | permitido | permitido | sí | `code_and_rls` → plan v3 (core) | ninguno | legacy inmediato |
| Cumplimiento | `/app/compliance` | ambos | permitido | permitido | sí | `code_and_rls` → plan v3 (core) | ninguno | legacy inmediato |
| Portal del trabajador | `/portal` | mobile | permitido | permitido | sí | `portal_modules` → plan v3 (core) | ninguno | legacy inmediato |
| Auditoría | `/app/activity` | desktop | permitido | permitido | sí | `code_and_rls` → plan v3 (core) | ninguno | legacy inmediato |
| Time Clock | `/app/timeclock` | ambos | permitido | permitido | sí | override de migración `company_modules.timeclock` | ninguno | legacy inmediato |
| Revisión de nómina | `/app/payroll-review-queue` | desktop | denegado | denegado | sí | `company_modules` → no incluida en v3 | ninguno | legacy inmediato |
| Notificaciones | `/app/notifications` | ambos | permitido | permitido | sí | `code_and_rls` → plan v3 (core) | ninguno | legacy inmediato |

**Mismatches: 0.** Alertas emitidas: **0** (`unexpected_deny`, `unexpected_allow`, `dependency_mismatch`, `limit_mismatch`, `cross_tenant_resolution`, `unresolved_capability` — todas vacías).

Nota sobre "Payroll Review visible pero no productivo": el plan free niega la capacidad tanto en legacy como en ECC, y la compañía no tiene ningún periodo de nómina. La decisión coincide y no hay dato productivo en juego.

### Resolución dual (sección 3)

`resolvePilotMode` devuelve:
- `legacy_only` para toda compañía fuera del registro;
- `compare` para QA Testing mientras la bandera esté apagada;
- `ecc_pilot` sólo si un humano enciende la bandera;
- `rolled_back` tras un rollback.

Invariante verificado en tests: con `enabled=false`, `resolveDual` devuelve siempre `governedBy: "legacy"`, incluso si el modo declarado es `ecc_pilot`. Si el ECC no es concluyente estando el piloto activo, cae a legacy con `fallbackUsed=true`. No se añadió ninguna ruta global alternativa.

---

## 4. Simulación de cutover

Contrato preparado, **no ejecutado**:

| Campo | Valor |
|---|---|
| company_id | `7c1458db-109a-4042-a2b0-78e04427ec2d` |
| expected_version | 2 (versión al precheck) |
| approved_by | `null` |
| readiness | CONDITIONAL |
| capabilities snapshot | 15 capacidades críticas + catálogo resuelto |
| limits snapshot | employees 10 · admins 2 |
| access snapshot | approved / manual / active · acceso legal preservado |
| cutover_at | `null` |
| rollback_until | `null` (se fija al ejecutar; ventana 72 h) |
| legacy_fallback | `true` |
| audit reference | `ecc_phase_4a_dry_run:7c1458db-…` |
| idempotency_key | `ecc-cutover:7c1458db-…:2:40afd214` (determinista) |
| executable | `false` |

`canExecuteCutover` rechaza en cascada: conflicto de versión → criterios incumplidos → falta de aprobación humana → y, en último término, "Fase 4A es dry run". Con versión 3 devuelve *Conflicto de versión: precheck 2, actual 3*.

---

## 5. Simulación de rollback

Secuencia probada: `ecc_pilot → rollback → legacy restored → rollback` (repetido).

| Garantía | Resultado |
|---|---|
| Legacy reactivado de inmediato para QA Testing | sí |
| ECC conservado en shadow | sí |
| Plan versions preservadas | sí |
| Entitlements preservados | sí |
| Auditoría preservada | sí |
| Datos comerciales sin cambios | sí |
| Otras compañías afectadas | 0 |
| Idempotente | sí (segunda ejecución = no-op registrado) |

---

## 6. QA mobile y desktop (20 escenarios)

| # | Escenario | Resultado |
|---|---|---|
| 1 | Global owner | Resolución completa, decisiones registradas con usuario y versión |
| 2 | Tenant admin de QA Testing | Sólo su compañía (`readinessVisibility`), sin aprobación de cutover |
| 3 | Usuario sin permisos | Sin lectura de readiness ni resolución |
| 4 | Mobile | Portal, Servicios, Time Clock, Cumplimiento y Notificaciones: match |
| 5 | Desktop | Documentos, Revisión documental, Auditoría, Revisión de nómina: match |
| 6 | Servicios | Permitido en ambos modelos |
| 7 | Workers | Permitido en ambos modelos |
| 8 | Documents | Permitido (código + RLS) en ambos |
| 9 | Compliance | Permitido en ambos |
| 10 | Portal | Permitido (`portal_modules`) en ambos |
| 11 | Audit | Permitido en ambos |
| 12 | Time Clock | Permitido vía override de migración; coincide |
| 13 | Payroll Review visible no productivo | Denegado en ambos; 0 periodos, sin dato productivo |
| 14 | Capability permitida | Servicios: legacy y ECC permiten |
| 15 | Capability denegada | Team Hub: legacy y ECC deniegan, sin alerta |
| 16 | Limit warning | 5/10 y 1/2: sin alerta; con uso simulado por encima del tope se emite `limit_mismatch` |
| 17 | Cambio de company | Otra compañía resuelve `legacy_only`, sin bandera y sin rollback disponible |
| 18 | Refresh | Modelo puro y determinista: mismo input ⇒ mismo idempotency key |
| 19 | Rollback | Legacy restaurado, idempotente |
| 20 | Cero impacto en otra compañía | Todos los eventos comparten un único `company_id`; `otherCompaniesTouched = 0` |

Exclusiones respetadas: Quality Staff by Keury, My Staff Solution LLC, Parceros, Sandbox, JKitchen Staff, Stafly Demo y Llc **no aparecen en el registro de piloto** y resuelven `legacy_only`.

---

## 7. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| `company_modules.invite` sin capability canónica | media | Modelar o declarar fuera de alcance antes de Fase 4B; hoy no gobierna acceso comercial |
| 9 overrides de migración conceden capacidades fuera del plan free | media | Están clasificados y son reversibles; deben convertirse en decisión comercial explícita antes de retirar legacy |
| Plan free con Time Clock activo por override | baja | El ECC lo reproduce con la misma decisión; sin divergencia |
| Encendido accidental de la bandera | baja | La bandera es literal en código, requiere despliegue y aprobación humana; `executable: false` en el contrato |
| Deriva de versión entre precheck y cutover | baja | `expected_version` + `canExecuteCutover` bloquean la ejecución |

---

## 8. Confirmación

**QA Testing puede avanzar a un piloto ECC real, con causa demostrada y sin haber modificado aún el acceso de ninguna compañía.** Cumple los 10 criterios mínimos, legacy y ECC coinciden en las 12 superficies evaluadas (0 mismatches, 0 alertas), el rollback es inmediato e idempotente y la decisión está aislada por `company_id`. Antes de la Fase 4B queda pendiente resolver el módulo `invite` y convertir los 9 overrides de migración en decisiones comerciales explícitas.

Legacy sigue gobernando el acceso. No se cambió billing, payroll, RLS ni ninguna otra compañía.
