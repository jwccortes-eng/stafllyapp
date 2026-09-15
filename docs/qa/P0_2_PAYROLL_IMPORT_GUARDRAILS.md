# P0.2 — PAYROLL IMPORT GUARDRAILS

Alcance: proteger el pipeline de importación admin de nómina. Sin cambios de cálculo,
sin migraciones, sin reimportaciones, sin publicaciones, sin notificaciones.

---

## 1. ROOT CAUSE

El bridge de cierre externo (`supabase/functions/import-payroll-extras/index.ts`,
`handleBridge`) validaba únicamente:

- que el periodo existiera y perteneciera a la compañía,
- identidad de trabajador y parseo de dinero,
- que el total esperado coincidiera al centavo.

No validaba **nada del contenedor temporal**: ni el rango real del archivo, ni el estado
del periodo, ni la existencia de recibos publicados. Por eso el 14-sep-2026 el archivo
`146 UNTITLED_REPORT_2026-08-19_2026-08-25.xlsx` (rango real Aug 19–25) se escribió en el
periodo 146 estando ya cerrado: 26 filas de `period_base_pay`, $15.714,14 aprobados.

El operador nunca vio el rango del archivo en pantalla, así que la discrepancia era
invisible antes de confirmar.

## 2. FILE/PERIOD VALIDATION (Rule 1)

Nuevo módulo compartido, una sola definición espejada en servidor y cliente:

- `supabase/functions/_shared/payroll-import-guard.ts`
- `src/lib/payroll/import-period-guard.ts`

`detectFileRange(fileName)` extrae el rango del nombre del archivo (formato ISO
`2026-08-19_2026-08-25` y compacto `20260819-20260825`), validando que ambas fechas sean
reales. Si no hay rango detectable devuelve `null` y se emite un **aviso**, no un bloqueo.

`evaluatePayrollImportGuards()` compara `fileStart/fileEnd` con `period.start_date/end_date`.
Si difieren, bloquea con el mensaje exacto:

> Este archivo corresponde a {rango del archivo}. El período seleccionado es {rango del período}. Selecciona el período correcto antes de continuar.

Sin override dentro del flujo normal: no hay checkbox ni parámetro que lo salte.

## 3. CLOSED PERIOD PROTECTION (Rule 2)

`BLOCKING_STATUSES = { closed, paid, locked }`. Con cualquiera de esos estados el import
se bloquea con:

> Este período está cerrado y no acepta nuevas importaciones.

No se reabre nada de forma silenciosa. La reapertura, si algún día se necesita, queda
fuera de alcance y debe ser un flujo privilegiado aparte.

Nota operativa relevante: de 212 periodos, 153 están `closed`, 51 `open` y 8 `paid`. La
regla es por tanto muy restrictiva por diseño — es lo pedido, pero implica que las
correcciones históricas tendrán que pasar por el flujo privilegiado futuro.

## 4. PUBLISHED STATEMENT PROTECTION (Rule 3)

Antes de cualquier escritura, el servidor cuenta recibos con
`pay_statements.pay_period_id = period AND status = 'published'`. Si hay uno o más:

> Este período tiene recibos publicados. No se pueden modificar sus datos mediante importación normal.

No se tocan filas de recibos, totales congelados, ni el estado de publicación.

## 5. PREVIEW WRITE SAFETY (Rules 4–6)

- El preview sigue siendo **cero escrituras**: devuelve `{ preview: true, writes: 0 }` y no
  ejecuta insert/update/upsert, no genera recibos, no cambia el estado del periodo.
- Los guardarraíles se evalúan **antes** de esa ruta, así que un archivo bloqueado ni
  siquiera llega a lógica de escritura.
- La vista previa de `ExternalPayrollCloseImport.tsx` ahora muestra: compañía, período
  seleccionado (con estado), período detectado en el archivo, filas de trabajador, válidas
  e inválidas, no emparejados, posibles duplicados, total aprobado del archivo, destino de
  escritura (`period_base_pay` + `movements`) y recibos publicados del período.
