# P0 FINAL — Recurrencia real de Servicios · Caso maestro QK-001592

Fecha de cierre: 2026-08-09 · Empresa: Quality Staff by Keury (`00000000-…-0001`)
Alcance tocado: creación de series de Servicios. No se tocó payroll, Connecteam CSV, ELDM, auth/RLS ni tenants.

---

## 1. Caso real QK-001592 — reconstrucción

Fila histórica (leída de base de datos, sin alterar):

| campo | valor |
|---|---|
| shift_ref | QK-001592 |
| id | e89a2507-52f8-4325-8537-079a025e7166 |
| date | 2026-08-10 (lunes) |
| horario | 16:00–21:00 |
| slots | 6 |
| estado | published / published |
| cliente | Elum Franklhall |
| asignaciones | 6 |
| **reconciliation_hash** | **NULL** |

- Días seleccionados por el operador: lunes, martes, miércoles, jueves.
- Occurrence generation esperada: 2026-08-10, 11, 12, 13.
- Idempotency key esperada por ocurrencia: `series:<intentId>:<fecha>`.
- Helper llamado realmente: el insert individual, **una sola vez**.
- Writes intentados: 1. Writes persistidos: 1. QK asignados: 1 (QK-001592).

El `reconciliation_hash = NULL` es la prueba directa: la fila nunca pasó por el
camino de serie. No es una hipótesis, es el estado real de la fila.

## 2. Causa raíz

La intención de recurrencia vivía únicamente en estado mutable de React
(`repeatConfig` + `date`) y se leía **después** de las transiciones de diálogo
(confirmación de publicación / recuperación de sesión local). Esas transiciones
devolvían el formulario a una sola fecha, así que el bucle de creación recorría
un plan de 1 ocurrencia. Además, el autosave local no incluía `repeatConfig`, de
modo que cualquier recuperación degradaba la serie de forma silenciosa.

Fix aplicado exactamente en ese punto: una **foto inmutable del submit**
(`freezeRecurrenceSubmit` en `src/lib/shifts/recurrence.ts`) capturada al pulsar
Guardar/Publicar, que ya contiene el plan completo de ocurrencias con sus claves
de idempotencia. El bucle de creación consume esa foto, no el estado vivo.
No se parcheó la UI para simular recurrencia.

## 3. Camino canónico único

- `handleSaveDraft` (borrador) y `handleCreate` (publicar) llaman al mismo
  `createServiceSeries(submit)`, que a su vez usa el mismo `createSingleShift`
  para la ocurrencia origen y para las repeticiones.
- Desktop y mobile comparten ese editor y por tanto ese camino.
- El popover de creación rápida no expone recurrencia: crea siempre una única
  ocurrencia sin intención de serie, por lo que no puede degradar una serie.

## 4. Idempotencia

- Intención estable por submit (`intentId`), identidad propia por ocurrencia
  (`series:<intentId>:<fecha>`).
- Índice único parcial `scheduled_shifts_company_reconciliation_hash_uniq`
  garantiza la unicidad en base de datos; si la carrera ocurre, el código
  reutiliza la fila en lugar de duplicarla.
- Lock de reentrada (`seriesSubmitLockRef`) para el doble tap.
- Las ocurrencias 2, 3 y 4 nunca se interpretan como replay de la 1 porque la
  fecha forma parte de la clave.

## 5. Workers

`createServiceSeries` crea los Servicios primero; el copiado de equipo ocurre por
ocurrencia y un `assignError` se reporta pero **no borra ni aborta** la serie.
El resumen distingue `workerFailures` de `failed`.

## 6/7/8. Prueba operativa real (UI autenticada, no unit test)

Serie A — Meseros, base lunes 2026-08-10, repetición L-M-X-J hasta 2026-08-13,
guardada con "Guardar borrador":

```
 shift_ref |    date    | publication_status |             reconciliation_hash
 QK-001593 | 2026-08-10 | draft              | series:f6bca8b1-…-c724b7fabf37:2026-08-10
 QK-001594 | 2026-08-11 | draft              | series:f6bca8b1-…-c724b7fabf37:2026-08-11
 QK-001595 | 2026-08-12 | draft              | series:f6bca8b1-…-c724b7fabf37:2026-08-12
 QK-001596 | 2026-08-13 | draft              | series:f6bca8b1-…-c724b7fabf37:2026-08-13
```

| Check | Resultado |
|---|---|
| A. Inmediatamente tras guardar, sin refresh | 4 Servicios; toast "4 Servicios de la serie creados"; QK-001593/94 visibles en la semana 5–11 |
| B. Refresh | siguen 4 |
| C. Nueva sesión de navegador | siguen 4 |
| D. Vista semana | 5–11 ago muestra QK-001593/94; 12–18 ago muestra QK-001595/96 |
| E. Vista mes | los 4 QK visibles |
| F. QK distinto por ocurrencia | sí (1593, 1594, 1595, 1596), consecutivo real |
| G. Misma series reference | sí, `intentId` f6bca8b1-… compartido |
| H. Duplicados | cero |

Evidencia visual: `/tmp/browser/p0-rec/shots/6_saved.png` (sin refresh),
`7_week2.png`, `8_month.png`, `9_doubletap.png`.

Serie B — doble tap sobre "Guardar borrador" (base 2026-08-17, L-M-X-J):

```
 QK-001597 | 2026-08-17 | series:3af8680f-…:2026-08-17
 QK-001598 | 2026-08-18 | series:3af8680f-…:2026-08-18
 QK-001599 | 2026-08-19 | series:3af8680f-…:2026-08-19
 QK-001600 | 2026-08-20 | series:3af8680f-…:2026-08-20
```

4 Servicios, no 8. El segundo tap fue ignorado por el lock de submit.

## 9. Regresión permanente

`src/test/fixtures/qk-001592.ts` — payload real completo de QK-001592
(fila histórica + intención L-M-X-J + 6 workers), usado por el bloque
"QK-001592 — caso maestro de recurrencia real" en
`src/test/recurring-service-creation.test.ts`. Cubre: fila histórica sin serie,
4 ocurrencias, identidad propia + serie compartida, doble tap, independencia del
staffing y supervivencia de la intención congelada.

Resultado: **16/16 tests en verde**.

## 10. Criterio de cierre

Cerrado con evidencia autenticada en la aplicación real: 1 Servicio recurrente →
4 ocurrencias reales → 4 QK → refresh → siguen 4 → nueva sesión → siguen 4.

QK-001592 fue reproducido como caso maestro y el mismo flujo real ahora crea,
persiste y conserva todas las ocurrencias de una serie con QK independientes,
sin depender del staffing ni duplicarse por retry.
