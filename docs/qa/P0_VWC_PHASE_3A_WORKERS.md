# P0 — VWC Fase 3, Bloque A: Workers y perfiles operativos

Fecha: 2026-08-02 · Alcance: H01 (consolidación de duplicados) y H02 (W-9 del trabajador).
Sin cambios en payroll, horas, compensación, saldos, RLS existentes ni auth.

## 1. Editores migrados

| ID | Superficie | Entidad | Riesgo previo | Carril VWC |
|----|------------|---------|---------------|------------|
| H01 | `src/pages/admin/EmployeeMerge.tsx` | `employees` (merge) | Doble ejecución del merge por doble clic o reintento | 3 — transición transaccional + idempotencia |
| H01b | `src/hooks/useIdentityResolution.ts` (drawer de identidad) | `employees` (merge) | Igual que H01 | 3 |
| H02a | `src/pages/portal/MyW9.tsx` | `contractor_w9` | `UPDATE` crudo que borraba `reviewed_at`/`reviewed_by` de un admin; doble envío creaba registros duplicados | 1 (alta idempotente) + 3 (reenvío) |
| H02b | `src/pages/admin/ContractorW9.tsx` | `contractor_w9` | `UPDATE`/`INSERT` crudos; aprobación sin validar estado ni versión | 2 (PATCH + expected_version) y 3 (aprobación) |

## 2. Cambios en base de datos

- `contractor_w9`: columnas `version` (default 1) y `updated_by`; trigger `trg_zz_bump_contractor_w9_version` con `bump_row_version()`.
- `versioned_update_contractor_w9(...)` — carril 2. Whitelist de 14 campos fiscales; **no** permite mover `status`, `reviewed_*`, `signed_*` ni `submitted_at`. Conflicto → `status: conflict` con versión real y fila vigente.
- `submit_contractor_w9(...)` — carriles 1 y 3. Bloquea el reenvío si el W-9 ya está `approved`, exige que el actor sea el propio trabajador o un admin/owner de la empresa, usa `FOR UPDATE`, y responde de forma idempotente vía `versioned_write_intents`.
- `review_contractor_w9(...)` — carril 3. Sólo admin/owner; sólo desde `submitted`/`pending`/`rejected`; `noop` si ya está en el estado destino; valida `expected_version`.
- `merge_employees_idempotent(...)` — carril 3. Envuelve la RPC `merge_employees` existente (que conserva sus bloqueos `FOR UPDATE` y sus gates de payroll), añade clave de intención y registro en `versioned_write_audit`.

Toda operación aplicada o en conflicto queda en `versioned_write_audit` con `entity`, `entity_id`, `company_id`, `actor_id`, versiones esperada/real, campos y superficie.

## 3. Cambios en cliente

- `src/lib/data/versioned-write.ts`: nueva entidad `contractor_w9` → `versioned_update_contractor_w9` / `p_w9_id`.
- `src/pages/portal/MyW9.tsx`: envío por RPC con `intentKeyRef` (un doble toque no duplica el W-9); en conflicto recarga y avisa sin sobrescribir la revisión del admin.
- `src/pages/admin/ContractorW9.tsx`: edición con `buildPatch` + `versionedWrite`; alta por `submit_contractor_w9`; aprobación por `review_contractor_w9` con `expected_version`.
- `src/pages/admin/EmployeeMerge.tsx` y `src/hooks/useIdentityResolution.ts`: `merge_employees_idempotent` con clave de intención derivada de master + duplicados.

## 4. Guardianes

`src/test/versioned-write.test.ts` incorpora `contractor_w9` a `CRITICAL_TABLES` **sin excepciones**: cualquier `.update()` directo sobre esa tabla rompe la suite. 10/10 tests en verde.

## 5. Fuera de alcance (confirmado)

- Los 8 editores ALTO de payroll/dinero siguen bloqueados (backlog *VWC Fase 3F — Payroll y dinero*).
- `Clients.tsx` permanece clasificado MEDIO.

## 6. Siguiente bloque

Bloque B — Documentos (`employee_documents`, revisión y estados de onboarding).
