# P0 — Payroll 142: archivo real → Pay Statement (AUDIT ONLY)

Archivo: `142_UNTITLED_REPORT_2026-07-22_2026-07-28.xlsx`
Corte: 07/22/2026 → 07/28/2026 · Empresa: Quality Staff
Modo: **cero escrituras**. No se importó, no se publicó, no se modificó el Excel.

---

## 1. Pestañas del workbook

| Sheet | Filas | Qué es | Clasificación |
|---|---|---|---|
| **All Employees** | 249 × 51 | Volcado operacional crudo de Connecteam: un renglón por marcación (fecha, hora, ubicación, dispositivo, notas de manager, horas, tarifa). 146 filas traen `Total pay`; **ninguna** trae conceptos ni `TOTAL`. | C (operacional/raw) + D (sensible) |
| **PAYROLL** | 50 trabajadores + 1 fila de totales | Hoja de cierre de María. Mismas columnas que la anterior, pero **con los conceptos llenos y el `TOTAL` calculado por fórmula** `=SUM(AN:AU)`. 58 fórmulas. | **A + B + E + F (autoridad financiera)** |
| **SECRETARIA** | 50 + totales, 5 columnas | Lista de pago para tesorería: ID, SSN/EIN, nombre, apellido, `TOTAL`. Sin fórmulas. | A (resumen de pago), D (SSN) |

Diferencia detectada entre PAYROLL y SECRETARIA: **KEURY CAMILO — PAYROLL $2,510.00 vs SECRETARIA $0.00** (todos los demás coinciden al centavo). Es el dueño; se le liquida por otra vía. Total PAYROLL $28,418.24 vs SECRETARIA $25,908.24.

## 2. Fuente canónica

**`PAYROLL` es la única fuente para generar el Pay Statement.** Es la hoja donde María consolida y donde vive la fórmula del total aprobado.

- `All Employees`: **no importar** — es insumo, no resultado; sus `Total pay` son parciales por día.
- `SECRETARIA`: **no importar** — es un espejo de tesorería. Sirve solo como **control cruzado** del total (y para detectar excepciones como Keury).

Valores finales/aprobados en PAYROLL: `Total pay`, `Payper Day`, `Ryde`, `TIPS`, `Reimbursements`, `Travel Hours`, `Otros`, `Discount`, `TOTAL`.
Valores intermedios (ignorar): `Shift hours`, `Hourly rate`, `Daily total pay`, `Regular`, `Overtime`, `Weekly total hours`, y todo lo de marcación.

## 3. Datos que nunca deben publicarse

Presentes en el archivo y **prohibidos** en el statement del trabajador:
`Verification SSN - EIN`, `Phone number`, `Email`, `Start/End - address`, `Start/End - location`, `Start/End - device`, `Start/End (selfie)`, `Manager notes`, `Employee notes`, `Observaciones`.

`Observaciones` es el caso más delicado: contiene saldos y gestiones internas ("ADELANTO ZELLE PENDIENTE POR QUITAR 404 DOLARES", "NUEVO SALDO 1263 DOLARES"). Va a `movements.internal_note`. Solo entra a `worker_visible_note` si un admin la reescribe manualmente. `Employer identification` sí puede mostrarse; el SSN no, nunca, ni parcial.

## 4. Matching de identidad

Prioridad: **`employees.employer_identification` (exacto, dentro de la empresa, `merged_into_employee_id is null`)** → luego teléfono normalizado → luego nombre normalizado. El nombre nunca decide solo.

Resultado real contra la base hoy:

| Clasificación | Cantidad |
|---|---|
| MATCHED (1 empleado canónico) | **50 / 50** |
| AMBIGUOUS | 0 |
| NOT FOUND | 0 |

Nota: el importador actual (`import-payroll-extras`) empareja **por nombre normalizado**, no por ID. Ese es un riesgo real (`ALEJANDRA SANCHEZ` vs `Alejandra Sanchez`, homónimos, duplicados) y debe cambiarse a ID antes del test.

## 5. Mapeo exacto

