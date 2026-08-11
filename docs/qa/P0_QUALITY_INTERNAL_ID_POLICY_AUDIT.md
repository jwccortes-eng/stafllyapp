# P0 — Quality Staff · Política canónica del Internal ID (auditoría de sólo lectura)

Fecha: 2026-08-11 · Empresa: Quality Staff by Keury (`00000000-0000-0000-0000-000000000001`)
**Sin writes. Sin asignaciones. Sin migraciones.** Todo lo que sigue es evidencia observada en vivo.

Campo físico: `public.employees.employer_identification` (texto).
No es el UUID del employee, no es el `user_id` de auth, no es un código técnico de Stafly.
Es el **número interno de la empresa que procesa la nómina**, y debe ser estable de por vida.

---

## 1. ¿Cómo está implementada hoy la generación automática?

Un único trigger de base de datos:

```
trg_auto_employer_identification  BEFORE INSERT ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.auto_assign_employer_identification()
```

Lógica vigente (verificada contra `pg_proc`, no contra el archivo de migración):

1. Si el INSERT ya trae `employer_identification` no vacío → **respeta el valor** y sale.
2. Lee `company_settings.key = 'employee_number_config'` de esa empresa:
   `{ prefix, padding, start_number }`.
3. Calcula `MAX(employer_identification::int) + 1` **sobre todos los employees de esa empresa**
   (activos, inactivos, archivados y fusionados por igual), con piso en `start_number`.
4. Aplica prefijo y padding y escribe el valor.

Unicidad: índice parcial `idx_employees_company_employer_id`
sobre `(company_id, employer_identification)` donde el valor no es NULL ni ''.

Historial de la función:
- `20260405…` — versión original con piso **hard-coded 1200** (`COALESCE(MAX(...), 1199) + 1`).
- `20260410…` — versión actual, parametrizada por `company_settings`, + índice único.
- `20260521…` — `REVOKE EXECUTE` a `anon`/`authenticated` (sólo la ejecuta el trigger).

Configuración real de Quality Staff:
`{"prefix": "", "padding": 0, "start_number": 1200}` → números planos sin ceros ni prefijo.
(Otras dos empresas usan `start_number: 1, padding: 3`.)

## 2. ¿Existe una secuencia?

**No en el sentido de Postgres.** No hay `SEQUENCE` ni `nextval`.
Es una secuencia *derivada*: `MAX(int) + 1` calculada en cada INSERT.
Consecuencia: la numeración es correcta mientras nadie borre filas y nadie inserte en paralelo
(ver §6), y **no se reutilizan huecos** — los números de gente inactiva o fusionada siguen ocupados.

## 3. ¿Cuál fue el primer número generado automáticamente? (demostrado)

Distribución real por día de creación en Quality Staff (sólo IDs numéricos):

| Fecha creación | Filas | min | max |
|---|---|---|---|
| 2026-02-25 | 151 | 101 | 1118 |
| 2026-03-06 | 6 | 1046 | 1109 |
| 2026-03-13 | 2 | 136 | 1110 |
| 2026-03-19 | 10 | 113 | 1120 |
| **2026-04-20** | **6** | **1200** | **1205** |
| 2026-04-23 | 47 | 1206 | 1252 |
| 2026-04-24 | 4 | 1253 | 1256 |
| 2026-05-09 → 2026-08-10 | 46 | 1257 | 1304 |

Lectura:
- Febrero–marzo 2026 = **carga histórica** del Excel de la empresa de payroll.
  Rango disperso **101 … 1120**, sin orden temporal (los números no correlacionan con `created_at`),
  típico de datos importados.
- El máximo histórico previo al 20-abr era **1120**.
- A partir del **2026-04-20 19:07 UTC** los números pasan a ser **estrictamente correlativos
  con el instante de creación**, sin un solo hueco: 1200, 1201, 1202 … 1304.

**Primer número autogenerado: `1200`** (Julio Velasquez, `2026-04-20 19:07:20.657Z`).
No proviene del histórico: proviene del piso `1199 + 1` codificado en la primera versión del trigger
(15 días antes), y **saltó el rango 1121–1199**, que quedó libre y nunca se usó.

## 4. Último Internal ID asignado

**`1304`** — Jose Diaz, `2026-08-10 04:00:45Z`.

## 5. Siguiente número seguro

**`1305`.**

Con la configuración actual (`start_number: 1200`, sin prefijo, sin padding) el trigger produciría
exactamente `1305` en el próximo INSERT sin ID. No hay valor `1305` ocupado, ni en registros
activos, ni inactivos, ni fusionados.

