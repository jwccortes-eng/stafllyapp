# P0 — Payroll 142 · Identity Resolver Fix (solo resolver)

Fecha: 2026-08-20 · Alcance: `supabase/functions/import-payroll-extras/index.ts` → `handleBridge` (lectura de roster).

## Root cause
1. La proyección pedía `employees.status`, columna inexistente → PostgREST devolvía `42703`.
2. El error se descartaba (`const { data: employees } = await ...`), dejando el roster vacío.
3. Sin roster, las 50 filas del cierre caían a `NOT_FOUND` (falsos negativos).
4. Bug latente: sin paginación, PostgREST corta en 1.000 filas y Quality Staff tiene 1.420 fichas.

## Diff exacto (conceptual)
- `select(... , merged_into_employee_id, status)` → `select(... , merged_into_employee_id)` (sin `status`).
- Lectura paginada con `.order("id").range(from, from+999)` en bucle hasta agotar páginas.
- `rosterError` ya no se ignora: retorna `500` con `stage: "identity_roster_read"` y mensaje técnico; el preview se bloquea en vez de emitir NOT_FOUND masivos.
- `rosterCount` expuesto en el summary del preview para auditar cobertura del roster.

## Roster count
- Total fichas Quality Staff: **1.420**
- Canónicas (sin `merged_into_employee_id`): **1.331**
- Con `employer_identification`: **282**
- El resolver ahora lee las 1.420 (3 páginas), no 1.000.

## QA identidad
- Clave primaria determinista: `employer_identification` normalizado (`"1291.0" → "1291"`). Sin cambios en la normalización.
- Nombre sigue siendo solo corroboración informativa; sin fallback por nombre para MATCHED.
- Caso verificado: `376 · Alejandro Solano` → `8e3ed4ff-a8da-474a-910e-0271aaf39414`, única coincidencia (0 ambigüedad).
- Reconciliación previa por SQL directo: **50/50 MATCHED**, 0 colisiones. El runtime ahora replica esa misma consulta.
- Un ID inexistente sigue devolviendo `NOT_FOUND` (la rama de matching no fue tocada).

## Financiero (sin cambios)
- Parser monetario intacto (`_shared/payroll-money.ts`).
- Total aprobado **$28,418.24**; suma de componentes $28,965.24.
- Overrides preservados: **ANDRES VARGAS −52.00**, **JOHNY MUNERA −495.00**.

## Zero-write proof
- El modo `preview` no ejecuta ningún `insert/update/upsert`; solo `select` sobre `pay_periods`, `employees`, `concepts` y `period_base_pay`.
- No se ejecutaron migraciones, importaciones ni publicaciones en este cambio.

## Blast radius
- Un solo archivo, una sola rama (`handleBridge`), solo lectura de roster.
- Sin impacto en payroll, movements, pay_statements, auth, RLS, tenants ni datos de producción.

## Veredicto
🟢 **SAFE TO RETEST PREVIEW**
