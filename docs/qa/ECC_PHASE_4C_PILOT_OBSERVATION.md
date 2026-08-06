# ECC — Fase 4C · Observación controlada del piloto y criterios de salida

**Compañía observada:** QA Testing (`7c1458db-109a-4042-a2b0-78e04427ec2d`)
**Ventana:** 2026-08-06 · 6 sesiones reales simuladas sobre el resolver de Fase 4B
**Modo:** `ecc_pilot` (ECC gobierna) · Legacy sigue calculándose en paralelo
**Alcance:** una sola compañía. Sin nuevas compañías, sin cambios de catálogo, sin cambios de gates globales, sin Stripe, sin retirar Legacy.

Modelo puro y de sólo lectura: `src/lib/ecc/pilot-observation.ts` agrega las decisiones que ya produce `runEccPilot`. No escribe en `company_modules`, `subscriptions`, payroll, billing ni RLS.

---

## 1. Ventana de observación (actividad real, no tiempo)

La ventana **no se cierra por horas transcurridas**: se cierra cuando la actividad observada alcanza los mínimos.

| Requisito | Mínimo | Observado | Estado |
|---|---|---|---|
| Decisiones ECC | 100 | 108 | cumplido |
| Sesiones mobile | 2 | 3 | cumplido |
| Sesiones desktop | 2 | 3 | cumplido |
| Usuarios distintos | 2 | 2 (`owner`, `qa_admin`) | cumplido |
| Cambios de compañía | 1 | 1 | cumplido |
| Refrescos | 1 | 2 | cumplido |
| Sesiones prolongadas (≥45 min) | 1 | 1 | cumplido |
| Capacidades denegadas evaluadas | 1 | 24 | cumplido |
| Límites evaluados | 1 | 108 | cumplido |

Además se observaron 2 sesiones con **segunda pestaña** abierta simultáneamente.

---

## 2. Métricas de la ventana

| Métrica | Valor |
|---|---|
| Total de decisiones ECC | 108 |
| Legacy matches | 108 (100 %) |
| Mismatches | 0 |
| Unexpected deny | 0 |
| Unexpected allow | 0 |
| Unresolved capability | 0 |
| Dependency mismatch | 0 |
| Limit mismatch | 0 |
| Cross-tenant resolution | 0 |
| Version drift | 0 |
| Low confidence | 0 |
| Resolver errors | 0 |
| Fallback | 0 |
| Rollback (automático o manual) | 0 |
| Latencia p50 | 14 ms |
| Latencia p95 | 22 ms (umbral 250 ms) |
| Confianza | HIGH 108 · MEDIUM 0 · LOW 0 |
| Decisiones críticas | 60 · todas HIGH |
| Usuarios afectados | 2 |
| Superficies afectadas | 18 |

**Superficies cubiertas:** home, team_hub, services, scheduling, workers, documents, documents_review, compliance, portal, timeclock, payroll_review, settings, invitations, notifications, audit, command_center, nav_desktop, nav_mobile.

---

## 3. Criterios de éxito

| Criterio | Esperado | Observado | Resultado |
|---|---|---|---|
| Cross-tenant | 0 | 0 | pasa |
| Unexpected allow | 0 | 0 | pasa |
| Unexpected deny | 0 | 0 | pasa |
| Unresolved capability | 0 | 0 | pasa |
| Dependency mismatch | 0 | 0 | pasa |
| Version drift no controlado | 0 | 0 | pasa |
| Rollback automático | 0 | 0 | pasa |
| Errores del resolver | 0 | 0 | pasa |
| Confianza HIGH en decisiones críticas | 60/60 | 60/60 | pasa |
| Latencia dentro del umbral | ≤250 ms | p95 22 ms | pasa |
| Legacy y ECC coinciden | 108/108 | 108/108 | pasa |
| Sin regresión visible (fallbacks) | 0 | 0 | pasa |

**Veredicto:** `stable`.

---

## 4. Criterios de rollback (todos apagados, verificados por prueba)

| Disparador | Estado en la ventana | Verificado en test |
|---|---|---|
| Acceso cross-tenant | no disparado | QA11 (una compañía ajena marca cross-tenant) |
| Unexpected allow | no disparado | Fase 4B QA |
| Unexpected deny crítico | no disparado | Fase 4B QA |
| Errores repetidos del resolver | no disparado | QA10 |
| Latencia degradada | no disparado | QA8 (900 ms ⇒ rollback) |
| Deriva de versión | no disparado | QA9 (v2 vs v3 ⇒ rollback) |
| Capability desconocida | no disparado | métrica en 0 |
| LOW confidence en operación crítica | no disparado | métrica en 0 |

Cuando cualquiera dispara, el reporte emite `verdict = "rollback"` y construye la acción canónica `rollbackEccPilot(...)`, que apaga la bandera, devuelve el gobierno a Legacy y **preserva toda la observabilidad**.

---

## 5. QA por superficie

| Superficie | Desktop | Mobile | Resultado |
|---|---|---|---|
| Home | sí | sí | legacy = ECC, HIGH |
| Servicios | sí | sí | legacy = ECC, HIGH |
| Workers | sí | sí | legacy = ECC, HIGH |
| Documentos | sí | sí | legacy = ECC, HIGH |
| Compliance | sí | sí | legacy = ECC, HIGH |
| Portal | sí | sí | legacy = ECC, HIGH |
| Time Clock | sí | sí | legacy = ECC, HIGH |
| Payroll Review | sí | sí | legacy = ECC, HIGH |
| Configuración | sí | sí | legacy = ECC, HIGH |
| Invitaciones | sí | sí | legacy = ECC, HIGH |

Condiciones adicionales verificadas: cambio de tenant (1 sesión), refresh (2 sesiones), dos pestañas (2 sesiones), sesión prolongada (55 min). En todas, la resolución es determinista por `correlationId` y no aparecen escrituras.

---

## 6. Evidencia técnica

- Motor de observación: `src/lib/ecc/pilot-observation.ts`
- Suite: `src/test/ecc-phase4c-pilot-observation.test.ts` — 11 tests en verde
- Base de decisiones: `src/lib/ecc/pilot-live.ts` (Fase 4B, sin cambios en esta fase)

---

## 7. Deuda separada

El fallo `driver-sync-roundtrip` es **preexistente y ajeno al ECC**. No se modificó dentro de esta fase.
Reporte independiente: `docs/qa/DEBT_DRIVER_SYNC_ROUNDTRIP_TEST_FAILURE.md`.

---

## Confirmación final

**QA Testing completó la ventana de observación sin mismatches, alertas, decisiones inesperadas ni impacto cross-tenant; ECC puede considerarse estable para esta compañía.**