Los huecos **1121–1199** existen pero **no deben rellenarse**: son un rango histórico muerto y
reciclarlos rompería la trazabilidad con la empresa de payroll.

## 6. ¿Existe riesgo de colisión?

| Riesgo | Severidad | Estado |
|---|---|---|
| Duplicados actuales en Quality Staff | — | **0** (verificado por `GROUP BY … HAVING count > 1`) |
| Índice único activo | — | Sí, `(company_id, employer_identification)` con NULL/'' excluidos |
| Carrera entre dos INSERT simultáneos | **Alto** | `MAX+1` sin bloqueo ni `advisory lock`: dos transacciones concurrentes calculan el mismo número. El índice único **impide el duplicado**, pero el segundo INSERT **falla con error 23505** en vez de reintentar |
| INSERT multi-fila en una sola sentencia | **Alto** | Las filas de la misma sentencia no son visibles al `MAX()` de las filas siguientes → todo el lote intenta el mismo número y aborta |
| Valor manual que pisa la secuencia | Medio | Un INSERT que trae un número alto arbitrario mueve el `MAX` y quema el rango intermedio |
| Reciclaje de números | Bajo | No ocurre: los merged e inactivos siguen contando (51 registros fusionados conservan su ID) |
| `999-99-9999` | Bajo | 1 registro no numérico ("Numeric Bookkeeping"). El trigger lo ignora al calcular `MAX` |

## 7. ¿Hay más de un mecanismo asignando Internal IDs?

Sí. **Tres caminos de escritura**, sólo uno de ellos gobernado:

1. **Trigger** `auto_assign_employer_identification` — el mecanismo oficial.
2. **`UnmatchedResolutionDialog.tsx`** (reconciliación de nómina):
   - al crear un empleado desde el archivo Truth, inserta `employer_identification` tomado del
     archivo (campo libre editable por el usuario);
   - al **vincular** un empleado existente, hace `UPDATE employees SET employer_identification = …`
     si el Truth trae un valor y el empleado no. Es una escritura directa, sin VWC, sin auditoría
     del cambio de ID y **sin verificar que el empleado no tuviera ya un ID histórico**.
3. **`PayrollTruthValidation.tsx`** y la edge function `import-inactive-employees` aceptan
   `employer_identification` en el payload de creación → el trigger lo respeta tal cual.

No hay ningún punto en la UI de Equipo/Perfil que permita editar el Internal ID a mano
(sólo se muestra, etiquetado inconsistentemente como "ID Stafly" en `Employees.tsx:2104`).

## 8. ¿Es único por tenant o global?

**Por tenant.** Tanto el `MAX()` del trigger como el índice único están acotados por `company_id`.
Convive sin conflicto con las otras empresas (que numeran desde 001 con padding 3).
No existe unicidad global y **no debe existir**: el número pertenece a la empresa de payroll.

## 9. ¿Qué ocurre al reactivar un employee sin Internal ID?

**Nada.** El trigger es `BEFORE INSERT` únicamente. Un `UPDATE is_active = true` no asigna nada:
la persona queda operando **sin Internal ID**, y ese vacío no bloquea asignación, fichaje ni nómina.

Estado real hoy en Quality Staff:

| Población | Registros |
|---|---|
| Total employees | 1.420 |
| Con Internal ID numérico | 274 |
| Con ID no numérico | 1 |
| **Sin Internal ID (NULL)** | **1.145** |
| — de ellos, inactivos | 1.137 |
| — de ellos, **activos** | **8** |

Los 1.145 sin ID se crearon en febrero (33) y marzo (1.112) de 2026, es decir **antes** de que el
trigger existiera (5-abr-2026). Ninguno pasó nunca por el generador. **Éste es el caso de Claudia.**

Verificado: `CLAUDIA GRISALES` (`f7a67586…`, activa) y `CLAUDIA CORTES` (`bd9211dd…`, inactiva),
ambas creadas el 2026-03-19, ambas con `employer_identification = NULL`.
No figuran en el histórico → **no hay número que preservar**; les corresponde uno nuevo.
**No se asignó ninguno en esta auditoría.**

## 10. ¿Qué ocurre cuando llega una importación antigua?

- Si la fila trae `employer_identification`, el trigger **lo respeta** — correcto para el histórico,
  peligroso si el número viene sucio: puede empujar el `MAX` y quemar rango.
- Si la fila **no** lo trae, el trigger asigna el siguiente correlativo — lo que convertiría a un
  trabajador histórico en un número nuevo si el importador no adjuntó su ID oficial.
- Si el número ya existe en la empresa, el índice único **rechaza la fila entera** (23505) sin
  mensaje de negocio: el import falla en vez de derivar a revisión humana.

