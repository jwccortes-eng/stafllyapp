# Change Intelligence — F1.2 Etapa 1 (Durable Shadow Observation)

Estado: **implementado, OFF por defecto**. Cero canales de entrega. Cero mutaciones de negocio.

## 1. Archivos

**Creados**
- `src/lib/change-intelligence/observation/durable-record.ts` — mapeo puro `ObservationRecord → CiObservationRow` (whitelist, gates de calidad y privacidad, refs opacas, categoría de deadline).
- `src/lib/change-intelligence/observation/durable-sink.ts` — persistencia best-effort vía Edge Function, muestreo determinístico, sin reintentos.
- `src/components/change-intelligence/DurableObservationPanel.tsx` — panel de evidencia (solo lectura + mantenimiento).
- `supabase/functions/ci-observe/index.ts` — ingesta con contrato cerrado.
- `supabase/functions/ci-observation-maintenance/index.ts` — purga, borrado por compañía, stats.
- `src/lib/change-intelligence/__tests__/anti-queue.test.ts` — 7 tests estructurales anti-cola.
- `src/lib/change-intelligence/__tests__/durable-record.test.ts` — 11 tests de privacidad/mapeo/volumen.

**Modificados**
- `src/lib/change-intelligence/flags.ts` — `CI_DURABLE_OBSERVATION`, entorno, etapa, sample rate (todo OFF/demo por defecto).
- `src/lib/change-intelligence/adapters/scheduling/emit.ts` — llamada `persistObservation` no bloqueante.
- `src/pages/admin/dev/ChangeIntelligenceObservation.tsx` — integra el panel F1.2.

## 2. Migración

Una sola migración: `ci_platform_allowlist`, `ci_pilot_allowlist`, `ci_observations`, `ci_observation_reviews`,
`ci_observation_daily_metrics`, funciones `ci_can_read_observations`, `ci_purge_expired_observations`,
`ci_delete_company_observations`. Sin FKs a tablas de negocio (salvo la cascada interna review → observation),
sin triggers de negocio, sin vistas consumidas por el producto.

## 3. Invariantes verificados

| Prueba | Resultado |
|---|---|
| `observation_only = false` | `ERROR: violates check constraint "ci_observations_observation_only_check"` |
| Cliente anónimo SELECT (5 tablas) | `[]` en todas |
| Cliente anónimo INSERT (5 tablas) | `42501 new row violates row-level security policy` |
| Purga 30/90 días | borró 1 observación (40 d) y 1 agregado (100 d); conservó agregado de 40 d |
| Borrado por compañía | borró 2 observaciones, conservó agregados cuando se pide |
| Tests | 94/94 verdes (`bunx vitest run src/lib/change-intelligence`) |

## 4. Contrato de la Edge Function `ci-observe`

`POST { observation: CiObservationRow }` con JWT válido. Rechaza: `change_type` fuera de los 7 autorizados,
`observation_only=false` (`400 observation_only_must_be_true`), cualquier clave de delivery
(`sent_at`, `retry_count`, `delivery_status`, `recipient*`, `push_token`, `queue`… → `400 delivery_semantics_forbidden`),
PII (`422 pii_rejected`), compañía sin fila vigente en allowlist (`403 company_not_in_pilot`), ventana vencida
(`403 pilot_window_expired`). Al superar el límite diario devuelve `202 aggregates_only` y solo incrementa agregados.
Idempotente por `(event_id, engine_version)`. Sin reintentos.

## 5. Rollback

- Nivel 0: flag OFF (estado por defecto) → cero escrituras.
- Nivel 1: `UPDATE ci_pilot_allowlist SET enabled = false` → ninguna compañía observada.
- Nivel 2: `ci_delete_company_observations(<company>)` — **probado**.
- Nivel 3: eliminar las dos Edge Functions.
- Nivel 4: `DROP TABLE ci_observations, ci_observation_reviews, ci_observation_daily_metrics, ci_pilot_allowlist, ci_platform_allowlist CASCADE;`
  (no ejecutado: cerraría el piloto; no existen FKs entrantes ni referencias de producto).

## 6. Pendiente para cerrar Etapa 1

- Alta de staff en `ci_platform_allowlist` (ninguna fila creada: nadie puede leer todavía).
- Ventana de 24–48 h con operaciones manuales en la compañía demo y reporte de resultados.