| Sheet | Columna Excel | Tabla Stafly | Campo / concepto | Transformación | ¿Visible al worker? |
|---|---|---|---|---|---|
| PAYROLL | Employer identification | employees | employer_identification (solo matching) | exacto | Sí (ID interno) |
| PAYROLL | First / Last name | employees | first_name / last_name | solo verificación | Sí |
| PAYROLL | Corte | pay_periods | start_date / end_date | `07/22/2026 TO 07/28/2026` → periodo existente | Sí |
| PAYROLL | Total pay | period_base_pay | base_total_pay | tal cual, sin recalcular | Sí (Pago base) |
| PAYROLL | Payper Day | movements | Weekend Job | positivo | Sí |
| PAYROLL | Ryde | movements | Pago de Transporte Regular | positivo | Sí |
| PAYROLL | TIPS | movements | Propinas | positivo | Sí |
| PAYROLL | Reimbursements | movements | Reintegros | **parsear texto** ("52 DOLARES" → 52) | Sí |
| PAYROLL | Travel Hours | movements | Horas de viaje | positivo (es dinero, no horas) | Sí |
| PAYROLL | Otros | movements | Otros pagos | positivo | Sí |
| PAYROLL | Discount | movements | Descuentos | ya viene **negativo** en el Excel; conservar signo | Sí (monto, sin motivo) |
| PAYROLL | TOTAL | pay_statements | frozen_total | control obligatorio contra la suma | Sí |
| PAYROLL | Observaciones | movements | internal_note | nunca automática al worker | **No** |
| PAYROLL | Date | — | — | fecha de elaboración, no usar | No |
| PAYROLL | SSN/EIN, teléfono, email, direcciones, dispositivos, selfies, notas de manager | — | — | descartar en la lectura | **No** |
| All Employees | todo | — | — | no importar | No |
| SECRETARIA | TOTAL | — | control cruzado | comparar contra PAYROLL | No |

Todos los conceptos ya existen en el catálogo de Quality Staff; no hay que crear ninguno.

## 6. Validación del TOTAL

Regla del Excel: `TOTAL = Total pay + Payper Day + Ryde + TIPS + Reimbursements + Travel Hours + Otros + Discount` (Discount ya negativo).

Resultado de la verificación fila por fila (50 trabajadores):

- **48 filas cuadran exacto ($0.00 de diferencia).**
- **1 fila con texto**: ANDRES VARGAS, `Reimbursements = "52 DOLARES"`. Cuadra al parsear a 52.
- **1 override manual**: JOHNY MUNERA, componentes suman **$495.00** pero María fijó `TOTAL = $0.00` (obs.: "ADELANTO ZELLE PENDIENTE POR QUITAR 404 DOLARES"). El Excel manda: el statement debe congelar **$0.00**, no $495.00.

Suma de control: `TOTAL` = **$28,418.24** (fila de totales del propio Excel coincide).
Comparación contra el bridge: hoy el periodo `2026-07-22` existe y está **cerrado, pero vacío** (0 base pay, 0 movements, 0 statements). Si se cargara tal cual, `publish_pay_statement` calcularía la misma suma para 49 trabajadores y **diferiría en $495.00 en el caso Munera**, porque el RPC suma componentes y no acepta un total impuesto. Esa es la única brecha monetaria de todo el corte.

## 7. Preview de Payroll 142 (sin escribir)

| Métrica | Valor |
|---|---|
| Trabajadores | 50 |
| Total del corte | $28,418.24 |
| Base (Total pay) | $23,989.24 |
| MATCHED / AMBIGUOUS / NOT FOUND | 50 / 0 / 0 |
| Con Ride (Ryde) | 8 ($2,120.00) |
| Con Tips | 4 ($400.00) |
| Con Pay per Day | 4 ($2,800.00) |
| Con Descuentos | 4 (−$1,208.00) |
| Con Reimbursements | 3 (uno en texto) |
| Con Travel Hours | 41 ($780.00) |
| Con 2+ conceptos | 6 |
| Con TOTAL = 0 | 1 (Munera, override) |
| Con Observaciones internas | 6 |

### Casos representativos

| Caso | Excel aprobado | Statement propuesto |
|---|---|---|
| **Simple** — Alejandra Fonseca | Base 239.00 + Horas de viaje 15.00 = **254.00** | Base 239.00 · Horas de viaje 15.00 · frozen_total **254.00** ✅ |
| **Ride** — Carlos Alvarez | Base 1,037.50 + Ryde 320.00 = **1,357.50** | Base 1,037.50 · Transporte 320.00 · frozen_total **1,357.50** ✅ |
| **Pay per Day** — Alejandro Tzorin | Base 0.00 + Weekend Job 800.00 + Propinas 100.00 = **900.00** | Base 0.00 · Weekend Job 800.00 · Propinas 100.00 · frozen_total **900.00** ✅ |
| **Descuento** — Carlos Ortiz | Base 1,047.33 + Viaje 45.00 − 327.00 = **765.33** (obs. interna "NUEVO SALDO 99 DOLARES") | frozen_total **765.33**, descuento visible como monto, la observación queda interna ✅ |
| **Múltiples conceptos** — Andres Vargas | Base 691.00 + Viaje 30.00 + Reintegro "52 DOLARES" − 237.00 = **484.00** | Requiere parseo del texto; con parseo frozen_total **484.00** ✅ |
| **Override** — Johny Munera | Componentes 495.00, `TOTAL` forzado a **0.00** | El bridge congelaría 495.00 ❌ — **única divergencia del corte** |

