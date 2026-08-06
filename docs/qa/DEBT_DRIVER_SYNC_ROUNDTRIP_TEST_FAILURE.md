# DEUDA — `driver-sync-roundtrip` falla (preexistente, fuera del alcance ECC)

**Estado:** abierto
**Origen:** detectado durante ECC Fase 4B/4C · **no causado por ECC**
**Archivo:** `src/test/driver-sync-roundtrip.test.ts` (7/7 tests fallando)
**Código bajo prueba:** `src/lib/shifts/driver-sync.ts`

## Síntoma

```
× 0 conductores …            → supabase.from(...).select is not a function
× 1 conductor …              → Falta el contexto de empresa. Vuelve a seleccionar la empresa…
× 5 conductores …            → idem
× repetido / doble submit …  → idem
× nunca borra asignaciones … → idem
× ignora removidas …         → supabase.from(...).select is not a function
```

## Causa raíz

El test es anterior a la migración **VWC Fase 3D (asignaciones)**. Su mock de `@/integrations/supabase/client` reproduce el modelo antiguo:

1. `syncShiftDriverRoles` ya no hace `update()` directo sobre `shift_assignments`: cada cambio de rol pasa por `versionedAssignmentTransition` (RPC versionada con `expected_status` + `expected_version`), que exige `company_id` y falla con *"Falta el contexto de empresa"* porque las filas del mock no lo traen.
2. El mock de `scheduled_shifts` sólo expone `update`/`eq`; la lectura final `select("driver_employee_id").eq(...).maybeSingle()` no existe en el doble.
3. Las aserciones sobre `shiftPatches` (`{ driver_employee_id: … }`) describen una escritura legada que la implementación actual ya no realiza directamente.

Es decir: **falla el test, no el producto**. `src/test/driver-sync.test.ts` (unidad del planificador de drivers) sigue en verde.

## Riesgo

- **Producto:** bajo. No hay evidencia de regresión en multi-driver; la ruta real está cubierta por la RPC versionada y por `docs/qa/P0_3_MULTIDRIVER_QA_CLOSEOUT.md`.
- **Ingeniería:** medio. Una suite roja permanente enmascara futuras regresiones reales de multi-driver y ensucia la señal de CI.

## Corrección propuesta (fuera de ECC)

1. Reescribir el mock para el contrato actual: incluir `company_id` y `version` en las filas y simular `versionedAssignmentTransition` (o mockear el módulo `@/lib/data/assignment-write`).
2. Añadir `select().eq().maybeSingle()` al doble de `scheduled_shifts`.
3. Reemplazar las aserciones sobre el patch legado por aserciones sobre las transiciones emitidas (`set_role_driver` / `set_role_worker`) y sobre `primaryDriverId`.
4. Conservar las invariantes de negocio ya cubiertas: idempotencia, sin borrados, sin duplicados, ignorar `removed`/`rejected`.

## Regla

No modificar este test ni `driver-sync.ts` dentro de fases ECC. Se resuelve en un bloque propio de deuda técnica.
