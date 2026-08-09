# P0 REOPEN — Recurrencia de QK-001592

## Veredicto

El incidente queda reproducido y explicado. **QK-001592 no perdió tres filas
después de crearlas:** la intención de recurrencia se perdió antes de entrar al
camino de persistencia de series. Por eso sólo se insertó la fecha origen y esa
fila quedó sin referencia de serie.

No se modificó el Servicio histórico, payroll, asistencia ni VWC.

## Evidencia real

Consulta de `scheduled_shifts` para QK-001592:

| QK | Fecha | Horario | Estado | Referencia de serie |
|---|---|---|---|---|
| QK-001592 | 2026-08-10 | 16:00–21:00 | Publicado | `NULL` |

Datos adicionales observados:

- UUID: `e89a2507-52f8-4325-8537-079a025e7166`.
- Compañía: Quality Staff by Keury.
- Creado: 2026-08-09 16:39:06 UTC.
- Seis asignaciones visibles en el calendario.
- No existen otras ocurrencias enlazadas mediante `series:<intentId>:<fecha>`.

La captura autenticada de `/app/shifts` muestra una sola tarjeta QK-001592 en
lunes 10 de agosto. La primera captura en modo global no era evidencia válida;
se repitió la comprobación con la compañía correcta seleccionada.

## Dónde se perdió la serie

La recurrencia estaba representada únicamente por estado mutable del formulario.
Dos límites degradaban el submit antes de persistirlo:

1. El snapshot de recuperación local no incluía `repeatConfig`. Restaurar una
   sesión podía conservar fecha, horario y equipo, pero devolver la recurrencia
   a su valor inicial.
2. La creación calculaba las fechas desde el estado React después de atravesar
   diálogos de confirmación. Ese estado podía cambiar o restaurarse antes de que
   comenzara el bucle.

La prueba concluyente es `reconciliation_hash = NULL`: si QK-001592 hubiera
entrado a `createServiceSeries` con cuatro fechas, la ocurrencia origen habría
recibido una referencia `series:<intentId>:2026-08-10`. No la recibió.

## Corrección estructural

- `repeatConfig` forma parte de `createFormSnapshot` y se restaura con valores
  validados.
- `freezeRecurrenceSubmit` toma una foto inmutable al pulsar Guardar/Publicar:
  configuración, fecha base y plan completo de ocurrencias.
- Los diálogos consumen `pendingRecurrenceSubmitRef`; ya no vuelven a leer la
  recurrencia mutable.
- `createServiceSeries` recibe exclusivamente ese snapshot y recorre sus
  ocurrencias.
- `seriesSubmitLockRef` impide reentrada síncrona por doble tap.
- Cada ocurrencia usa `series:<intentId>:<fecha>` como clave propia.
- La base de datos tiene un índice único parcial sobre
  `(company_id, reconciliation_hash)` para Servicios activos. Dos solicitudes
  concurrentes de la misma ocurrencia no pueden producir dos filas.
- La copia de equipo sigue siendo compensatoria: un fallo de asignación no
  elimina el Servicio ni aborta las fechas restantes.

## Garantías de identidad

Cada ocurrencia es un `INSERT` independiente en `scheduled_shifts`, por lo que
recibe:

- UUID propio;
- QK propio mediante la secuencia existente por compañía;
- fecha propia;
- referencia de serie común por `intentId`, con sufijo de fecha único.

QK también está protegido por su restricción única existente; la referencia de
recurrencia no sustituye el identificador operativo visible.

## Regresión exacta

`src/test/recurring-service-creation.test.ts` incluye el payload observado:

- fecha base 2026-08-10;
- 16:00–21:00;
- publicado;
- seis plazas y seis workers;
- modo `next_n`, tres repeticiones.

El snapshot produce exactamente:

1. 2026-08-10
2. 2026-08-11
3. 2026-08-12
4. 2026-08-13

Las cuatro referencias son distintas. Resultado ejecutado: **10/10 tests en
verde**.

## Alcance y límite

La corrección cubre el formulario completo desktop, tanto Guardar borrador como
Publicar. Quick Create y el wizard móvil siguen creando un único Servicio por
diseño y no presentan controles de recurrencia. Editar, duplicar y copiar semana
son operaciones distintas y no se presentan como creación de una serie.

No se hizo backfill de QK-001592: inventar tres Servicios históricos después del
incidente alteraría la realidad operativa. Si se necesitan, deben crearse como
una nueva intención explícita del operador.