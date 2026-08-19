# P0 — Payroll 142: bridge de importación controlada

Extensión de la infraestructura existente `import-payroll-extras`. **No se creó un importador nuevo.**
Archivo de referencia: `142_UNTITLED_REPORT_2026-07-22_2026-07-28.xlsx` · Corte 2026-07-22 → 2026-07-28 · Quality Staff.
Estado: cierre cargable y verificable. **No se publican recibos ni se envían notificaciones.**

---

## 1. Cambios

| Pieza | Cambio |
|---|---|
| `supabase/functions/_shared/payroll-money.ts` | **Nuevo.** Parser monetario explícito y auditable (`parseMoney`): números, `$1,037.50`, paréntesis contables, texto de moneda (`"52 DOLARES"`), vacíos. Cualquier otra cosa devuelve `ok:false` → revisión humana. |
| `supabase/functions/import-payroll-extras/index.ts` | Extendido con `mode: "preview" \| "import"`. El comportamiento legacy (extras por nombre) queda intacto cuando no se envía `mode`. Añade: autoridad de sheet, matching por `Employer identification`, escritura de `period_base_pay`, `approved_total_override`, control de gran total, notas internas. |
| `src/lib/payroll/payroll142-bridge.ts` | **Nuevo.** Extracción de filas crudas del sheet `PAYROLL` (sin parsear dinero ni decidir identidad) y clientes `previewExternalPayrollClose` / `importExternalPayrollClose`. |
| `src/components/payroll/ExternalPayrollCloseImport.tsx` | **Nuevo.** Preview obligatorio antes de importar, tabla fila por fila, KPIs, bloqueos, confirmación explícita de totales forzados. |
| `src/pages/admin/ImportPayrollExtras.tsx` | Integra el bridge en la pantalla existente. Ninguna ruta nueva. |
| DB | `period_base_pay`: `approved_total_override`, `approved_total_source`, `approved_total_note`. `publish_pay_statement` respeta el override y registra la diferencia contra el desglose en `activity_log`. |

Cero tablas nuevas de payroll. Motor nativo, `time_entries`, `scheduled_shifts`, `shift_assignments` y `employees` intactos.

## 2. Comportamiento del preview

Flujo: seleccionar periodo → subir archivo → **preview** → (opcional) confirmar totales forzados → importar.

El preview devuelve por trabajador: periodo, nombre, `Employer identification`, `employee_id` resuelto, estado de identidad, base (`Total pay`), cada componente con su valor crudo y parseado, suma de componentes, **TOTAL aprobado**, diferencia, advertencias y estado (`OK` / `REVIEW` / `BLOCKED`). A nivel corte: trabajadores, total aprobado, suma de componentes, diferencia global, conteo de identidades y lista de bloqueos.

Autoridad de sheet: solo `PAYROLL`. Si el archivo no la trae, se rechaza. `All Employees` no se lee. `SECRETARIA` se suma solo como **control informativo** y se muestra la diferencia; nunca define importes.

No existe camino de importación sin preview: el botón de importar solo aparece con un preview resuelto, y el servidor exige `expectedGrandTotal`.

## 3. Matching de identidad

Clave primaria: `employees.employer_identification` exacto, dentro de la empresa, `merged_into_employee_id is null`. Los IDs que Excel entrega como `1291.0` se normalizan a `1291`.

- 1 candidato → `MATCHED`.
- 2+ candidatos → `AMBIGUOUS` (bloquea).
- 0 candidatos → se intenta nombre **solo si la fila no trae ID**; nombre duplicado → `AMBIGUOUS`; sin coincidencia → `NOT_FOUND`.
- Un mismo `employee_id` en dos filas → `AMBIGUOUS`.
- **Nunca se crean empleados** desde el archivo.

Verificación contra la base hoy: **50 MATCHED / 0 AMBIGUOUS / 0 NOT FOUND**.

## 4. Parseo monetario

| Entrada | Resultado |
|---|---|
| `495` | 495.00 (`number`) |
| `"$1,037.50"` | 1037.50 (`number`) |
| `"52 DOLARES"` | 52.00 (`currency_text`, con advertencia visible) |
| `"(327.00)"` | −327.00 (`parenthesis_negative`) |
| `""`, `"-"`, `"$0.00"` | 0.00 (`empty`) |
| `"PENDIENTE"` | **BLOCK** — sin importe numérico |
| `"ADELANTO 404 DOLARES ZELLE"` | **BLOCK** — texto no reconocido junto al importe |

Los descuentos se fuerzan a negativo; el resto conserva el signo del archivo. Ninguna interpretación silenciosa: todo texto convertido aparece como advertencia en el preview.