## 8. Flujo semanal propuesto para María

1. **María cierra su Excel como siempre** (mismo archivo, mismas tres pestañas). No crea nada nuevo.
2. **Sube el archivo** en Payroll → periodo del corte → "Cargar cierre aprobado". Stafly lee **solo PAYROLL** e ignora las otras dos hojas (usa SECRETARIA únicamente para cruzar el total).
3. **Preview** en pantalla: trabajadores, total del corte, conceptos, y la tabla MATCHED / AMBIGUOUS / NOT FOUND. Nada se guarda todavía.
4. **Reconciliación de identidad**: los ambiguos o no encontrados se resuelven a mano eligiendo la ficha canónica. Nunca se crea un empleado desde el Excel.
5. **Validación**: por cada trabajador, componentes vs `TOTAL` del Excel. Cualquier diferencia (incluido $0.01) o total forzado bloquea esa fila y pide confirmación explícita.
6. **Revisión del admin** (María o Sebastián): confirma el corte; se escriben `period_base_pay` + `movements` aprobados, con `Observaciones` como nota interna.
7. **Freeze**: `publish_pay_statement` congela el total por trabajador.
8. **Publicación**: el trabajador ve en "Mis pagos" el periodo, el total y el desglose por concepto, sin notas internas ni datos sensibles.

## 9. Reutilización, no importador paralelo

`import-payroll-extras` ya hace el 70% del trabajo: mismas columnas, mismo mapa de conceptos (ya apuntando a los IDs reales de Quality Staff), signo negativo en descuentos, deduplicación por empleado+concepto y registro en `activity_log`. **Se extiende, no se duplica.** Destino sigue siendo `pay_periods` + `period_base_pay` + `movements` + `concepts` + `pay_statements`. Cero tablas nuevas de payroll.

Lo que le falta a ese importador para servir este flujo:
- Emparejar por `employer_identification` en vez de por nombre.
- Escribir también `period_base_pay` desde `Total pay` (hoy solo carga extras).
- Parsear importes en texto ("52 DOLARES").
- Devolver un **preview** sin escribir (hoy inserta directo).
- Reconciliar el `TOTAL` del Excel contra la suma de componentes y bloquear divergencias.
- Enviar `Observaciones` a `internal_note` (hoy va a `note`, que en el modelo nuevo es interno — correcto, pero conviene explicitarlo).

## 10. Respuestas

1. **¿Podemos subir el Excel completo?** Sí, el archivo entero tal como está. Stafly lee lo que necesita.
2. **¿Qué sheet lee Stafly?** `PAYROLL`.
3. **¿Cuáles ignora?** `All Employees` por completo; `SECRETARIA` solo como control cruzado del total.
4. **¿Cómo identifica al worker?** Por `Employer identification` contra `employees.employer_identification` de la empresa. Hoy: 50/50 exactos.
5. **¿Cómo preserva el TOTAL?** Se toma el `TOTAL` del Excel como cifra aprobada y se compara contra la suma de componentes; si coinciden, se congela. Sin tarifas de Stafly, sin turnos, sin marcaciones.
6. **¿Cómo maneja conceptos?** Cada columna es un movimiento con el concepto ya existente en el catálogo; descuentos en negativo.
7. **¿Cómo evita exponer SSN/notas?** Esas columnas ni se leen; `Observaciones` entra como nota interna y solo se publica lo que un admin reescriba explícitamente.
8. **¿Qué hace María?** Termina su Excel y lo sube. Nada más cambia en su trabajo.
9. **¿Qué hace el admin?** Revisa el preview, resuelve identidades dudosas, confirma y publica.
10. **¿Qué ve el worker?** Periodo, total congelado y desglose por concepto en "Mis pagos".
11. **¿Qué falta?** La capa de carga/preview/validación descrita en el punto 9, más una forma de honrar un `TOTAL` forzado por María (caso Munera) sin que el servidor lo recalcule. Ambas son extensiones, no piezas nuevas.
12. **¿Se puede probar sin afectar producción?** Sí. El periodo 2026-07-22 está vacío (0 base pay, 0 movements, 0 statements). Se puede cargar, validar y publicar 1–2 trabajadores de prueba y despublicar, sin tocar nada existente.

---

## Veredicto

🟡 **SMALL GAP BEFORE TEST**

El modelo, los conceptos, la identidad (50/50) y el bridge de congelado ya están listos. Faltan dos piezas acotadas, ambas sobre el importador existente: **preview/validación con matching por ID** y **respetar el total forzado por María**. Sin la segunda, un trabajador de este corte (Munera) recibiría $495.00 que la empresa decidió no pagar esta semana.