- El botón de confirmación se etiqueta con período, filas e importe:
  «Importar al período {inicio} → {fin} · N filas · $X», y queda deshabilitado mientras
  exista cualquier bloqueo (local o del servidor).
- Aviso local previo: si el archivo y el período elegido no encajan, el bloqueo se muestra
  antes incluso de pedir el preview. La autoridad final sigue siendo el servidor.

## 6. PERIOD 146 IMPACT REPORT (Rule 9 — solo lectura, sin limpieza)

| Dato | Valor |
| --- | --- |
| Filas escritas en `period_base_pay` | 26 |
| Trabajadores distintos afectados | 26 |
| Suma `base_total_pay` | $10.656,14 |
| Suma `approved_total_override` | $15.714,14 |
| Primera escritura | 2026-09-14 21:39:18 UTC |
| Filas en `movements` del periodo | 22 (20 aprobadas), $4.478,00 |
| `movements` ligadas a un recibo | 0 |
| Recibos en el periodo (`pay_statements`) | 0 |
| Recibos publicados | 0 |

Trabajadores afectados (26): Jesus Alpacaja, Carlos Alvarez, Luis F Buritica, Keury
Camilo, Sophia Contreras, Alejandro Cortes, Jorge Cortes, Luis Duta, Claudia Grisales,
William Hernandez, Jonathan Jalil, Jorge Jalil, Jeiber Lopez, Santiago Morales, Carlos
Ortiz, Mariany Ortiz, Francisco Patiño, William Rodriguez, Dannyerson Rojas, Maria
Sanabria, Arley Sanchez, Peter Sanisaca, Alejandro Tzorin, Andres Vargas, Anderson
Vargas, Kevin Velasquez.

Conclusiones del impacto:

- **Ningún recibo publicado referencia estos datos** (0 recibos en el periodo), por lo que
  **ningún trabajador vio ni ve importes derivados de esta importación**: la vista del
  trabajador lee solo `status='published'` con totales congelados.
- Ningún cálculo de nómina posterior los consume todavía, porque no hay consolidación ni
  recibos generados en 146.
- `time_entries`, `scheduled_shifts`, `shift_assignments` y tarifas **no fueron tocados**
  por el importador: solo escribe `period_base_pay` y `movements`.
- 22 movimientos están marcados como visibles para el trabajador, pero sin recibo
  publicado no aparecen como pago del periodo.

**No se ha aplicado ninguna limpieza.** Queda pendiente decisión humana: mover estas 26
filas al periodo Aug 19–25 correcto o anularlas. Ambas opciones requieren autorización
explícita y un flujo privilegiado.

## 7. PERIOD 142 REGRESSION (Rule 8)

Periodo 142 (22–28 jul), `a2cd1554-adb2-4a67-b82d-c6e2bb451d81`: sin tocar. 50 filas base,
58 movimientos, calculado $28.965,24, aprobado $28.418,24, diferencia −$547,00, 5 recibos
publicados. Ninguna de las escrituras de este trabajo lo alcanza; solo se usó como
referencia de lectura.

## 8. ZERO-WRITE TESTS

`src/lib/payroll/__tests__/import-period-guard.test.ts` — 7 pruebas verdes:

| Caso | Resultado |
| --- | --- |
| Rango ISO detectado en el nombre del archivo | ✅ |
| Sin fechas en el nombre → `null` + aviso, sin bloqueo | ✅ |
| Archivo coincide con periodo abierto → sin bloqueos | ✅ |
| Archivo NO coincide → bloqueo con mensaje exacto | ✅ |
| Periodo cerrado → bloqueo | ✅ |
| Periodo con recibos publicados → bloqueo | ✅ |
| Aviso informativo no bloquea | ✅ |

Suite completa: **1.288 pruebas verdes, 112 archivos**. Typecheck limpio.

Casos QA del spec:

| Caso | Esperado | Resultado |
| --- | --- | --- |
| 1 — Archivo coincide, periodo abierto | Preview + confirmación disponible | ✅ |
| 2 — Archivo no coincide | Bloqueado, cero escrituras | ✅ (servidor y cliente) |
| 3 — Periodo cerrado | Bloqueado, cero escrituras | ✅ |
| 4 — Periodo con recibos publicados | Bloqueado, cero escrituras | ✅ |
| 5 — Preview abierto y cancelado | Cero escrituras | ✅ (`writes: 0`) |
| 6 — Periodo sin datos de origen | Estado vacío honesto | ✅ |
| 7 — Periodo 142 | Sin cambios | ✅ |

Los casos 2–5 se verificaron por lógica y pruebas unitarias, **sin ejecutar importaciones
contra datos de producción**.

## 9. MOBILE QA

El bloque de importación y la vista previa usan una rejilla `sm:grid-cols-2 /
lg:grid-cols-3` que colapsa a una columna en 390 px; el aviso de bloqueo y el estado vacío
del resumen son componentes canónicos responsivos (`StaflyAlertBanner`). Sin desbordamiento
horizontal. El botón de confirmación conserva el texto completo con ajuste de línea.

## 10. DESKTOP QA

A 1280 px la vista previa presenta las 11 métricas exigidas por la Rule 4 en tres
columnas, con período seleccionado y período detectado uno junto al otro — que es
exactamente la comparación que faltaba el 14-sep. El resumen del periodo muestra el banner
de «sin datos cargados» por encima de la tabla y el mismo mensaje dentro de ella.

## 11. TABLES TOUCHED

**Lectura nueva:** `pay_statements` (conteo de publicados por periodo), `pay_periods`
(estado y fechas, ya se leía).

**Escritura:** ninguna. No hubo migraciones, ni DDL, ni cambios de RLS.

## 12. PRODUCTION DATA CHANGES

Cero. No se insertó, actualizó ni borró ninguna fila de producción. No se publicó ningún
recibo, no se envió ningún correo ni notificación, no se reabrió ningún periodo, no se
tocó `time_entries`, `scheduled_shifts`, `shift_assignments`, tarifas, ajustes aprobados
ni recibos publicados.

Archivos modificados:

- `supabase/functions/_shared/payroll-import-guard.ts` (nuevo)
- `supabase/functions/import-payroll-extras/index.ts` (guardarraíles antes de escribir)
- `src/lib/payroll/import-period-guard.ts` (nuevo, espejo cliente)
- `src/lib/payroll/__tests__/import-period-guard.test.ts` (nuevo)
- `src/lib/payroll/payroll142-bridge.ts` (campos de guardarraíl en el resumen)
- `src/components/payroll/ExternalPayrollCloseImport.tsx` (preview + confirmación)
- `src/pages/admin/PeriodSummary.tsx` (estado vacío honesto)

## 13. REMAINING RISKS

1. **Detección por nombre de archivo.** El rango se infiere del nombre. Un archivo sin
   fechas en el nombre produce aviso, no bloqueo: la Rule 1 no puede aplicarse a ciegas.
   Mitigación futura: leer también el rango de las fechas internas de la hoja.
2. **Segunda ruta de importación.** `ImportPayrollExtras.tsx` (extras legacy por nombre,
   con capacidad de crear empleados) sigue sin guardarraíles de servidor: solo comprueba
   el periodo cerrado en cliente. Es la próxima candidata a endurecer.
3. **153 periodos cerrados.** Con la Rule 2 activa, cualquier corrección histórica
   legítima queda bloqueada hasta que exista el flujo privilegiado de reapertura.
4. **Periodo 146 sin resolver.** 26 filas y $15.714,14 siguen en el periodo equivocado,
   sin impacto visible para el trabajador, esperando decisión humana.
5. **Sin enforcement de identidad reforzado.** El matching por nombre como fallback sigue
   siendo posible fuera de este alcance.

---

🟡 IMPORT GUARDRAILS PARTIAL — HUMAN REVIEW STILL REQUIRED
