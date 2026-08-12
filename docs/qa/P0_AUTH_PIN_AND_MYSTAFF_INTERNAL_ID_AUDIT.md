# P0 — PIN único por usuario de acceso + Internal ID de MyStaff

**Modo:** SOLO LECTURA. Sin resets de PIN, sin cambios de auth, empleados, nómina, fichajes ni Internal IDs.
**Fecha:** 2026-08-12 (UTC)
**Nota:** no se muestran PINs en claro ni hashes. Las comparaciones se hicieron por igualdad, no por valor.

---

# PARTE A — PIN como fuente única por usuario de acceso

## A.1 Mapa de identidad de los 5 administradores

| Persona | Usuario de acceso | Teléfono | Registros de empleado (empresa · activo · PIN) |
|---|---|---|---|
| Jorge Cortes | `e5495b59…` | 7187515197 | MyStaff (`340db246`, activo, con PIN) · Quality Staff (`482e78ca`, activo, con PIN) · **Parceros** (`cbd94ddb`, activo, con PIN, **sin usuario de acceso vinculado**) |
| Keury Camilo | `85000c53…` | 3473358615 | Quality Staff (`e6c121cb`, activo, con PIN) · MyStaff (`06a6b56e`, activo, **sin PIN**) · Parceros (`b2079488`, activo, con PIN, sin usuario vinculado) |
| María Sanabria | `96d4a770…` | 9296213479 | Quality Staff (`da9cbc9e`, activo, con PIN) · MyStaff (`067022cc`, activo, **sin PIN**) · Parceros (`a90673fb`, activo, con PIN, sin usuario vinculado) |
| Sebastián Villegas | `e4793c12…` | 6468585060 | MyStaff (`4df1c02f`, activo, con PIN) · Quality Staff (`3bccba54`, activo, con PIN) |
| Duván Gallego | `4338b336…` | 3472031873 | MyStaff (`cad09ca0`, activo, con PIN + hash) · Quality Staff (`4d603205`, **inactivo**, con PIN) · Parceros (`3f5f21d3`, activo, con PIN, sin usuario vinculado) |

## A.2 Divergencia de PIN (comparación por igualdad, sin exponer valores)

| Persona | PIN distintos entre registros vinculados al mismo usuario | PIN distintos contando Parceros |
|---|---|---|
| Jorge Cortes | **1** (MyStaff = Quality Staff) | **2** (Parceros difiere) |
| Keury Camilo | 1 (solo un registro tiene PIN) | 2 (Parceros difiere) |
| María Sanabria | 1 (solo un registro tiene PIN) | 2 (Parceros difiere) |
| Sebastián Villegas | **2** (MyStaff ≠ Quality Staff) | 2 |
| Duván Gallego | **2** (MyStaff ≠ Quality Staff) | **3** (Parceros difiere) |

Los "dos PIN conocidos" de Jorge (6163 / 9595) se explican por el registro de **Parceros**, que tiene su propio PIN y **no está vinculado** al usuario de acceso `e5495b59…`. No hay divergencia entre Quality Staff y MyStaff en su caso.

## A.3 Estado de bloqueo

| Teléfono | Intentos fallidos | Bloqueado hasta | Estado ahora (17:59 UTC) |
|---|---|---|---|
| 3472031873 (Duván) | 5 | 2026-08-12 17:52:33 UTC | **Expirado** — ya puede intentar |
| 6468585060 (Sebastián, registro `06468585060`) | 1 | — | Sin bloqueo |
| Resto | — | — | Sin registros de bloqueo |

## A.4 Respuestas exigidas antes de cualquier escritura

