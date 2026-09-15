# PERIOD 148 RECEIPT POPULATION TRACE

Periodo 148 · 2026-09-02 → 2026-09-08 · Quality Staff (`00000000-…-0001`) · `b17caedc-c2c7-4a53-85e9-e429162da34f`
Modo: **solo lectura. Cero escrituras en producción.**

```
External approved workers:        68   ($41,499.07 en approved_total_override)
Distribution queue "approved":    71
Difference:                       +3
Exact reason: 3 filas que NO existen en period_base_pay y entran por el
FULL OUTER JOIN con `movements` del RPC bulk_pay_statement_preview.
Additional worker IDs:
  24c83018-b386-4110-90f1-74b5762d5f47  Angel Colon (dup, inactivo)   +$525
  ef4e5966-122c-4aed-a53a-281480b67e29  Edinson Leon (dup)            +$400
  82e58682-423b-40eb-b26d-c072a735212a  Francisco Patino (dup)        +$400
Ready: 56 · No access: 14 · Published: 1
Previous no-account count: 12 → current 14 · Difference +2
Exact reason: las filas duplicadas de Angel (24c83018) y Edinson (ef4e5966)
no tienen cuenta y caen en NEEDS_ACCOUNT.
Would current bulk eligibility include an unsafe duplicate/unresolved row? **YES**
  82e58682 (Francisco, READY_TO_PUBLISH, $400)
  ef4e5966 (Edinson, NEEDS_ACCOUNT pero readiness='ready', $400)
  24c83018 (Angel, NEEDS_ACCOUNT pero readiness='ready', $525)
Los tres importes ya están incluidos en el total externo aprobado del
registro canónico del mismo humano.
```

---

## 1. Definición exacta de "Aprobados"

`summarizeDistribution().approved = rows.length` (`src/lib/payroll/receipt-distribution.ts:206`).
`rows` = salida íntegra de `fetchBulkPreview(periodId)` → RPC `bulk_pay_statement_preview`.

Población del RPC:

```sql
base AS (SELECT … FROM period_base_pay WHERE period_id = _period_id)
mov  AS (SELECT … FROM movements m JOIN concepts c … WHERE m.period_id = _period_id GROUP BY employee_id)
merged AS (SELECT COALESCE(b.employee_id, mv.employee_id) … FROM base b FULL OUTER JOIN mov mv USING(employee_id))
```

- Tablas: `period_base_pay`, `movements` + `concepts`, `employees`, `pay_statements`.
- Clave trabajador-periodo: `employee_id` + `_period_id`.
- Filtro de empresa: **ninguno en la población**; la empresa solo se usa después para `readiness` (`emp_company_id IS DISTINCT FROM _company_id → blocked`).
- Requisito de aprobación: **ninguno**. No exige `approved_total_override`, ni recibo, ni movimiento aprobado.

Respuesta explícita: **E) otra cosa** — más concretamente **A**, ampliada:
filas trabajador-periodo con **datos de nómina o con cualquier movimiento** del periodo.
No es C (cierre externo) ni D (elegibilidad de recibo). La etiqueta "Aprobados" es incorrecta respecto a lo que cuenta.

## 2. Fuente de las 71 filas

| Origen | Filas |
|---|---|
| `period_base_pay` del periodo | 68 |
| `movements` con `employee_id` sin fila en `period_base_pay` | 3 |
| **Total merged** | **71** |

(`movements` tiene 40 empleados distintos en el periodo; 37 coinciden con base, 3 no.)

## 3. Fuente de los 68 aprobados externos

`period_base_pay WHERE period_id = 148`: 68 filas, **68 con `approved_total_override` no nulo**,
suma `41,499.07` — coincide exactamente con la evidencia de cierre externo.

## 4. Mapeo cierre externo → filas de cola

- 68 / 68 mapean **1:1** a una fila trabajador-periodo (mismo `employee_id`).
- 0 mapean a múltiples registros de trabajador (el cierre se cargó sobre el registro canónico).
- 0 sin correspondencia de trabajador.
- **3 filas de cola sin contraparte en el cierre externo** (las tres duplicadas).

Nada se re-emparejó ni se modificó.

## 5–7. Traza de las seis filas de nombre duplicado

| Persona | worker_id | Rol | Relación empresa | Computado | Total ext. aprobado | Recibo | Cuenta | Bucket actual | `readiness` |
|---|---|---|---|---|---|---|---|---|---|
| Angel Colon | `50f5c5ac…` (954) | canónico | Quality Staff, activo | 607.50 | **607.50** | no | sí | READY_TO_PUBLISH | ready |
| Angel Colon | `24c83018…` (1205) | duplicado confirmado (tel+email) | Quality Staff, **inactivo** | 525.00 | **—** | no | no | NEEDS_ACCOUNT | **ready** |
| Edinson Leon | `d04a3506…` (1104) | canónico probable | Quality Staff, activo | 497.50 | **497.50** | no | no | NEEDS_ACCOUNT | ready |
| Edinson Leon | `ef4e5966…` (1259) | duplicado sin evidencia humana | Quality Staff, activo | 400.00 | **—** | no | no | NEEDS_ACCOUNT | **ready** |
| Francisco Patino | `1f61628f…` (1063) | canónico probable | Quality Staff, activo | 617.50 | **617.50** | no | no | NEEDS_ACCOUNT | ready |
| Francisco Patino | `82e58682…` (1305) | duplicado sin evidencia humana | Quality Staff, activo | 400.00 | **—** | no | **sí** | **READY_TO_PUBLISH** | **ready** |

Hallazgo monetario decisivo: en los tres casos el importe de la fila duplicada
**ya está contenido** en el total externo del registro canónico.

