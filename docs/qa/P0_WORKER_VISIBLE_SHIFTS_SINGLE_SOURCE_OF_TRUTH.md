# P0 — WORKER VISIBLE SHIFTS · SINGLE SOURCE OF TRUTH

Fuente: `docs/qa/P0_WORKER_SHIFT_VISIBILITY_ROOT_CAUSE.md`
Fecha: 2026-08-12 · Alcance: **lectura**. Cero migraciones, cero relink, cero reasignación.

---

## 1. Qué se construyó

### `src/lib/identity/identity-set.ts` — ¿Quién es esta persona?

```
resolveEmployeeIdentitySet(employeeId) → {
  canonical_employee_id,
  company_id,
  related_employee_ids,   // canónico + fichas fusionadas
  shadow_employee_ids,
  had_discarded_candidates
}
```

- Expande **solo** por `merged_into_employee_id` (vínculo canónico confirmado).
  Nunca por nombre, email o teléfono parecidos.
- Descarta cualquier ficha de otro `company_id`. La frontera de tenant es infranqueable.
- Normaliza hacia arriba: si la semilla es una sombra, devuelve el canónico.
- Ante cualquier duda devuelve **solo** el id recibido: nunca amplía de más.
- `resolveWritableEmployeeId()` devuelve el **único** id válido para escribir.
- Caché de 60 s por id, invalidable con `clearIdentitySetCache()`.

### `src/lib/shifts/worker-visible-shifts.ts` — ¿Qué ve esta persona?

```
Auth User → employee canónico → identity set → shift_assignments
→ frontera de company → resolveShiftPublicationTruth → turnos visibles
```

- `resolveWorkerAssignmentEmployeeIds(employeeId)` → ids para `.in("employee_id", …)`.
- `filterWorkerVisibleShifts({rows, companyId, identityEmployeeIds})` → filtro puro.
- `resolveWorkerVisibleShifts(employeeId, rows, companyId)` → resolver completo.
- Marca `from_shadow_identity` cuando la asignación viene de una ficha fusionada.
- **No duplica Publication Truth**: la delega íntegramente en
  `resolveShiftPublicationTruth`. Este módulo solo aporta la identidad.

---

## 2. Superficies migradas

**Portal (eje persona):**
- `src/pages/portal/MyShifts.tsx`
- `src/pages/portal/EmployeeDashboard.tsx`
- `src/pages/portal/PortalClock.tsx` (solo la lectura de turnos del día; los `time_entries` intactos)
- `src/pages/portal/PortalShiftDetail.tsx` ("¿esta asignación es mía?")
- `src/components/dashboard/MyShiftCard.tsx`
- `src/lib/mcp/tools/list-my-shifts.ts`

**Admin por persona:**
- `src/pages/admin/WorkerPassport.tsx`
- `src/components/employee/EmployeeProfileTabs.tsx` (pestaña Turnos)

**Revisadas y NO migradas (no consultan `shift_assignments` por persona):**
`ShiftCaptainRoom` (eje turno), `PortalShiftCard` y `SmartWorkCardHero` (reciben props),
`useWorkedShiftHistory` (solo `time_entries` sobre turnos ya resueltos),
`useEmployeeReputation` (badges), `Attendance`, `UnpaidShiftsReport`,
`AssignmentOverrides`, `useRecommendationSignals` (todas eje turno o lote).

**Intocadas por diseño:** eje turno (`Shifts`, `ShiftOperations`, `StaffingCenter`,
`TodayView`, `OperationsCommandCenter`, `DailyClose`), payroll y `time_entries`.

---

## 3. Antes vs después (sin modificar datos)

| Persona | Portal | Asignaciones publicadas invisibles (antes) | Visibles con el resolver (después) |
|---|---|---|---|
| Jose Rodas | sí | 13 | 13 |
| Julio Velásquez | sí | 11 | 11 |
| Iván Morales | sí | 10 | 10 |
| Carlos Álvarez | sí | 4 | 4 |
| **William Rodríguez** | sí | **4** | **4** |
| Lizardy Castillo | sí | 3 | 3 |
| Mariany Ortiz | sí | 3 | 3 |
| Sophia Contreras | sí | 2 | 2 |
| **Total** | | **50** | **50** |

Ninguna fila de `shift_assignments`, `scheduled_shifts`, `time_entries` ni payroll fue
modificada. La recuperación es puramente de lectura.

---

## 4. QA

| Caso | Esperado | Resultado |
|---|---|---|
| A · canónico con asignación directa | visible | ✅ |
| B · canónico con asignación histórica en ficha fusionada | visible | ✅ |
| C · sombra de otra persona | NO visible | ✅ |
| D · mismo auth, varias empresas | solo la empresa activa | ✅ |
| E · borrador / reserva de borrador | NO visible | ✅ |
| F · publicado + canónico | visible | ✅ |
| G · publicado + fusionado histórico | visible | ✅ |
| H · removida / rechazada / cancelada | NO visible | ✅ |
| I · payroll y time_entries | idénticos antes y después | ✅ (ninguna consulta tocada) |

Pruebas: `src/test/worker-visible-shifts.test.ts` — 10/10 en verde. Tipado limpio.

---

## 5. Futuro: nada nuevo sobre las sombras

El resolver existe **solo** para preservar historia. Las escrituras siguen bloqueadas:

- Base de datos: el trigger `trg_block_writes_merged_employee` ya está activo sobre
  `shift_assignments`, `time_entries`, `clock_events`, `movements`, `period_base_pay`,
  `payroll_adjustments`, `shift_attendance_confirmations`,
  `employee_financial_ledger` y `employee_financial_records`.
- Código: `resolveWritableEmployeeId()` es el único id autorizado para asignar.
- Staffing sigue ofreciendo únicamente fichas canónicas activas.

---

## CIERRE

1. **Fuente única:** `resolveWorkerVisibleShifts` (identidad) sobre
   `resolveShiftPublicationTruth` (publicación), con
   `resolveEmployeeIdentitySet` como juez único de identidad.
2. **William:** sí. Sus 4 asignaciones publicadas —incluidas las de la ficha fusionada
   `e842b53c…`— aparecen en su portal, sin crear ni republicar nada.
3. **50 de 50** asignaciones invisibles quedan resueltas.
4. **8 de 8** personas cubiertas, todas con portal activo.
5. **Ningún caso ambiguo.** Las 89 fichas sombra tienen vínculo canónico explícito y mismo tenant;
   `had_discarded_candidates` marcaría cualquier expansión dudosa y ninguna se produjo.
6. **No.** Ninguna asignación histórica se movió; los UUID siguen intactos.
7. **No se tocó payroll.**
8. **No se tocaron time_entries.**
9. **No.** El trigger de base de datos y `resolveWritableEmployeeId` lo impiden.
10. **No queda ningún P0 de visibilidad de turnos abierto.**
