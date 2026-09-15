# P0.4 — PERIOD 147 PUBLICATION TRACE + PERIOD 148 CONTROLLED IMPORT PILOT

**Fecha:** 2026-09-15 · **Compañía:** Quality Staff by Keury (`00000000-0000-0000-0000-000000000001`)
**Objetivo A:** READ-ONLY · **Objetivo B:** preview seguro, **sin importación ejecutada** (no se aportó archivo)
**Publicaciones nuevas:** 0 · **Notificaciones enviadas:** 0 · **Escrituras en nómina:** 0

---

## RESPUESTA DIRECTA

Las dos publicaciones del período 147 **no son un accidente del sistema ni un flujo automático**:
las hizo **una persona, a mano, una por una**, desde la pantalla de detalle del empleado, con
55 segundos de diferencia, sobre **su propio recibo y el de un familiar homónimo** (Jorge Cortes
y Alejandro Cortes). Clasificación: **MANUAL_ADMIN_ACTION** (patrón de prueba de operador).
Ambos importes coinciden **al centavo** con el dato canónico del período. **Ningún trabajador
recibió notificación** — el sistema no genera ninguna al publicar.

El período 148 sigue vacío y **no se pudo importar**: no se aportó archivo en esta fase. Lo que sí
quedó listo es el camino: el resumen vacío ahora explica qué falta y lleva directo al importador
canónico con el período ya preseleccionado.

---

## 1. PERIOD 147 — TWO PUBLISHED STATEMENTS

| Campo | Recibo A | Recibo B |
|---|---|---|
| statement_id | `e2a7ddcb-9245-4611-8d62-9fe1bac59f8d` | `d7b13742-5323-43d2-8529-d26c62e0c597` |
| period_id | `60bceb71-6165-42a0-b3e7-a2a5d16028d9` (147, Ago 26–Sep 1) | idem |
| source | `external_approved` | `external_approved` |
| status | `published` | `published` |
| created_at == approved_at == published_at | 2026-09-15 02:11:03.005 UTC | 2026-09-15 02:11:14.769 UTC |
| revoked_at | `null` | `null` |

## 2. WORKERS

| | Recibo A | Recibo B |
|---|---|---|
| worker_id | `72dfc8f8-b1f8-4b93-959f-c895bc3ba593` | `482e78ca-d42b-4e12-86f5-6963c3012e61` |
| nombre | Alejandro Cortes | Jorge Cortes |
| employer_identification | 1303 | 101 |
| user_id del trabajador | `6fcc03be-a313-4d0a-8b72-e58687dbf4db` | `e5495b59-8b80-471d-bd64-eec9ea7b1ccb` |

## 3. AMOUNTS — verificación contra el dato canónico

| Concepto | Alejandro Cortes | Jorge Cortes |
|---|---|---|
| `frozen_base_total` | 176.00 | 762.00 |
| `frozen_extras_total` | 0.00 | 1,510.00 |
| `frozen_deductions_total` | 0.00 | 0.00 |
| `line_count` | 0 | 3 |
| **`frozen_total`** | **176.00** | **2,272.00** |
| `period_base_pay.base_total_pay` | 176.00 | 762.00 |
| `period_base_pay.approved_total_override` | 176.00 | 2,272.00 |
| Movimientos aprobados ligados | — | Reintegros 290.00 · Weekend Job 900.00 · Transporte 320.00 = **1,510.00** |
| **¿Coincide con el período canónico?** | ✅ exacto | ✅ exacto (762.00 + 1,510.00 = 2,272.00) |

Total publicado: **$2,448.00** de $35,843.44 (6.8% del período, 2 de 60 personas).
Los 3 movimientos de Jorge Cortes tienen `pay_statement_id` apuntando al recibo B — quedaron
correctamente congelados y enlazados.

## 4. PUBLICATION ACTOR

Ambas publicaciones: `published_by` = **`2bf0401f-7c8a-4017-b3bd-033935e34860`**.

Ese `user_id` está vinculado en `employees` a dos registros internos: `Jorge QA Tester`
(`a0a0a0a0-0000-0000-0000-000000000001`) y `EIC Already Linked` (`74a1ef39-…`). Es decir, **la
cuenta administradora de QA del operador**, no una cuenta de servicio ni un job automático.
Nota: el actor (`2bf0401f`) **no** es el mismo `user_id` que el trabajador Jorge Cortes
(`e5495b59`); un administrador publicó el recibo de ese trabajador.

