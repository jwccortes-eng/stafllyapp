# P0 — VWC Fase 3B: Documentos y Compliance (H03)

Estado: **cerrado**. Alcance: `employee_documents` y `employee_onboarding_documents`.
No toca payroll, fichajes, tarifas, saldos, políticas de asignación ni RLS existentes.

## 1. Infraestructura

| Tabla | Cambio |
|---|---|
| `employee_documents` | `version`, `updated_by`, `updated_at` + trigger `bump_row_version` |
| `employee_onboarding_documents` | `version`, `updated_by`, `updated_at` + trigger `bump_row_version` |

Auditoría: cada intento (aplicado o en conflicto) se registra en `versioned_write_audit`
con entidad, empresa, actor, versión esperada/real y campos intentados.

## 2. Carriles

| Carril | Operación | Vía |
|---|---|---|
| 1 — Creación | Alta de documento (upload admin / onboarding) | `insert` acotado; el archivo se sube primero y la fila se limpia si falla |
| 2 — Edición | Metadata descriptiva (`name`, `category`, `expires_at`) | `versioned_update_employee_document` (PATCH parcial + `expected_version`) |
| 3 — Transición | `approved` / `rejected` / `replacement_requested` / `expired` / `pending` | `review_employee_document` |
| Borrado | Eliminar documento de onboarding | `delete` con compare-and-set sobre `version` |

**Prohibido**: cambiar estado vía update genérico. La RPC de edición rechaza
cualquier clave fuera de la lista blanca (`name`, `category`, `expires_at`).

## 3. Campos protegidos

`id`, `employee_id`, `company_id`, `file_url`, `file_type`, `file_size`,
`review_status` / `status`, `reviewed_at` / `verified_at`, `reviewed_by` / `verified_by`,
`rejection_reason` / `notes`, `version`. Ninguno es escribible por el carril 2.
El documento tampoco puede cambiar de empresa: la RPC filtra por `company_id`.

## 4. Permisos

Sólo `admin`, `owner` o `manager` de la empresa dueña del documento pueden
revisar o editar metadata. Rechazo y solicitud de reemplazo exigen motivo.

## 5. Caso A/B obligatorio — rechazo obsoleto no pisa una aprobación

| Paso | Actor | Estado observado | Acción | Resultado |
|---|---|---|---|---|
| 1 | A y B abren el mismo documento | `pending`, `version = 3` | — | — |
| 2 | A | v3 | Aprobar | `applied`, documento `approved`, `version = 4` |
| 3 | B | v3 (obsoleto) | Rechazar | `conflict` (`expected 3` / `actual 4`) — **no se escribe nada** |
| 4 | B | — | Diálogo único de conflicto → "Ver versión actual" | Recarga y ve la aprobación de A |

La aprobación de A sobrevive. Ninguna decisión se sobrescribe en silencio.
El conflicto queda en `versioned_write_audit` con `conflict_type = stale_version`.

## 6. Superficies migradas

- `src/lib/document-actions.ts` — aprobar, rechazar, pedir reemplazo y vencimiento.
- `src/components/documents/DocumentReviewActions.tsx` — diálogo de conflicto.
- `src/components/employee/EmployeeProfileTabs.tsx` — diálogo de conflicto.
- `src/pages/admin/DocumentsCenter.tsx` y `AssistedExtractionPanel.tsx` — `version` propagada.
- `src/pages/admin/EmployeeOnboarding.tsx` — borrado con versión.
- `src/lib/documents-signals.ts`, `useCompanyDocuments`, `WorkerDocumentsCompliance` — `version` en la fila unificada.

## 7. Verificación

- `bunx tsgo --noEmit`: verde.
- `bunx vitest run src/test/versioned-write.test.ts`: 15/15 verde, incluidos los
  guardianes de "cero `.update()` directos" sobre ambas tablas de documentos.