---

# Política canónica propuesta (Internal ID de Quality Staff)

**P1 — Definición.** El Internal ID es el identificador de la empresa que procesa la nómina.
No es el UUID, no es el auth user id, no es un código de Stafly. La UI debe dejar de llamarlo
"ID Stafly" y llamarlo **Internal ID**.

**P2 — Inmutabilidad.** Una vez asignado, un Internal ID **nunca** cambia, nunca se regenera y
nunca se reasigna a otra persona. Ni al archivar, ni al reactivar, ni al fusionar.

**P3 — Prioridad del histórico.** Si la persona figura en el Excel histórico de la empresa de
payroll, su número de ese archivo es el único válido y se conserva literal.

**P4 — Rango histórico congelado.** `101 … 1199` es territorio exclusivo del histórico.
Los huecos internos (incluido **1121–1199**, jamás usado) **no se rellenan nunca**.

**P5 — Rango Stafly.** Todo número generado por Stafly vive en `≥ 1200`, correlativo, sin huecos,
sin reciclaje. El siguiente es `1305`.

**P6 — Criterio único de asignación.** La única pregunta es *"¿tiene Internal ID histórico?"*.
Sí → conservar. No → asignar el siguiente del rango Stafly. Da igual que esté archivado,
reactivado o sea antiguo.

**P7 — Los muertos ocupan sitio.** Registros inactivos, archivados y fusionados conservan su número
y siguen contando para el `MAX`. Un merge **no libera** el número del duplicado.

**P8 — Un solo escritor.** El Internal ID se asigna exclusivamente por el mecanismo canónico de base
de datos. Ninguna pantalla, import ni reconciliación puede escribirlo directamente; sólo puede
*proponer* un valor histórico, que se acepta si está libre y se deriva a revisión humana si choca.

**P9 — Por tenant.** Unicidad y numeración siempre acotadas a `company_id`.

**P10 — Auditable.** Toda asignación registra origen (`historical_excel` | `stafly_sequence` |
`manual_reviewed`), actor e instante. Todo intento de cambiar un ID ya asignado se rechaza y se
registra.

---

# Propuesta de implementación (no ejecutada)

**Bloque 1 — Blindar la secuencia (DB).**
- Reemplazar `MAX+1` por una `SEQUENCE` real por empresa, o mantener `MAX+1` dentro de un
  `pg_advisory_xact_lock(hashtext(company_id::text))` y con reintento ante 23505.
  Elimina las carreras de §6 y el fallo de INSERT multi-fila.
- Añadir columnas `internal_id_source` e `internal_id_assigned_at`.

**Bloque 2 — Inmutabilidad real.**
- Trigger `BEFORE UPDATE OF employer_identification`: si el valor anterior no es NULL y el nuevo
  difiere → `RAISE EXCEPTION 'INTERNAL_ID_IMMUTABLE'`. Excepción sólo vía RPC de corrección
  con rol admin, motivo obligatorio y registro en `versioned_write_audit`.

**Bloque 3 — Cierre de escritores paralelos.**
- Quitar el `UPDATE employer_identification` de `UnmatchedResolutionDialog.tsx` y el campo libre de
  creación desde Truth; sustituirlos por la RPC canónica `assign_internal_id(employee_id, proposed)`
  que aplica P3/P5/P8 y deriva colisiones a revisión.
- Sumar `employees.employer_identification` a las tablas críticas del test VWC para que cualquier
  `.update()` directo rompa la suite.

**Bloque 4 — Asignación en reactivación / alta operativa.**
- RPC idempotente que, al activar o al hacer asignable a una persona sin Internal ID, cotejo previo
  contra el histórico (por nombre normalizado + teléfono + SSN4) y: match → conservar histórico;
  sin match → siguiente del rango Stafly.

**Bloque 5 — Backfill controlado (fase aparte, con aprobación explícita).**
- 8 personas **activas** sin Internal ID: cotejo 1 a 1 contra el Excel histórico y asignación
  revisada persona por persona. Claudia Grisales entra aquí.
- 1.137 inactivos sin ID: **no tocar**. Reciben número sólo el día que se reactiven (Bloque 4).
- Normalizar el registro `999-99-9999`.

**Bloque 6 — Lenguaje y visibilidad.**
- Renombrar la etiqueta a "Internal ID" en Equipo, Perfil, exportes y reconciliación.
- Mostrar explícitamente "Sin Internal ID" en vez de ocultar el campo, para que el vacío sea
  visible en lugar de silencioso.

Orden sugerido: 1 → 2 → 3 → 4 → 6 → 5 (el backfill al final, ya sobre infraestructura blindada).
