# P1 — Pay Statement Preview Fidelity + Safe Bulk Publish

Periodo de referencia: **2026-07-22 → 2026-07-28** (`a2cd1554-adb2-4a67-b82d-c6e2bb451d81`, Payroll 142).
Estado: **implementado y verificado. NO se publicó ningún recibo real.**

## 1. Cambios realizados

**Base de datos (3 funciones):**
- `pay_statement_preview(_period_id, _employee_id)` — ampliada (sigue STABLE / read-only).
- `bulk_pay_statement_preview(_period_id, _employee_ids[])` — nueva, STABLE, zero-write.
- `bulk_publish_pay_statements(_period_id, _employee_ids[], _source)` — nueva, escritura controlada,
  delega en `publish_pay_statement` (misma lógica financiera, sin duplicarla).

**Frontend:**
- `src/lib/payroll/bulk-publish.ts` (nuevo) — adaptador y tipos.
- `src/components/payroll/BulkPublishPanel.tsx` (nuevo) — preview → selección → confirmación → resultado.
- `src/components/payroll/PayStatementPublishCard.tsx` — "Total a publicar" ahora usa `frozen_total_preview`.
- `src/pages/admin/PeriodSummary.tsx` — nueva pestaña **Recibos** en `/app/summary`.

No se creó ninguna tabla nueva. Arquitectura intacta: `period_base_pay` + `movements` → preview → `pay_statements` → portal.

## 2. Fix del preview admin

`pay_statement_preview` ahora devuelve además:
`computed_total`, `approved_total_override`, `approved_total_source`, `frozen_total_preview`, `has_override`.

```
frozen_total_preview = COALESCE(ROUND(approved_total_override,2), ROUND(computed_total,2))
```

`projected_total` se conserva por compatibilidad, pero la UI ya **no** lo usa como "Total a publicar".
Semántica NULL explícita: el override sólo se descarta cuando es `NULL`; `0.00` es un valor válido
(en SQL vía `COALESCE`, en TS vía `override === null || undefined`).

## 3. QA de overrides (datos reales, read-only)

| Trabajador | Employer ID | Desglose | Override | Total a publicar |
|---|---|---|---|---|
| Andres Vargas | 259 | $536.00 | $484.00 | **$484.00** ✅ |
| Johny Munera | 145 | $495.00 | $0.00 | **$0.00** ✅ |

Ambos muestran badge "Total aprobado externo" + línea `Desglose / Total aprobado`.
No se alteró el override, no se crearon movimientos compensatorios, no se recalculó nada.

## 4. Bulk preview (zero-write)

`bulk_pay_statement_preview` es `STABLE SECURITY DEFINER`, exige `periods.view` o `summary.view`
(o global owner) y devuelve por trabajador: employee_id, employer_identification, nombre, company_id,
base, extras, deductions, computed_total, approved_total_override, approved_total_source,
frozen_total_preview, has_override, pending_count, statement_status, portal_access, readiness y
blocking_reason.

Reglas: `published` si ya existe statement publicado; `blocked` si hay movimientos pendientes,
identidad inexistente, cross-tenant o total no calculable; `ready` en el resto.

Resultado del periodo 142 (verificado en DB con la misma lógica):

```
total 50 · published 3 · ready 47 · blocked 0 · overrides 2 · sin portal 11
total pendiente por congelar = $25,470.91
```

Coincide exactamente con la auditoría previa.

## 5. Bulk publish

`bulk_publish_pay_statements` valida permiso (`aprobar_nomina` / `periods.edit` / global owner),
deriva `company_id` del periodo, deduplica IDs y por cada trabajador: skip si ya publicado,
block si cross-tenant/identidad inválida, block si hay pendientes, y en caso contrario invoca
`publish_pay_statement` (que aplica `COALESCE(override, computed)` y congela server-side).
Devuelve `published[] / skipped[] / blocked[] / failed[]` con sus contadores y `published_total`.
No envía notificaciones. Registra `pay_statements_bulk_published` en `activity_log` con actor y timestamp.

## 6. Idempotencia

Antes de tocar nada se consulta `pay_statements.status = 'published'`; si existe se devuelve
`skipped` y se hace `CONTINUE`. Nunca se ejecuta UPDATE, ni se refresca `published_at`, ni se
recalcula `frozen_total`. Los 3 recibos existentes (Juliana $287.00, Kevin $1,895.00,
Carlos Ortiz $765.33) quedan intactos, incluso si se incluyen manualmente en el payload.

## 7. Aislamiento de tenant

`company_id` se deriva del periodo, nunca del cliente. Cada empleado se valida contra ese
company_id antes de publicar; mismatch = `blocked`, jamás publicado. `publish_pay_statement`
mantiene además su propia validación (doble barrera).

## 8. Privacidad

El bulk no expone ni publica `movements.note`, notas de override, notas admin, SSN/EIN ni datos
cruzados. El portal sigue leyendo sólo `worker_pay_statements` / `worker_pay_statement_detail`
con `worker_visible_note`. El portal del trabajador **no fue modificado**.

## 9. QA móvil

Lista basada en cards (sin tabla horizontal, sin charts): nombre, Employer ID, base/extras/
descuentos/desglose, total a congelar, badges de estado, override y portal, checkbox y CTA sticky
con conteo + total seleccionado. KPIs compactos en grid 2 columnas.

## 10. QA escritorio

KPIs (Listos, Publicados, Bloqueados, Overrides, Sin portal, Pendiente por congelar), buscador por
nombre/Employer ID, filtros por estado, acción "Seleccionar listos" (nunca selecciona publicados ni
bloqueados) y modal de confirmación con total, desgloses de riesgo y checkbox obligatorio.
Sin confirmación no se invoca el RPC de escritura. No existe botón "Publicar todo".

## 11. Blast radius

- Cambio de comportamiento visible: "Total a publicar" en la tarjeta individual (ahora fiel).
- Nueva pestaña en `/app/summary`.
- 2 funciones nuevas, 1 ampliada de forma retrocompatible (`projected_total` conservado).
- Cero cambios en datos: ninguna escritura ejecutada durante la implementación.

## 12. Pruebas Payroll 142

- Preview: 50 filas, 47 ready, 3 published, 0 blocked, total pendiente $25,470.91 ✅
- Vargas $484.00 ✅ · Munera $0.00 ✅
- Publicados aparecen como `published`, no seleccionables, con su total congelado real ✅
- 11 workers sin portal: seleccionables, con badge y warning; no bloquean financieramente ✅

## 13. Qué NO se tocó

auth, PIN, RLS fuera de scope, payments, bookings, chat, cálculo de payroll, `time_entries`,
`shift_assignments`, `scheduled_shifts`, documentos, tenants, companies, employees, campañas,
lógica de partners, `period_base_pay` importado, `movements` existentes, recibos ya publicados,
worker portal. No se usaron horas programadas ni se cambiaron tarifas.

## 14. Riesgos restantes

- Publicar a un trabajador sin portal genera un recibo que no verá hasta activar acceso (avisado en UI).
- El bulk es secuencial: con selecciones muy grandes puede acercarse al timeout HTTP; se recomienda
  publicar en lotes (~50 está dentro de rango, ya validado por volumen del periodo).
- `unpublish_pay_statement` sigue siendo la única vía de corrección; el bulk nunca despublica.

## Veredicto

🟢 **READY FOR CONTROLLED BULK PUBLISH** — pendiente de autorización humana explícita.
Los 47 recibos reales del Payroll 142 **no fueron publicados**.