`activity_log` confirma la autoría: eventos `pay_statement_published`
`aa298600-ba71-4d5e-b530-5c337d7fd707` y `ab9d97c0-4a17-4faf-996c-799966d0cbdf`, ambos con el
mismo `user_id`.

## 5. PUBLICATION PATH

Ruta única de publicación en el código: `PayStatementPublishCard.tsx` → RPC server-side
`publish_pay_statement` (congela el total en el servidor). Ese componente se renderiza **sólo**
en `src/pages/admin/EmployeePeriodDetail.tsx`, es decir **una persona a la vez**.

Secuencia reconstruida desde `activity_log` (mismo actor, misma sesión):

```
02:09:55  page_view   /app/summary/detail
02:10:14  page_view   /app/summary
02:10:58  page_view   /app/summary/detail?employeeId=72dfc8f8…&periodId=60bceb71…
02:11:03  pay_statement_published   Alejandro Cortes   $176.00
02:11:13  record_view employee_period
02:11:14  pay_statement_published   Jorge Cortes       $2,272.00
02:12:22  page_view   /app/summary/detail?employeeId=482e78ca…   (revisión posterior)
```

El panel `BulkPublishPanel` (publicación masiva) **no** se usó: no hay evento de bulk, y las dos
publicaciones tienen marcas de tiempo distintas separadas por 11 segundos, con navegación humana
entre ellas.

## 6. WORKER VIEW STATUS

**No determinable — el sistema no registra la apertura de recibos.** La lectura del trabajador
pasa por los RPC `worker_pay_statements` / `worker_pay_statement_detail`, que no escriben
telemetría. `profile_access_log` no tiene filas en esa ventana. No se puede afirmar ni negar que
alguno de los dos haya abierto su recibo.

## 7. NOTIFICATION STATUS

**Cero notificaciones.** `notifications` no tiene ninguna fila creada desde 2026-09-14. El RPC de
publicación no dispara correo, push ni mensaje interno: el recibo simplemente pasa a ser visible
en el portal del trabajador. Ninguna persona fue avisada activamente.

## 8. ROOT CAUSE OF PARTIAL PUBLICATION

**Clasificación: `MANUAL_ADMIN_ACTION`.**

Evidencia que la sostiene (no inferencia):

1. Ruta de publicación individual (`EmployeePeriodDetail` → RPC), no masiva.
2. Dos eventos separados con navegación humana intercalada.
3. Mismo actor administrador de QA en ambos.
4. Ambos trabajadores apellido Cortes — el propio operador y un homónimo cercano: patrón clásico
   de prueba sobre registros propios.
5. Ocurrió **4 minutos después** de la importación del archivo 147 (02:07:18), coherente con una
   verificación inmediata de que el recibo se veía bien.

Por qué sólo 2 de 60: porque nunca hubo intención de publicar el período completo. No hay
publicación fallida, ni parcial por error, ni interrupción de un proceso masivo. Los otros 58
recibos simplemente no se crearon.

Descartadas con evidencia: `AUTOMATED_FLOW` (ningún cron/edge function publica),
`ACCIDENTAL_OR_UNKNOWN` (autoría, ruta y secuencia están trazadas),
`CONTROLLED_PILOT` (no existe registro de un piloto autorizado con esos dos trabajadores).

**No se revocó, modificó ni republicó nada.** Decisión humana pendiente: mantener esos 2 recibos
como parte del cierre real del 147, o revocarlos antes de publicar el período completo.

## 9. PERIOD 148 — PREVIEW VALIDATION

Estado canónico verificado (read-only):

| Campo | Valor |
|---|---|
| period_id | `b17caedc-c2c7-4a53-85e9-e429162da34f` |
| rango | 2026-09-02 → 2026-09-08 |
| status | `open` ✅ (no bloquea) |
| recibos publicados | 0 ✅ (no bloquea) |
| `period_base_pay` / `movements` / `time_entries` | 0 / 0 / 0 |

**La vista previa no se ejecutó: no se aportó archivo de la semana Sep 2–8.** Sin archivo no hay
período detectado, filas, trabajadores no emparejados, duplicados ni total fuente que reportar.

Guardrails vigentes que se aplicarán cuando se suba el archivo (`import-period-guard.ts`, servidor
y cliente):