- Angel: base 82.50 + 525.00 = **607.50** = override canónico.
- Edinson: base 97.50 + 400.00 = **497.50** = override canónico.
- Francisco: base 217.50 + 400.00 = **617.50** = override canónico.

Cada fila duplicada tiene un único movimiento `Weekend Job` (categoría `extra`,
aprobado, visible al trabajador) por ese importe.

Contribución a los KPIs: 71 aprobados (+3) · 56 listos (+1: Francisco `82e58682`) ·
14 sin acceso (+2: Angel `24c83018`, Edinson `ef4e5966`) · 1 publicado (+0).

## 8. Reconciliación 12 → 14 sin acceso

Definición actual de "Sin acceso" = `NEEDS_ACCOUNT` = `employees.user_id IS NULL`
sobre las 71 filas. Los 14: Adriana Estrada (136), Alejandra Toaquiza (1279),
**Angel Colon (1205)**, Anthoneiker Diaz (1316), Claudia Grisales (1310),
**Edinson Leon (1259)**, Edinson Leon (1104), Francisco Patino (1063),
Gabriel Fuhr (1312), Jeancarlos Ortiz (1260), Jose Diaz (1304), Joshua Duque (1280),
Mardoqueo Sapon (1320), Martin Cossio (1110).

Quitando las dos filas que no existen en el cierre externo quedan **12**, exactamente
el número de la auditoría previa. Causa: **filas de trabajador duplicadas**, no un
cambio de definición de cuenta, ni cuenta inactiva, ni relación de portal ausente.

## 9. Recibo publicado

Único recibo: `f606ddb9-99c4-45c4-8e96-3346b3a142c1` · Jorge Cortes
(`482e78ca-d42b-4e12-86f5-6963c3012e61`, id 101, Quality Staff).
`approved_total_override` = 567.00 · `frozen_total` = **567.00** (coinciden) ·
publicado 2026-09-15 17:33:35 UTC · `user_id` presente → visible en "Mis pagos".
Sin duplicidad de identidad. No se republicó ni despublicó.

## 10. Traza de seguridad de "Seleccionar elegibles"

`ReceiptDistributionQueue.tsx:173` selecciona **todas las filas visibles con `r.eligible`**,
y `eligible = preview.readiness === 'ready'` — independiente del acceso al portal y
de la identidad. Con el filtro "Todos" y sin búsqueda, la selección sería de **70 filas**
($-total incluyendo los tres importes duplicados).

- Angel `24c83018`: **SÍ se seleccionaría** ($525).
- Edinson `ef4e5966`: **SÍ se seleccionaría** ($400).
- Francisco `82e58682`: **SÍ se seleccionaría** ($400).

Resultado: el mismo humano recibiría dos recibos (p. ej. Francisco: 617.50 + 400.00)
por un único pago externo aprobado. No se ejecutó ninguna previsualización ni publicación;
la traza es de código y datos.

## 11. Semántica de identidad — ¿protege la implementación actual?

**No.** La derivación solo consume `bulk_pay_statement_preview` + `employees.user_id` +
invitación. `IDENTITY_REVIEW` solo se alcanza por `activation_unlinked` o por texto de
`blocking_reason`. El resolutor canónico de personas (`resolveCanonicalPerson`) **no** se
consulta en la cola, así que ni el duplicado CONFIRMADO (Angel) ni los POSIBLES
(Edinson, Francisco) bloquean nada. Tampoco se implementó ningún cambio aquí.

## 12. Cabecera "0 sin acceso" vs KPI "14 sin acceso"

Miden cosas distintas y la etiqueta de la cabecera es engañosa:

- Cabecera (`ReceiptDistributionQueue.tsx:245-246`): `summary.publishedNoAccess`
  = recibos **ya publicados** cuyo trabajador no tiene acceso → 0. Y `summary.blocked`
  = bloqueos de publicación (pendientes/cálculo/otros) → 0.
- Tarjeta KPI: `summary.noAccount` = `NEEDS_ACCOUNT` → 14.

Es un **defecto de presentación** (misma palabra para dos métricas), no un error de consulta.

## 13. Confirmación de cero escrituras

Solo `SELECT` y lectura de código. No se publicó, despublicó ni creó ningún recibo;
no se crearon cuentas ni invitaciones; no se fusionaron ni borraron identidades;
no se tocaron `period_base_pay`, `movements`, totales aprobados, cierre externo,
cuentas, tenants ni RLS. Recibo de Jorge Cortes intacto.

## 14. Corrección mínima recomendada — NO IMPLEMENTAR

1. **Población**: la cola debe partir de `period_base_pay` (cierre aprobado) y tratar los
   `employee_id` que solo aparecen en `movements` como **excepción visible** —
   nuevo estado tipo `MOVEMENT_WITHOUT_APPROVED_PAYROLL` — nunca como "Aprobado" ni elegible.
2. **Elegibilidad**: excluir de `eligible` cualquier fila sin `approved_total_override`
   en el periodo, en vez de dejar que `readiness='ready'` la habilite.
3. **Identidad**: consultar el resolutor canónico en sombra y degradar a
   `IDENTITY_REVIEW` toda fila cuyo humano tenga otra fila en el mismo periodo
   (duplicado CONFIRMADO o POSIBLE), sin fusionar nada.
4. **Cabecera**: renombrar a "publicados sin acceso" para no chocar con el KPI "sin acceso".

Es la corrección más pequeña: una condición de población, una de elegibilidad,
una señal de identidad ya existente y una etiqueta.

---

## FINAL VERDICT

🔴 **STOP — CURRENT ELIGIBILITY CAN PUBLISH DUPLICATE / WRONG RECEIPTS**
