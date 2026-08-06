# ECC — Cierre de readiness post Fase 3.1

Reejecución completa de la reconciliación shadow sobre la flota real (8 compañías), con el catálogo crítico ya mapeado.

- Modelo ejecutado: `reconcileCompany` + `summarizeFleetReadiness` (`src/lib/ecc/reconciliation.ts`).
- Entrada: lectura de solo lectura de `companies`, `company_modules`, `subscriptions` y conteos de uso (personas, admins, periodos, turnos, base pay).
- Fecha de ejecución: 2026-08-06.
- **Cero escrituras. Cero cambios de gate. Legacy sigue gobernando el acceso.**

## 1. Readiness antes y después

| Estado | Antes (Fase 3) | Después (Fase 3.1) |
|---|---|---|
| READY | 0 | 0 |
| CONDITIONAL | 0 | 5 |
| NOT_READY | 8 | 3 |
| BLOCKED | 0 | 0 |

Cambio estructural: desapareció el bloqueo global por capacidades críticas sin mapeo. **Las 15 capacidades críticas resuelven `match` en las 8 compañías** (0 mismatches, 0 hallazgos clase A). Los blockers restantes ya no son de modelado: son de dato real (uso por encima del límite) y de dependencia de capacidad.

Hallazgos por clase (flota): A=0, B=3, C=8, D=0, E=0, F=4, G=0, H=0. Críticos: 4. Sin owner: 0.

## 2. Conteo final

- **READY: 0**
- **CONDITIONAL: 5** — My Staff Solution LLC, Parceros, Quality Staff by Keury, QA Testing, Sandbox
- **NOT_READY: 3** — JKitchen Staff, Llc, Stafly Demo
- **BLOCKED: 0**

## 3. Matriz por compañía

| Compañía | Plan legacy | Plan ECC (fuente) | Capacidades críticas | Límites (legacy / ECC / uso) | Overrides | Blockers | Readiness | Recomendación |
|---|---|---|---|---|---|---|---|---|
| Quality Staff by Keury | enterprise | enterprise (plan_code) | 15/15 match | employees 9999/9999/1418 · admins 99/99/51 | 2 comerciales (elevación de límites) | — | CONDITIONAL | No tocar. Productiva crítica (105 periodos, 2.729 filas de base pay). Mantener en shadow. |
| My Staff Solution LLC | enterprise | enterprise (plan_code) | 15/15 match | employees 9999/9999/205 · admins 99/99/14 | 2 comerciales | — | CONDITIONAL | No tocar. Payroll activo (53 periodos, 78 filas). Resolver módulo `invite` sin canónico. |
| Parceros | enterprise | enterprise (plan_code) | 15/15 match | employees 9999/9999/185 · admins 99/99/1 | 2 comerciales | — | CONDITIONAL | No tocar. Tenant de producto Parceros con 185 personas y `status=inactive` contra `access_state=active`: revisar dato antes de cualquier fase futura. |
| QA Testing | free | free (plan_code) | 15/15 match | employees 10/10/5 · admins 2/2/1 | 9 de migración (módulos legacy activos) | — | CONDITIONAL | **Candidata a piloto.** Sin payroll, sin turnos, sin overrides desconocidos. |
| Sandbox | free | free (plan_code) | 15/15 match | employees 10/10/5 · admins 2/2/2 | 9 de migración | — | CONDITIONAL | Candidata técnica, **excluida del piloto por payroll activo** (52 periodos, 467 turnos, 1 fila de base pay). |
| JKitchen Staff | free | free (plan_code) | 15/15 match | employees 10/10/**18 excedido** · admins 2/2/**8 excedido** | 9 de migración | Uso sobre límite en personas y admins | NOT_READY | Corregir el dato comercial: el plan free no representa el uso real. Requiere decisión comercial, no técnica. |
| Stafly Demo | enterprise | enterprise (plan_code) | 15/15 match | employees 10/10/**21 excedido** · admins 2/2/**9 excedido** | 2 comerciales | Uso sobre límite en personas y admins | NOT_READY | Alinear `max_employees`/`max_admins` con el plan enterprise declarado. Tras eso, candidata natural de piloto demo. |
| Llc | free | free (plan_code) | 15/15 match | employees 10/10/0 · admins 2/2/0 | — | Dependencia faltante: `stafly.payroll.reconciliation` requiere `stafly.payroll.periods` | NOT_READY | Compañía suspendida y vacía. Sin señal operativa: dejar fuera de todo piloto. |

## 4. Compañías candidatas a piloto

Lista exacta, tras aplicar las exclusiones de la sección 5:

1. **QA Testing** — `7c1458db-109a-4042-a2b0-78e04427ec2d` — CONDITIONAL, demo, 0 periodos de nómina, 0 turnos, 5 personas, límites dentro de rango, overrides todos clasificados como `migracion`.

El motor propuso además `Sandbox` como candidata técnica; queda **excluida** por payroll activo. Ninguna otra compañía califica.

## 5. Exclusiones explícitas

| Criterio | Compañías excluidas |
|---|---|
| Productivas críticas | Quality Staff by Keury, My Staff Solution LLC, Parceros |
| Payroll activo (periodos, base pay o turnos consolidados) | Quality Staff by Keury (105), My Staff Solution LLC (53), Sandbox (52), JKitchen Staff (1), Stafly Demo (1) |
| Overrides desconocidos | Ninguna: 0 overrides con clasificación `desconocido` en toda la flota |
| Contradicciones de acceso | Llc (`access_state=suspended`, sin datos), Parceros (`status=inactive` con `access_state=active`) |

Resultado: 7 de 8 compañías excluidas. Queda **una** candidata.

## 6. Gobierno del acceso

- El acceso real sigue resolviéndose por `useSubscription.canAccessModule`, `ModuleGate`, `company_modules`, `companies.plan_code`, `companies.paid_features_enabled` y `subscriptions` (legacy).
- El ECC opera exclusivamente como lectura paralela: `reconcileCompany` es una función pura, no consulta red, no escribe y no muta su entrada.
- No se ejecutó cutover. `buildCutoverContractDraft` sigue devolviendo contratos con `executable: false`, `approvedBy: null`, `cutoverAt: null` y `legacyFallback: true`.
- El periodo de observación mínimo (30 días, `SHADOW_PERIOD_POLICY`) no habilita cutover automático en ningún caso.

**Confirmación: Legacy sigue gobernando el acceso y el ECC continúa en modo shadow. No se ejecutó cutover.**