- rango del archivo ≠ Sep 2 – Sep 8 → **BLOQUEO**, sin escrituras;
- período cerrado/pagado/bloqueado → **BLOQUEO** (hoy 148 está `open`, no aplica);
- período con recibos publicados → **BLOQUEO** (hoy 0, no aplica);
- no emparejados y duplicados → se listan uno por uno en la vista previa, **sin auto-resolución**;
- la vista previa es **zero-write** por diseño (no inserta, no actualiza, no publica).

La vista previa muestra antes de confirmar: compañía, período seleccionado con su estado, período
detectado en el archivo, filas detectadas/válidas/inválidas, no emparejados, candidatos duplicados,
total aprobado del archivo, destino de escritura (`period_base_pay` + `movements`) y recibos
publicados. La confirmación se etiqueta con período, filas e importe.

## 10. PERIOD 148 — IMPORT RESULT

**No ejecutada.** Cero filas escritas, cero movimientos, cero recibos. El período 148 permanece
exactamente como estaba.

## 11. RECONCILIATION RESULT

```
SOURCE TOTAL              =  n/d  (archivo Sep 2–8 no aportado)
STAFLY COMPARABLE TOTAL   =  $0.00
DIFFERENCE                =  n/d
```

Definición comparable usada (idéntica a la validada en el período 147):
`base_total_pay + extras aprobados − deducciones aprobadas = approved_total_override`.
Control 147: 60 personas, $30,594.44 + $5,706.00 − $457.00 = **$35,843.44**, diferencia **$0.00**,
**0 de 60** trabajadores con desvío.

## 12. EMPTY STATE UX

Cambio de presentación en `src/pages/admin/PeriodSummary.tsx` (banner y tabla) y en
`src/components/payroll/ExternalPayrollCloseImport.tsx`:

- Título: **"Este período todavía no tiene datos cargados."**
- Subtexto dinámico con las fechas reales del período seleccionado:
  *"Importa el archivo correspondiente a 2026-09-02 – 2026-09-08 para comenzar la revisión."*
- CTA: **"Importar datos del período"** → `/app/import-extras?periodId=<period_id>`.
- El importador canónico existente ahora lee `periodId` de la URL y llega con el período ya
  seleccionado. **No se creó ningún importador nuevo.**
- Se mantiene la regla de no mostrar totales en cero como si la nómina estuviera lista.

## 13. ZERO-WRITE / NO-PUBLISH CONFIRMATION

- Escrituras en base de datos en esta fase: **0** (toda la traza fue `SELECT`).
- Recibos publicados: **0 nuevos**. Los 2 del 147 quedaron intactos: mismos importes, mismas
  marcas de tiempo, sin revocación.
- Notificaciones enviadas: **0**.
- Período 148: no importado, no publicado, `status` sin cambios.
- Cambios de código: sólo presentación y navegación (estado vacío + preselección de período).
  Sin tocar fórmulas, `time_entries`, tarifas, ajustes aprobados, `period_base_pay`, `movements`,
  recibos publicados, `scheduled_shifts`, `shift_assignments`, período 142, auth, RLS, pagos,
  reservas, chat, documentos, tenants, billing ni entitlements.
- Pruebas: **1,288 verdes**. Typecheck OK.

## 14. REMAINING RISKS

1. **Decisión humana abierta:** 2 recibos del 147 publicados y visibles ($2,448.00). Publicar los
   58 restantes dejaría un período mixto; revocarlos exige motivo y queda auditado. Sin decisión.
2. **Sin telemetría de lectura de recibos:** no se puede saber si un trabajador ya vio un recibo
   antes de revocarlo. Riesgo real al revocar.
3. **Publicación individual sin fricción:** la pantalla de detalle permite publicar un recibo real
   con un clic, sin confirmación de alcance ni distinción entre prueba y cierre. Esto es
   exactamente lo que produjo la publicación parcial.
4. **Sin identificador de lote de importación:** el cierre externo sólo deja una línea en
   `activity_log`; no escribe en `imports` ni `payroll_import_batches`. Una importación no puede
   revertirse como unidad.
5. **Vista previa descartada no deja rastro:** un intento fallido de importar el 148 es invisible
   para la auditoría.
6. **Pantallas rotas detectadas (fuera de alcance, no tocadas):** `WeeklyPayrollReconciliation.tsx`,
   `StagedReconciliation.tsx` y `DevCommandCenter.tsx` consultan `pay_periods.n`, columna
   inexistente (la canónica es `sequence_number`).

---

## FINAL VERDICT

🟡 PERIOD 147 PUBLICATION NEEDS HUMAN DECISION — PERIOD 148 SAFE
