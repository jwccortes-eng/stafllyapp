# P0.4 — Corrección de seguridad de elegibilidad de recibos (periodo 148)

Estado: **implementado. Cero escrituras de producción. Ninguna publicación.**
Alcance: capa de elegibilidad de la cola de recibos (`/app/summary` → **Recibos**).

## 1. Regla anterior (defectuosa)

`eligible = preview.readiness === 'ready'`.

`readiness` viene del RPC `bulk_pay_statement_preview`, cuya población es un
`FULL OUTER JOIN` entre `period_base_pay` y `movements`. Consecuencia: cualquier
fila con actividad monetaria —incluso un único movimiento auxiliar sin nómina
aprobada— entraba como "Aprobado" y como candidato publicable. En el periodo 148
eso habilitaba 70 filas, incluidos tres registros auxiliares que ya estaban
contenidos en el total aprobado de la misma persona.

## 2. Nueva regla canónica

Nuevo módulo puro `src/lib/payroll/receipt-candidates.ts`
(`resolveReceiptCandidacy`), consumido por `receipt-distribution.ts` y por la
cola. Orden de autoridad:

1. **Registro pagable aprobado** del worker-periodo (`approved_total_override`
   o base/deducciones reales). Sin esto → `auxiliary_no_approved_payroll`.
2. **Relación con la empresa**: la agrupación nunca cruza `company_id`.
3. **Identidad canónica** (`comparePersonRecords`, capa sombra): filas de la
   misma persona se agrupan por unión; se elige una única autoridad probada.
4. **Estado del recibo / bloqueos**: una fila ya publicada es autoridad y no se
   toca jamás.
5. **Acceso a la cuenta**: sigue sin condicionar la elegibilidad.

Resultado por fila: `canonical_candidate` · `auxiliary_duplicate` ·
`auxiliary_no_approved_payroll` · `identity_review`.
`eligible = readiness === 'ready' && role === 'canonical_candidate'`.

Regla dura: **una persona canónica + una empresa + un periodo ⇒ como máximo un
candidato de publicación.** Se aplica en la resolución, nunca borrando historia.

## 3. Periodo 148 — antes / después (medido, no forzado)

| Métrica | Antes | Después |
|---|---|---|
| Aprobados (candidatos) | 71 | **68** |
| Listos para publicar | 56 | 55 |
| Bloqueados | 0 | 0 |
| Sin cuenta, aún sin publicar | 14 | 10 |
| Revisión de identidad | 0 | 2 |
| Publicados | 1 | 1 |
| Visibles | 1 | 1 |
| Publicados sin acceso | 0 | 0 |
| Registros auxiliares (nuevo) | — | 3 |
| Seleccionables por "Seleccionar elegibles" | 70 | **65** |

68 = 55 listos + 10 sin cuenta + 2 identidad + 1 publicado. Reconcilia con la
población de cierre externo (68) sin hardcodear el número.

## 4. Angel Colon

- `50f5c5ac…` (id 954) → `canonical_candidate`, READY_TO_PUBLISH, $607.50.
- `24c83018…` (id 1205) → `auxiliary_duplicate`, $525.00: preservado
  históricamente, no aprobado, no elegible, no contado como "sin cuenta".
- Identidad CONFIRMED_SAME_PERSON (teléfono + email). **No se fusionó nada.**

## 5. Edinson Leon

- `d04a3506…` (id 1104, $497.50) → `identity_review`.
- `ef4e5966…` (id 1259, $400.00) → `auxiliary_duplicate`.
- Evidencia solo por nombre ⇒ POSSIBLE_SAME_PERSON ⇒ **ninguna de las dos filas
  es publicable**. Requiere confirmación humana. No se adivina, no se fusiona.

## 6. Francisco Patino

- `1f61628f…` (id 1063, $617.50) → `identity_review`.
- `82e58682…` (id 1305, $400.00) → `auxiliary_duplicate`.
- Mismo criterio que Edinson: bloqueo conservador hasta evidencia humana.

## 7. Prueba de seguridad de la selección masiva

"Seleccionar elegibles" toma únicamente filas con
`eligible === true`. En 148 selecciona 65 filas y excluye: 3 auxiliares,
2 revisiones de identidad, 1 recibo ya publicado, 0 bloqueados. La
previsualización lista nombre **e id de trabajador** de cada candidato antes de
publicar.

## 8. Aserción de unicidad previa a publicar

`assertUniqueReceiptCandidates(selección)` agrupa por persona canónica y
devuelve los conflictos. Se ejecuta dos veces: al abrir "Preparar publicación"
y otra vez justo antes de publicar. Con conflicto: se detiene todo el flujo con
aviso explícito y **no se publica ninguna de las filas en conflicto**; nunca se
elige una en silencio. Ejecutado sobre los datos reales de 148: **0 conflictos**.

## 9. Regresión periodos 146 y 147

Población: 146 = 26 filas (26 con base y total aprobado, 0 solo-movimiento);
147 = 60 filas (60 con base y total aprobado, 0 solo-movimiento). Consulta de
duplicados de nombre dentro de cada población: **vacía**. Por tanto las 86 filas
siguen siendo `canonical_candidate` y ningún trabajador legítimo quedó excluido.
Contadores sin cambio. Sin impacto cruzado entre empresas.

## 10. Integridad de recibos publicados

El único recibo publicado de 148 (`f606ddb9…`, Jorge Cortes, $567.00, publicado
2026-09-15 17:33:35 UTC) se clasifica como `canonical_candidate` /
PUBLISHED_VISIBLE, con el mismo total congelado. No se republicó, despublicó ni
recalculó. Recibos de 142 y 147 intactos. "Mis pagos" del trabajador sin cambio:
la corrección vive solo en la capa de elegibilidad del administrador.

## 11. Cero mutación de datos de nómina

No se modificó ni una fila: `period_base_pay`, `movements`, `time_entries`,
totales aprobados, cierres externos, tarifas, fórmulas, identidades, cuentas,
contactos, relaciones con empresas, `pay_statements`. Ni fusiones, ni borrados,
ni movimientos compensatorios, ni notificaciones. Solo código.

## 12. Pruebas

`bunx vitest run`: **116 archivos, 1324 pruebas verdes** (6 nuevas en
`src/test/receipt-candidates.test.ts`). `tsgo --noEmit` limpio. Clasificación
del periodo 148 verificada contra datos reales en modo lectura.

## Semántica de encabezados (parte 10 del encargo)

- "Sin cuenta, aún sin publicar" — trabajadores elegibles sin acceso todavía.
- "Ya publicados sin acceso" — recibos publicados cuyo trabajador aún no puede verlos.
- "Registros auxiliares" — filas monetarias de una persona que ya tiene su
  candidato canónico. Visibles, nunca publicables.

## Veredicto

🟡 **ELIGIBILITY IMPROVED — IDENTITY CASES STILL BLOCK BULK PUBLICATION**

La duplicación de recibos ya no es posible (68 candidatos, 65 seleccionables,
0 conflictos), pero Edinson Leon y Francisco Patino siguen bloqueados a la
espera de evidencia humana de identidad, por lo que la publicación masiva del
periodo 148 no cubre a toda la población aprobada.
