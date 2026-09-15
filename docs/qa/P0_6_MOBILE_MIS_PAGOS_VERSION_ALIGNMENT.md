# P0.6 — ALINEACIÓN DE "MIS PAGOS" EN MÓVIL

**Alcance:** solo la pantalla existente del portal del trabajador.
**Cero cambios de datos:** nómina, `time_entries`, movimientos, cierre externo,
importes y sellos de publicación, identidad, cuentas, auth, RLS y tenants
intactos. Ninguna publicación, republicación, despublicación ni migración.

## 1. Qué faltaba

Tras P0.5, la pantalla vigente (`src/pages/portal/PayReports.tsx`) leía **solo**
recibos nativos publicados; la versión anterior leía **solo** reportes
históricos importados. Ninguna de las dos mostraba el historial completo, y el
trabajador con app desactualizada no veía su recibo nativo.

## 2. Qué se hizo

- Nuevo módulo puro de lectura `src/lib/payroll/payment-history.ts` que **une**
  las dos fuentes canónicas ya existentes:
  - recibos nativos → RPC `worker_pay_statements` (`frozen_total`),
  - reportes históricos → `period_base_pay` con `import_id` (`base_total_pay`).
- `PayReports.tsx` (la misma pantalla y la misma ruta `/portal/pay-reports`)
  ahora pinta ese historial unido. Los recibos nativos abren su desglose
  congelado; los históricos se muestran como "Reporte histórico", sin detalle.
- Sin pantalla nueva, sin tabla nueva, sin API nueva, sin portal nuevo.

### Reglas de la unión
- Un periodo con recibo nativo **no** repite su registro histórico: manda el
  recibo. Nunca se suman las dos cifras.
- La deduplicación es por `empresa + periodo`, así que un mismo periodo en dos
  empresas distintas sigue siendo dos pagos distintos.
- Los importes nunca se recalculan en el cliente.
- Los históricos se filtran explícitamente por los registros de trabajador de
  la persona autenticada (ficha viva por empresa + fichas fusionadas), el mismo
  criterio que `user_identity_employee_ids`. Una cuenta con permisos amplios
  tampoco ve pagos ajenos en su portal.

### Semántica de los KPIs
- **Último** = importe del pago visible más reciente por fecha de periodo.
- **Año** = suma de los pagos visibles cuyo periodo termina en el año en curso
  (nativos + históricos, ya sin duplicados). Es historial visible, no un
  acumulado fiscal ni un estado de cuenta.
- **Pagos** = número de pagos visibles.

## 3. QA real — Jorge Cortes, periodo 148

Ejecutado en la ruta real del trabajador `/portal/pay-reports`, viewport 390×844,
con la sesión real del portal:

| Pago | Importe | Tipo |
|---|---|---|
| 2 sep – 8 sep 2026 | $567.00 | Recibo nativo (Pagado) |
| 26 ago – 1 sep 2026 | $2,272.00 | Recibo nativo (Pagado) |
| 1 jul – 7 jul 2026 | $315.00 | Recibo nativo (Publicado) |
| 22 abr – 28 abr 2026 | $93.50 | Reporte histórico |
| 15 abr – 21 abr 2026 | $204.50 | Reporte histórico |
| 18 mar – 24 mar 2026 | $575.00 | Reporte histórico |

KPIs: Último $567.00 · Año $4,027.00 · Pagos 6 (= suma exacta de los seis).

Confirmaciones:
- Empresa correcta (Quality Staff) en cada recibo nativo. ✅
- Trabajador correcto: solo sus propios registros. ✅
- Ningún recibo no publicado visible (el RPC exige `status='published'`). ✅
- Sin fuga entre empresas: filtro por fichas propias + RLS. ✅
- Sin duplicado histórico/nativo: ningún periodo aparece dos veces. ✅
- Los tres reportes históricos siguen visibles con su importe original. ✅

## 4. Regresión

`bunx vitest run`: 117 archivos, **1328 pruebas verdes** (4 nuevas en
`src/test/payment-history.test.ts`). Typecheck limpio.

## 5. Pendiente

El dispositivo del trabajador debe cargar la versión actualizada (publicar y,
en la app instalada, actualizarla). El código y la ruta reales ya muestran el
recibo nativo.

---

## VEREDICTO

🟢 **MOBILE PAYMENT HISTORY ALIGNED — JORGE NATIVE RECEIPT VISIBLE**
