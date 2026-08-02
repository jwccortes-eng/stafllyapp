# P0 — VERSIONED WRITE CONTRACT (VWC) · Fase 1: Servicios

Fuente: `docs/qa/P0_DATA_INTEGRITY_LOST_UPDATE_AUDIT.md`
Alcance: infraestructura de concurrencia + edición de Servicios (desktop, móvil, Centro de Operaciones).
Fuera de alcance: payroll, cálculo de horas, `time_entries`, tarifas, adelantos, saldos, los 54 flujos restantes.

---

## 1. Arquitectura VWC

Tres clases de escritura:

| Clase | Caso | Mecanismo |
|---|---|---|
| A — Creación | alta de servicio | idempotencia por `intent_key` (parámetro ya soportado por la RPC; adopción en Fase 2) |
| B — Edición de atributos | editar servicio | PATCH parcial + `expected_version` → `versioned_update_shift` |
| C — Transición de estado | publicar, cancelar, cerrar, retirar worker | RPC transaccional existente que valida el estado previo |

Principio aplicado: **ninguna escritura puede sobrescribir silenciosamente una versión más reciente.**

```text
Editor (desktop/móvil/ops)
   └── buildPatch(actual, siguiente)        → sólo campos cambiados
        └── versionedWrite({ entity, id, companyId, patch, expectedVersion, surface })
             └── RPC versioned_update_shift  (SECURITY INVOKER → RLS intacta)
                  ├── allowlist de columnas editables
                  ├── compara version esperada vs real → CONFLICTO (no escribe)
                  ├── UPDATE ... AND version = expected  (doble red)
                  ├── auditoría en versioned_write_audit
                  └── devuelve la fila persistida
             └── verificación campo a campo de la fila releída
        └── reconcileServiceAfterSave (Single Service State)
```

## 2. Migraciones aplicadas

1. `scheduled_shifts`: `version integer NOT NULL DEFAULT 1`, `updated_by uuid`.
   - Backfill implícito por el `DEFAULT 1` (filas históricas quedan en versión 1).
   - Trigger `trg_zz_bump_shift_version` (BEFORE UPDATE): incremento atómico en servidor
     (`version = OLD.version + 1`), `updated_at = now()`, `updated_by = auth.uid()`.
     Nunca depende del reloj del cliente.
   - Compatibilidad: cualquier escritura antigua sigue funcionando y sube la versión.
   - Rollback: `DROP TRIGGER trg_zz_bump_shift_version` + `ALTER TABLE ... DROP COLUMN version, DROP COLUMN updated_by`.
2. `versioned_write_audit` (+ GRANTs, RLS por empresa, índices por entidad y por empresa).
3. `versioned_update_shift(p_shift_id, p_company_id, p_patch, p_expected_version, p_surface, p_intent_key)`.
   - `SECURITY INVOKER`: la RLS de `scheduled_shifts` sigue mandando.
   - Allowlist de columnas operativas: título, fecha, horas, cliente, ubicación,
     punto de encuentro y su hora, lugar/dirección del servicio, notas, instrucciones,
     responsable, transporte, conductor legado, categoría, método de fichaje, `claimable`,
     `pay_type`/`pay_override`.
   - Bloqueado por diseño: `company_id`, `shift_ref`, `shift_number`, `status`,
     `publication_status`, `deleted_at`, `cancelled_*`, payroll y cualquier columna de horas.

## 3. Helper canónico

`src/lib/data/versioned-write.ts`

- `buildPatch(current, next)` — diff tolerante a formatos de hora (`17:00` ≡ `17:00:00`).
- `rowVersion(row)` — versión observable.
- `versionedWrite(input)` — resultados: `applied | noop | conflict | error{denied|not_found|invalid|mismatch|error}`.
- Nunca declara éxito por ausencia de error: compara la fila persistida con el patch enviado.

## 4. UI de conflicto (única para todo el ecosistema)

`src/components/data-integrity/VersionConflictDialog.tsx`

> «Cambió este servicio mientras lo editabas. Otra persona guardó una versión más reciente hace 2 minutos. No guardamos nada para no borrar su trabajo ni el tuyo.»