## 5. Override del TOTAL aprobado

`TOTAL` de `PAYROLL` es la cifra final. Cuando `SUM(componentes) != TOTAL`:

- **No se recalcula** el total.
- **No se inventa** ningún movimiento de ajuste.
- Se guarda `period_base_pay.approved_total_override = TOTAL`, `approved_total_source = 'external_approved'` y una nota con la diferencia.
- `publish_pay_statement` congela ese valor y deja en bitácora `computed_total`, `approved_total_override` y `override_difference`.
- El import exige confirmación explícita (`acknowledgeOverrides`) cuando hay al menos un total forzado.

## 6. QA — Johny Munera

Componentes $495.00, `TOTAL` aprobado $0.00. Preview: estado `REVIEW`, diferencia −$495.00, advertencia explícita. Al importar se congelaría **$0.00**, con los movimientos del desglose presentes y la diferencia auditada. No se genera un movimiento de −$495.

## 7. QA — Keury Camilo

`PAYROLL` $2,510.00 vs `SECRETARIA` $0.00. El bridge toma **$2,510.00** (PAYROLL manda). La divergencia se muestra únicamente como control informativo del corte (total SECRETARIA $25,908.24 vs PAYROLL $28,418.24).

## 8. QA — Total general

Simulación completa del archivo real con la misma lógica del bridge:

```
workers 50 · grand approved 28,418.24 · component sum 28,965.24
overrides: ANDRES VARGAS (536.00 vs 484.00, −52.00), JOHNY MUNERA (495.00 vs 0.00, −495.00)
parse blocks: 0
```

**Total aprobado = $28,418.24**, coincide al centavo con la fila de totales del Excel. El import rechaza cualquier `expectedGrandTotal` que difiera ≥ $0.01.

Hallazgo adicional: el `TOTAL` de Andres Vargas ($484.00) **excluye** el reintegro escrito como texto, porque la fórmula `SUM` del Excel ignora celdas de texto. El bridge parsea el 52 para el desglose pero **congela el TOTAL aprobado por María** y marca la diferencia como override para revisión. Es decisión humana, no automática.

Casos cubiertos: A worker simple (Alejandra Fonseca) · B Ride (Carlos Alvarez) · C Pay per Day (Alejandro Tzorin) · D Tips · E Discount (Carlos Ortiz) · F "52 DOLARES" · G Johny Munera · H Keury.

## 9. Prueba de cero escrituras en preview

En `handleBridge`, la rama `mode === "preview"` retorna antes de cualquier `insert` / `upsert`; todas las consultas previas son `select`. No toca `pay_periods`, `period_base_pay`, `movements`, `pay_statements`, `employees`, `time_entries` ni `scheduled_shifts`, y tampoco escribe `activity_log`. La respuesta incluye `writes: 0`.

## 10. Preparación para el import

El import exige, en este orden: preview resuelto → 0 bloqueos → `expectedGrandTotal` coincidente al centavo → confirmación de totales forzados. Solo entonces escribe:

- `period_base_pay` (upsert por periodo+empleado) con base, override y nota de conciliación.
- `movements` aprobados, uno por concepto con valor distinto de cero, `source` operativo `external_approved`, deduplicados contra los movimientos ya existentes del periodo.
- `activity_log` con el resumen del corte.

Sin tarifas de Stafly, sin recálculo desde turnos ni marcaciones.

## 11. Notas y privacidad

`Observaciones` entra a `movements.note` (interno) con prefijo `[Cierre externo]`. `worker_visible_note` se escribe siempre `null`: nada del Excel llega al trabajador salvo que un admin lo reescriba. SSN/EIN, teléfono, email, direcciones, dispositivos, selfies y notas de manager **ni se leen**.

## 12. Riesgos abiertos

1. El periodo 2026-07-22 está **cerrado**; el bridge no cambia su estado. Habrá que decidir si se reabre para la prueba controlada.
2. Andres Vargas requiere decisión humana sobre los $52 (el Excel los excluyó del TOTAL).
3. La deduplicación de movimientos es por empleado+concepto: reimportar el mismo corte no duplica, pero tampoco corrige un valor cambiado; para eso hay que borrar el movimiento previo.
4. La publicación de recibos sigue pendiente y es un paso manual separado, posterior al QA de este import.

---

## Veredicto

🟢 **READY FOR CONTROLLED PAYROLL 142 IMPORT**

Preview sin escrituras, identidad 50/50 por ID, parser seguro y auditable, TOTAL aprobado preservado (incluido el caso Munera) y control de gran total al centavo contra $28,418.24. La publicación de pay statements queda explícitamente fuera de esta entrega.
