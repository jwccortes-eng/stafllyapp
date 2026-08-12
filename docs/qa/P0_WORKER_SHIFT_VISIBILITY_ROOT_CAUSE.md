# P0 — WORKER SHIFT VISIBILITY · ROOT CAUSE (William Rodríguez)

Fecha: 2026-08-12 · Modo: **solo lectura**. No se modificaron datos, no se reasignó nada,
no se aplicó ningún fix. Evidencia: consultas SELECT sobre la base operativa y lectura del
código de las superficies de administración y portal.

---

## Recorrido completo

| Paso | Dato real | Resultado |
|---|---|---|
| Shift | p. ej. `202601` (13-may), `215` (25-abr), `340` (01-ago) — `publication_status = published`, `deleted_at = null` | ✅ existe y está publicado |
| Assignment | `53ef26ba…`, `553b17db…`, `85400717…` — `is_draft_reservation = false`, `status` accepted/pending | ✅ asignación real y activa |
| Employee | **`e842b53c-d53c-417e-8732-608d91b00f4a`** — William Rodriguez, `is_active = false`, `user_id = NULL`, `merged_into_employee_id = 28b436c6…` | ⚠️ ficha **fusionada (sombra)** |
| Canonical Employee | `28b436c6-a997-4d04-9ee2-2401e6268dba` — William Rodriguez, activo | ✅ correcto |
| Membership | Ambas fichas en Quality Staff (`0000…0001`) | ✅ mismo tenant |
| Auth User | `8c04ffea-c79a-4fc5-a201-c8a4897e22d1` — colgado **solo del canónico** | ✅ portal activo |
| Portal Resolver | `useEffectiveEmployee` → `stableEmployeeId = 28b436c6…` | ✅ resuelve al canónico |
| My Shifts | `shift_assignments.eq("employee_id", 28b436c6…)` | ❌ **las asignaciones de la ficha sombra no entran** |

---

## 1. ¿Qué consulta usa administración?

Parte **del turno**, no de la persona (`src/pages/admin/Shifts.tsx`, línea 755 y superficies
equivalentes):

```
supabase.from("shift_assignments").select("*").eq("shift_id", …)
```

y luego pinta el nombre resolviendo `employee_id` contra el roster de empleados. **No filtra por
`merged_into_employee_id`, ni por `is_active`, ni exige que el empleado tenga portal.** Por eso el
turno aparece con "William Rodríguez" asignado.

## 2. ¿Qué consulta usa el portal?

Parte **de la persona** (`src/pages/portal/MyShifts.tsx`):

```
supabase.from("shift_assignments")
  .select("… scheduled_shifts!inner (…)")
  .eq("employee_id", employeeId)          // ← el canónico resuelto por user_id
  .eq("company_id", emp.company_id)
  .eq("is_draft_reservation", false)
  .is("scheduled_shifts.deleted_at", null)
  .eq("scheduled_shifts.publication_status", "published")
  .not("scheduled_shifts.status", "in", "(cancelled,canceled)")
  .not("status", "in", "(removed,rejected)")
```

## 3. ¿Usan el mismo resolver?

**No.** Comparten `publication-truth` / `shift-guards` para decidir *si un turno está publicado*,
pero **ninguno de los dos resuelve la identidad del trabajador de la misma manera**:

- Admin: identidad = `employee_id` **tal cual está escrito en la asignación**.
- Portal: identidad = `employee_id` **canónico derivado de `user_id`**.

No existe un resolver compartido de "turnos visibles para un trabajador".

## 4. ¿En qué paso desaparece William?

En el paso **Employee → Canonical Employee**.

El turno, la asignación, la membresía, el usuario de auth y el resolver de publicación están todos
correctos. La asignación apunta a la ficha **sombra fusionada** `e842b53c…`, que no tiene `user_id`.
El portal consulta por el canónico `28b436c6…`. Son dos identificadores distintos para la misma
persona, y **la fusión de identidad no arrastró las asignaciones**.