Opciones (targets de 44px, español operativo): **Ver cambios**, **Conservar mis cambios**,
**Volver a editar con la versión nueva**, **Cancelar**.
No hay sobrescritura automática ni merge automático. El merge asistido por campos disjuntos
queda documentado como propuesta, sin implementar.

## 5. Servicios migrados

| Superficie | Archivo | Estado |
|---|---|---|
| Servicios desktop (detalle + editor) | `src/pages/admin/Shifts.tsx` (`handleEditShift`) | PATCH parcial + `expected_version` + conflicto |
| Servicios móvil | `src/components/shifts/mobile/MobileShiftEditSheet.tsx` | PATCH parcial + `expected_version` + conflicto |
| Centro de Operaciones (editar y apagar transporte) | `src/pages/admin/ShiftOperations.tsx` | PATCH parcial + `expected_version` + conflicto |

Las tres leen la versión desde la fuente canónica (`readServiceRow`), reconcilian con
`reconcileServiceAfterSave` y **no cierran el editor hasta confirmar persistencia**.

## 6. Reproducción A/B (autenticada, servicio QK-001573)

```
A guarda meeting_point con version 1        -> applied   version 2
B (stale, version 1) cambia cliente         -> conflict  expected 1 / actual 2
                                               meeting_point de A intacto
B recarga (version 2) y reaplica su cambio  -> applied   ambos campos presentes
Restauración del estado original            -> applied   version 4
```

Ninguna edición se perdió, ninguna sobrescritura silenciosa, servicio restaurado a su estado original.

## 7. Auditoría generada

`versioned_write_audit` registró la secuencia completa:

| surface | result | conflict_type | expected | actual | fields |
|---|---|---|---|---|---|
| repro_session_a | applied | — | 1 | 2 | meeting_point |
| repro_session_b | conflict | stale_version | 1 | 2 | client_id |
| repro_session_b_retry | applied | — | 2 | 3 | client_id |
| repro_restore | applied | — | 3 | 4 | meeting_point |

Campos registrados: entidad, id, empresa, actor, versión esperada/real, tipo de conflicto,
campos intentados, superficie, intent_key, resultado, timestamp. **No se guardan valores**,
sólo nombres de campo. Métricas derivables directamente por consulta:
conflictos detectados (`result='conflict'`), resueltos (retry `applied` posterior),
sobrescrituras evitadas (= conflictos), errores por superficie (`group by surface, result`).

## 8. Excepciones temporales (carril único — Fase 6)

Test guardián: `src/test/versioned-write.test.ts` — falla si aparece un `.update()` directo
nuevo sobre `scheduled_shifts`. Inventario actual (sólo puede reducirse):

- `src/lib/shifts/update-shift.ts` — helper heredado, aún con consumidores.
- `src/pages/admin/Shifts.tsx`, `src/components/shifts/ShiftDetailDialog.tsx` — soft-delete y publicación (Clase C).
- `src/lib/shifts/driver-sync.ts` — roles de conductor.
- `src/pages/admin/ImportSchedule.tsx`, `src/pages/admin/ImportWizard.tsx` — importaciones auditadas.
- `src/components/shifts/ShiftQRSection.tsx`, `src/components/shifts/ShiftShareMenu.tsx` — tokens QR/enlace.

El build no se rompe: los consumidores existentes están clasificados, no bloqueados.

## 9. Riesgos pendientes

- 51 flujos siguen sin `expected_version` (payroll, compensación, horas del día, saldos).
  Congelados según la política VWC; se migran por clase, no por parche local.
- Las transiciones de estado (Clase C) protegen la máquina de estados pero no comparan versión;
  falta unificar el retorno de conflicto estructurado.
- Sin `version` todavía en el resto de entidades críticas: requiere el mismo patrón trigger + allowlist.
- Realtime atrasado: mitigado por la guardia de `Single Service State`, no por el contrato.

## 10. Confirmación

**Stafly ya no permite sobrescrituras silenciosas en la edición de Servicios.**

Typecheck en verde. 521 tests en verde (46 archivos).