1. **¿Cuántos de los 5 tienen más de un PIN?** Dos dentro de su propio usuario de acceso: **Duván Gallego** y **Sebastián Villegas**. Si se cuentan los registros de Parceros no vinculados, cuatro personas tienen más de un PIN en el sistema (Jorge, Keury, María, Duván); Sebastián no tiene registro en Parceros.
2. **Usuario de acceso por persona.** Jorge `e5495b59…`, Keury `85000c53…`, María `96d4a770…`, Sebastián `e4793c12…`, Duván `4338b336…`. Cada persona tiene **un solo** usuario; no hay auth duplicado.
3. **Fuente canónica actual.** No existe: el PIN vive en `employees.access_pin` (+ `access_pin_hash` solo en el registro MyStaff de Duván), es decir **por empresa**, no por persona. El acceso por teléfono elige el primer registro **activo** cuyo PIN coincide, y si ninguno coincide valida contra el primer activo con PIN. Por eso el resultado depende de qué registro esté activo.
4. **Registros legacy retirables con seguridad.** Los PIN de los registros de **Parceros** sin usuario de acceso (`cbd94ddb`, `b2079488`, `a90673fb`, `3f5f21d3`) no sirven para el acceso administrativo y son la causa de los "PIN alternos"; pueden neutralizarse sin tocar auth ni membresías. El PIN del registro **inactivo** de Duván en Quality Staff (`4d603205`) tampoco participa en la resolución. Ningún registro debe borrarse.
5. **¿Pueden entrar hoy los 5?** Sí, todos tienen al menos un registro activo con PIN. Con la salvedad de que Duván y Sebastián deben usar el PIN del registro correcto (MyStaff activo), no el que recuerdan del otro tenant. Keury y María solo tienen PIN en el registro de Quality Staff: ese es el que resuelve.
6. **¿Quién está bloqueado?** Nadie en este momento. El bloqueo de Duván (15 min) expiró a las 17:52 UTC.

## A.5 Plan propuesto (no ejecutado) — un PIN por usuario de acceso

1. **Modelo:** el PIN pasa a ser propiedad de la persona (usuario de acceso), no del registro por empresa. Tabla dedicada `auth_access_pins` (una fila por `user_id`: hash, versión, `pin_set_at`, `must_change_pin`, bloqueo) y `employees.access_pin*` queda como espejo de solo lectura hasta retirarse.
2. **Resolución de acceso:** teléfono → usuario de acceso → PIN único → lista de membresías por empresa. Se elimina la dependencia de `is_active` del registro por tenant para decidir *qué PIN* se valida (sigue usándose para decidir a qué empresas entra).
3. **Migración por persona:** elegir el PIN del registro **activo y usado más recientemente** como canónico, escribirlo una sola vez en la tabla nueva y neutralizar los PIN de los demás registros de esa persona. Sin recrear usuarios, sin tocar membresías, roles, nómina ni fichajes.
4. **Casos de los 5:** Jorge, Keury y María migran sin ambigüedad. Duván y Sebastián requieren **decisión humana** sobre cuál de sus dos PIN queda como canónico (o reset acordado con la persona).
5. **Preflight obligatorio antes de escribir:** confirmar un solo usuario por teléfono, ausencia de bloqueo activo, y respaldo de los valores actuales en el registro de auditoría.

---

# PARTE B — Política real de Internal ID de MyStaff

## B.1 Estado en el sistema (hoy)

| Métrica | Valor |
|---|---|
| Registros de empleado en MyStaff | 205 (67 activos, 138 inactivos) |
| Con Internal ID en el sistema | **9** |
| Activos sin Internal ID | 58 |
| Contador `company_internal_id_counters` | **No existe fila para MyStaff** (solo Quality Staff, `last_number = 1311`) |
| Asignaciones auditadas | 7, todas de Quality Staff |
| Colisiones de Internal ID | **0** en toda la base |

Internal IDs presentes en MyStaff: `001` Jorge Cortes, `002` Jesús Alcívar, `003` Keury Camilo, `004` María Sanabria, `005` Maikel Arrieta, `006` Orly Loor, `007` Pedro Gómez, `008` Tomás Vergara, `009` artefacto de QA (`pending_identity`).

## B.2 Hallazgo principal

**La numeración histórica de MyStaff (1001, 1003, 1004, 1010, 1200–1203, 9999, 99999999) no está en el sistema.** Lo que hay son 9 identificadores cortos `001`–`009` creados el 2026-04-28 en el alta de la empresa, que **chocan conceptualmente** con la serie histórica: Jorge es `001` aquí y `1001` en el histórico; Keury `003` vs `1010`; María `004` vs `9999`.