Prueba directa: el turno `88469adb…` (01-ago) tiene **dos** asignaciones de William, una en el
canónico y otra en la sombra. La del canónico se ve en el portal; la de la sombra no.

## 5. ¿Qué condición del WHERE lo excluye?

```
.eq("employee_id", employeeId)   //  28b436c6…  ≠  e842b53c…
```

Esa única igualdad. **Ninguna** de las demás condiciones lo excluye: el turno está publicado, no
borrado, no cancelado, la asignación no es reserva de borrador y no está removida ni rechazada.

## 6. ¿Hay otros trabajadores afectados?

**Sí.** Mismo patrón exacto, en Quality Staff:

- **8 personas** con asignaciones colgando de una ficha fusionada.
- **50 asignaciones** publicadas, activas y no borradas, invisibles para su dueño.
- **89 fichas sombra** en total; **52** de ellas pertenecen a personas que sí tienen portal activo.
- **0 turnos futuros** afectados hoy (todos son pasados) → impacto actual: historial, horas y
  confianza, no cobertura del día.

Casos confirmados: William Rodríguez, Carlos Álvarez, Mariany Ortiz, Lizardy Castillo,
Julio Velásquez, y 3 más.

## 7. ¿Debe existir un resolver canónico de Worker Visible Shifts?

**Sí, y es obligatorio.** El defecto no es de datos: es estructural. Hoy cada superficie decide por
su cuenta *qué identidad* representa a un trabajador, y por eso admin y portal pueden discrepar sin
que nada falle. El resolver debe:

1. Expandir la identidad de la persona al **conjunto** de fichas que le pertenecen
   (canónica + todas las que apuntan a ella por `merged_into_employee_id`), no a un único id.
2. Aplicar encima la verdad de publicación ya existente (`publication-truth` / `shift-guards`).
3. Ser la **única** función autorizada para responder "¿qué turnos ve esta persona?", tanto en el
   portal como en cualquier contador que administración muestre sobre esa persona.

Sin el punto 1, cada futura fusión de identidad vuelve a crear turnos invisibles.

## 8. Superficies que deben migrar

**Portal (lectura por persona) — obligatorio:**
- `src/pages/portal/MyShifts.tsx`
- `src/pages/portal/EmployeeDashboard.tsx`
- `src/pages/portal/PortalClock.tsx`
- `src/pages/portal/ShiftCaptainRoom.tsx`
- `src/components/portal/PortalShiftCard.tsx`
- `src/components/portal/SmartWorkCardHero.tsx`
- `src/components/portal/PortalShiftDetailDrawer.tsx`
- `src/components/dashboard/MyShiftCard.tsx`
- `src/hooks/useWorkedShiftHistory.tsx`
- `src/lib/mcp/tools/list-my-shifts.ts`

**Admin, cuando el eje es la persona (deben coincidir con el portal):**
- `src/pages/admin/WorkerPassport.tsx`
- `src/components/employee/EmployeeProfileTabs.tsx`
- `src/pages/admin/Attendance.tsx`
- `src/pages/admin/UnpaidShiftsReport.tsx`
- `src/pages/admin/AssignmentOverrides.tsx`
- `src/hooks/useEmployeeReputation.tsx`
- `src/hooks/useRecommendationSignals.ts`

**Debe seguir viendo TODAS las asignaciones tal cual (eje = turno), sin migrar:**
- `src/pages/admin/Shifts.tsx`, `ShiftOperations.tsx`, `StaffingCenter.tsx`, `TodayView.tsx`,
  `OperationsCommandCenter.tsx`, `DailyClose.tsx`, y el carril de nómina.
  Estas superficies deben, en cambio, **señalar** que la asignación cuelga de una ficha fusionada.

---

## Conclusión

Administración ve el turno porque lee la asignación **por turno**, y la asignación existe.
El trabajador no lo ve porque el portal lee **por identidad canónica**, y la asignación quedó
anclada a su ficha fusionada. El punto de ruptura es la ausencia de un resolver único de identidad
para "turnos visibles del trabajador". No se aplicó ningún cambio.