Los exports históricos citados (66 activos / 161 inactivos) **no llegaron adjuntos a esta solicitud**, por lo que las respuestas sobre rango exacto, último ID válido y huecos se basan en los ejemplos indicados y quedan pendientes de confirmación con los archivos.

## B.3 Respuestas

1. **Rango histórico real:** serie administrativa/fundacional en 1001–1010 y serie operativa en 1200+. No confirmable al detalle sin los exports.
2. **Primer ID de la serie nueva:** **1200** según los ejemplos entregados.
3. **Piso/rango reservado:** sí de facto — 1001–1010 corresponde a fundadores/administración y no forma parte de la corrida operativa. Recomendado formalizarlo como reservado.
4. **Qué representa 9999:** valor centinela administrativo, no un número de secuencia (María Sanabria). En Quality Staff existe el equivalente `999` para la misma persona. Debe tratarse como placeholder reservado, nunca como último asignado.
5. **Qué representa 99999999:** relleno de importación para registros sin identificador real. No es un Internal ID válido; no debe ocupar secuencia ni reciclarse.
6. **Último Internal ID válido asignado:** el mayor de la serie operativa observada es **1203**; queda por confirmar contra los exports completos (activos + inactivos), excluyendo 9999 y 99999999.
7. **Siguiente ID seguro:** **1204**, condicionado a la verificación del máximo real en ambos exports. Nunca derivarlo de 9999 ni de 99999999.
8. **Huecos:** sí, y son normales — la serie 1001…1010 es discontinua y hay registros históricos sin ID (9 activos y ~104 inactivos según los conteos entregados). Los huecos **no se rellenan**.
9. **Colisiones activos/inactivos:** ninguna en el sistema; ninguna dentro de cada export según el conteo preliminar. Falta la verificación cruzada activos↔inactivos con los archivos completos.
10. **Registros fusionados:** MyStaff no tiene registros fusionados con Internal ID; en Quality Staff los fusionados conservan su número y siguen ocupados. Misma regla debe aplicar aquí.

## B.4 Política propuesta para MyStaff (no implementada)

- Contador propio por empresa en `company_internal_id_counters`, **independiente de Quality Staff**, inicializado en el máximo real de la serie operativa (previsiblemente 1203 → siguiente 1204).
- Rango 0001–0999 y 9999 / 99999999: **reservados**, nunca emitidos por el contador.
- Inmutabilidad total, sin reciclaje, conservado por registros inactivos y fusionados, independiente del UUID del empleado y del usuario de acceso.
- Escritor único: las RPC `assign_internal_id` / `correct_internal_id` con bloqueo por transacción, igual que Quality Staff.
- Backfill histórico previo a cualquier emisión nueva: importar los IDs de los exports sobre los registros correspondientes, sin sobrescribir ninguno existente.

---

# Cierre

1. **Acceso de los 5 admins:** todos pueden entrar hoy; nadie bloqueado (el bloqueo de Duván expiró).
2. **PIN duplicado:** Duván y Sebastián tienen dos PIN dentro de su propio usuario; Jorge, Keury y María tienen un PIN alterno en el registro de Parceros no vinculado.
3. **Plan de PIN único:** PIN por usuario de acceso en tabla dedicada, elección del PIN canónico por registro activo más reciente, neutralización del resto, sin tocar auth ni membresías.
4. **Internal ID de MyStaff:** política propia, serie administrativa 1001–1010, operativa desde 1200, con 9999 y 99999999 como centinelas reservados; hoy el sistema solo tiene 001–009, desalineados del histórico.
5. **Próximo Internal ID seguro de MyStaff:** **1204**, sujeto a verificación con los exports completos.
6. **Decisiones humanas requeridas:** (a) qué PIN queda canónico para Duván y Sebastián; (b) qué hacer con los IDs 001–009 frente a la serie histórica 1001+; (c) entrega de los dos exports de MyStaff para cerrar rango, huecos y máximo real; (d) destino del registro inactivo de Duván en Quality Staff.
