# P0 — Auditoría forense del turno real QK-001592

**Estado:** SOLO LECTURA. No se modificó ningún dato, ningún registro, ningún código de producto.
**Fecha del análisis:** 2026-08-11 (UTC).
**Evidencia:** consultas directas de lectura sobre `scheduled_shifts`, `shift_assignments`, `time_entries`,
`clock_events`, `notifications`, `activity_log`, `shift_closeout_reports`, `employees`, `pay_periods`,
logs de Postgres y logs de auth, más lectura del código de portal/cierre.

> Nota de zona horaria: la base guarda UTC. El turno es 16:00–21:00 hora local (America/New_York, UTC-4),
> es decir **20:00–01:00 UTC del 11 de agosto**. Todos los timestamps de esta auditoría van en UTC salvo
> indicación contraria.

---

## 1. Snapshot del turno

| Campo | Valor |
|---|---|
| shift id | `e89a2507-52f8-4325-8537-079a025e7166` |
| QK | QK-001592 |
| tenant (company_id) | `00000000-0000-0000-0000-000000000001` (Quality Staff by Keury) |
| cliente | ELUM FRANKL HALL (`5e246535-…be3b`) |
| venue / job site | **NINGUNO** — `location_id = NULL`, `job_site_location_id = NULL` |
| fecha | 2026-08-10 |
| horario | 16:00–21:00 (editado el 2026-08-09 17:34, campos `start_time`,`end_time`) |
| estado | `status = published`, `publication_status = published` |
| published_at | 2026-08-09 16:39:06 UTC |
| created_at / updated_at | 2026-08-09 16:39:06 / 2026-08-10 18:31:01 |
| deleted_at | NULL |
| required_count (slots) | 6 |
| assigned_count (filas) | 9 filas de assignment; **4 activas** al final (`confirmed`), 4 `removed`, 1 `pending` |
| confirmed_count | 4 (Jorge Cortes, Jeiber Lopez, Carlos Ortiz, Mariany Ortiz) |
| closeout state | `submitted` el 2026-08-11 01:32:17, `ready_for_admin_review = true`, sin revisión ni aprobación final |
| notification state | 6 envíos manuales + recordatorios automáticos (detalle en §8). Todo **in-app**; no hay registro de email/SMS |
| meeting point | vacío |
| transportation_required | `false` |

**Hallazgo estructural:** el turno se ejecutó **sin job site ni venue estructurado y sin punto de encuentro**.
Toda la ubicación operativa vivió en texto libre (`notes`: “Confirmar punto de encuentro con el capitán”).
Esto invalida geocerca, Live Map por sitio y validación de proximidad. `clock_in_within_geofence` quedó NULL
en las tres entradas — no hubo evaluación de geocerca posible.

---

## 2. Matriz por persona

Cobertura contratada: 6. Cobertura real con fichaje: 3.

| Persona | Assignment (estado final) | Portal | Notificación | Aceptó | Clock-in | Clock-out | Time entry | Attendance | Incidencias |
|---|---|---|---|---|---|---|---|---|---|
| **Jorge Cortes** `482e…c61` | `confirmed` (v3) | ACTIVO (`user_id` e5495b59) | SENT in-app ×9 | Sí, 2026-08-10 18:41:16 | 2026-08-11 01:30:49 | 2026-08-11 01:31:28 | `9616e147` cerrada, 39 s | `attendance_status = pending` (nunca validada) | Fichó **a 3 min del final**; nota automática “Clock-out outside scheduled hours” |
| **Jeiber Lopez** `1803…483` | `confirmed` (v2) | ACTIVO (`user_id` 5fa8e161) | SENT in-app ×11 | Sí, 2026-08-11 00:36:29 | 2026-08-11 00:36:36 | 2026-08-11 01:31:53 | `56048360` cerrada, 55 min | `pending` | Aceptó el turno **8 s antes** de fichar, ya empezado |
| **Mariany Ortiz** `41a4…678` | `confirmed` (v2) — **segunda asignación**, creada 19:15:38 tras haber sido `removed` a las 19:08:10 | ACTIVO (`user_id` 2006625f) | SENT in-app ×14 | Sí, 2026-08-11 00:37:09 | 2026-08-11 00:37:20 | **NUNCA** | `a52c6d0c` **ABIERTA HOY** | `pending` | Fichaje abierto sin cierre; perfil actualizado a las 00:34, 3 min antes de fichar |
| **Carlos Ortiz** `f122…dba` | `confirmed` (v2) | ACTIVO (`user_id` f2789038) | SENT in-app ×9 | Sí, 2026-08-10 19:29:40 | NO | NO | ninguna | `pending` | Aceptó y no fichó: “no fichado” real |
| **Sophia Contreras** `ef96…31f` | `removed` (19:08:21) | **SIN PORTAL** (`user_id = NULL`, `portal_access_enabled = false`) | 10 notificaciones creadas **para un destinatario sin cuenta** | No | No | No | ninguna | — | No podía operar por diseño (§6) |
| **William Rodriguez** `28b4…dba` | `pending` (nunca tocado) | ACTIVO | SENT in-app ×11 | No | No | No | ninguna | — | Quedó `pending` hasta el cierre |
| **Alejandro Solano** `8e3e…414` | `removed` (2026-08-10 05:15:32) | ACTIVO | SENT ×9 | No | No | No | ninguna | — | Retirado antes del turno |
| **Francisco Patino** `82e5…12a` | `removed` (2026-08-10 05:15:42) | ACTIVO | SENT ×9 | No | No | No | ninguna | — | Retirado antes del turno |
| **Mariany Ortiz (asignación #1)** `1d7b…1da` | `removed` 19:08:10 | — | — | No | — | — | — | — | Fila huérfana que sigue contando en lecturas que no filtran `removed` |

---

## 3. TIME_ENTRIES — respuesta exacta

Existen **exactamente 3** `time_entries` con `shift_id = QK-001592`. No hay ninguna otra entrada de estos
trabajadores en las 24 h alrededor del turno (verificado sobre toda la tabla desde 2026-08-10 12:00 UTC).

| id | worker | clock_in | clock_out | version | updated_by | notas |
|---|---|---|---|---|---|---|
| `56048360-…9784` | Jeiber Lopez | 00:36:36.741 | 01:31:53.921 | 2 | 5fa8e161 (él mismo) | “⚠️ Clock-out outside scheduled hours.” |
| `a52c6d0c-…9d2` | Mariany Ortiz | 00:37:20.323 | **NULL** | 1 | — | **abierta** |
| `9616e147-…7b4` | Jorge Cortes | 01:30:49.547 | 01:31:28.416 | 2 | e5495b59 (él mismo) | “⚠️ Clock-out outside scheduled hours.” |

Respuestas punto por punto:

- **¿existió tu primer clock-in?** No hay evidencia de que llegara a la base. Para Jorge Cortes existe
  **una sola** fila, creada 01:30:49, con `version = 1 → 2` (insert + un update = el clock-out). Un
  primer clock-in persistido habría dejado (a) una fila propia, (b) un `clock_events.type='clock_in'`
  adicional. Hay exactamente **5 clock_events** (3 in + 2 out), uno por cada operación real de la tabla.
- **¿se escribió en DB?** No.
- **¿a qué hora?** No aplica: no hay registro.
- **¿qué assignment lo generó?** N/A.
- **¿se cerró / se reemplazó?** No.
- **¿se ocultó solo en UI?** Esa es la hipótesis compatible con la evidencia: la UI mostró estado de
  “fichado” sin write confirmado, o el write nunca se disparó (ver §10). No hay error de Postgres en la
  ventana (0 `ERROR/FATAL` entre 19:00 y 02:00 UTC salvo mis propias consultas de auditoría), lo que
  descarta rechazo por RLS o constraint: **la petición no llegó al servidor**.
- **¿se creó un segundo time_entry?** Sí en el sentido operativo (el que existe hoy, 01:30), pero es el
  único registro real.
- **¿hay duplicados?** **No.** Un registro por trabajador, sin solapes.
- **¿hubo UPDATE?** Sí, dos: los clock-out de Jeiber y Jorge (`version = 2`, `updated_by` = el propio
  trabajador). Ningún update administrativo.
- **¿hubo DELETE?** No hay evidencia de borrado (`time_entries` no tiene soft-delete y no hay huecos de
  `clock_events` sin `time_entry_id`; los 5 eventos apuntan a las 3 filas existentes).
- **¿edge function / mutation externa?** No. Los logs de `employee-auth` y `shift-reminders` sólo muestran
  `shutdown`; ninguna función tocó `time_entries`.

**Nada fue borrado, deduplicado ni corregido en esta auditoría.**

---

## 4. Timeline real (UTC)

```
2026-08-09
16:39:06  creación del turno QK-001592 (usuario 2bf0401f) · 6 slots
16:39:07  6 asignaciones iniciales creadas en bloque
16:46:40  publicar_turno → 6 notificaciones in-app "Turno publicado"
16:46:48  enviar_notificacion_turno (recipient_count 6)
17:34:35  editar_turno: cambian start_time y end_time → 6 notificaciones "Turno modificado"

2026-08-10
03:00:04  recordatorio automático "Confirma tu turno" (5 destinatarios)
03:11:29  enviar_notificacion_turno manual (6)
05:15:32  Alejandro Solano → removed
05:15:42  Francisco Patino → removed
05:16:08  asignar_empleados (2): Sophia Contreras + Carlos Ortiz
          · log: assignment_created_with_incomplete_profile ×2
            - Carlos: has_portal=true, profile_status=pending_documents
            - Sophia: has_portal=FALSE, profile_status=incomplete
05:16:18  enviar_notificacion_turno (8)
05:18:05  enviar_notificacion_turno (8)   ← reenvío 2 min después
05:30:04  recordatorio "Confirma tu turno" a Sophia y Carlos
14:00:04  "⚠️ Confirma tu turno — comienza pronto" (5 destinatarios)
18:31:01  scheduled_shifts.updated_at (edición administrativa)
18:41:16  Jorge Cortes acepta
18:53:29  enviar_notificacion_turno (8) por el usuario e5495b59 (Jorge)
19:08:10  Mariany Ortiz → assignment REMOVED  (por e5495b59)
19:08:21  Sophia Contreras → assignment REMOVED (por e5495b59)
19:15:38  Mariany Ortiz → NUEVA asignación creada (por e5495b59)
          · log: assignment_created_with_incomplete_profile (profile_status=incomplete)
19:29:40  Carlos Ortiz acepta
20:00     (16:00 local) INICIO PROGRAMADO — nadie fichado
2026-08-11
00:34:27  employees.updated_at de Mariany (actualización de datos de perfil desde el portal)
00:36:29  Jeiber Lopez acepta el turno
00:36:36  Jeiber Lopez CLOCK-IN  (4 h 36 min después del inicio programado)
00:37:09  Mariany Ortiz acepta el turno
00:37:20  Mariany Ortiz CLOCK-IN  → entrada que sigue ABIERTA
01:00     (21:00 local) FIN PROGRAMADO
01:30:49  Jorge Cortes CLOCK-IN   (30 min después del fin)
01:31:28  Jorge Cortes CLOCK-OUT  (39 s de duración registrada)
01:31:53  Jeiber Lopez CLOCK-OUT
01:32:17  CLOSEOUT enviado por Jorge Cortes (role=admin): staff 6, no_show 0, late 0, incidentes 0
```

Huecos de evidencia declarados: los logs de auth tienen retención corta y **no conservan la ventana
20:00–02:00 UTC**; no hay tabla de sesiones de portal ni telemetría de cliente. Por eso §9 se responde
por diseño del código, no por trazas.

---

## 5. Visibilidad del turno en el portal

Cadena verificada en código: `shift_assignments → scheduled_shifts!inner → publication_status='published'
→ deleted_at IS NULL → status NOT IN (cancelled) → filtro por estado de assignment`.

- `MyShifts.tsx` excluye `status IN (removed, rejected)`.
- `PortalClock.tsx` sólo lista `status IN ('confirmed','pending')` **y** `scheduled_shifts.date = hoy local`.

Conclusiones:

1. **El turno estuvo visible desde el 2026-08-09 16:46** para las 6 asignaciones originales. Publicación y
   visibilidad no fueron el problema general.
2. **Mariany perdió visibilidad entre 19:08:10 y 19:15:38** (7 min 28 s) porque su assignment pasó a
   `removed`: ambas consultas del portal lo excluyen. No fue caché: fue estado real en base.
3. **Sophia nunca pudo verlo**: no tiene `user_id`, no existe sesión posible (§6).
4. No hay tenant mismatch: todas las filas comparten `company_id`.
5. Riesgo latente de caché: `MyShifts` guarda snapshot en `pageCache`, y el listado no se invalida cuando
   un admin cambia asignaciones desde otro dispositivo. Un worker con la app abierta pudo seguir viendo
   (o dejar de ver) el turno hasta el siguiente refetch manual. No hay realtime sobre `shift_assignments`.

---

## 6. Sophia Contreras — caso aislado

Las cuatro dimensiones, separadas:

| Dimensión | Valor real | Fuente |
|---|---|---|
| Assignment | Asignada 2026-08-10 05:16:08 → `removed` 19:08:21 | `shift_assignments` |
| **Portal** | **INEXISTENTE.** `user_id = NULL`, `portal_access_enabled = false`, sin email, sin teléfono, sin PIN | `employees` |
| Identity | `identity_status = verified`, sin duplicado marcado, `merged_into_employee_id = NULL` | `employees` |
| Compliance | `profile_status = incomplete`, `onboarding_status = pending`, **0 documentos cargados** | `employee_documents` |
| Assignability | Según el contrato canónico era asignable (activa, no placeholder, no histórica) — **el contrato no exige portal** | `assignable-workers.ts` |

**¿El turno debía ser visible para ella?** No: sin `user_id` no hay sesión, no hay consulta de portal, no
hay pantalla. **¿Por qué no pudo operar?** Porque se le asignó un turno operativo a una persona sin cuenta
de portal, y el sistema lo permitió emitiendo únicamente un log informativo
(`assignment_created_with_incomplete_profile`, `has_portal: false`) que nadie bloqueó. Se le generaron
**10 notificaciones dirigidas a un destinatario que no puede iniciar sesión** — notificaciones huérfanas.

No es un problema de identidad ni de cumplimiento: es un problema de **portal + política de asignación**.

---

## 7. Mariany Ortiz — caso aislado

Secuencia exacta:

```
19:08:10  su assignment #1 pasa a `removed` (acción del usuario e5495b59)
          → desaparece de MyShifts y de PortalClock inmediatamente
19:15:38  se crea assignment #2 (misma persona, mismo turno)
          → vuelve a ser visible; se genera nueva notificación
00:34:27  actualiza datos de perfil desde el portal (employees.updated_at)
00:37:09  acepta el turno
00:37:20  hace clock-in  → entrada abierta hasta hoy
```

Respuestas a las hipótesis planteadas:

- **¿completar perfil bloqueó la visibilidad del turno?** **No.** Ninguna consulta del portal filtra por
  `profile_status`, `onboarding_status` ni documentos. Su `profile_status` sigue siendo `incomplete` hoy y
  pudo ver, aceptar y fichar. Las tareas de perfil son **warnings**, no bloqueos.
- **¿la actualización de dirección disparó un refresh?** Coincide temporalmente (00:34 → visible/acepta a
  las 00:37), pero el refetch del portal ocurre en cada `loadData()`. La causa raíz de que **el turno no
  estuviera** no fue el perfil: fue el ciclo remove→re-add de las 19:08–19:15.
- **¿el portal quedó stale?** Es la explicación más probable de la percepción “sólo apareció después de
  actualizar mis datos”: entre 19:08 y su siguiente carga real, la app pudo servir snapshot de
  `pageCache`/estado en memoria; la navegación forzada por el flujo de perfil provocó el refetch que
  finalmente mostró la asignación #2.
- **¿la sesión se revalidó después?** Sin logs de auth en esa ventana no puede afirmarse. No hay evidencia
  de expiración ni de re-login.
- **Causa exacta:** **assignment churn administrativo** (removed y recreado 7 min después) + ausencia de
  invalidación push en el portal. Datos correctos, propagación deficiente.

---

## 8. Notificaciones

Todas las notificaciones de este turno son **in-app** (`notifications`). `email_send_log` está **vacío**
para el periodo: no hubo email. No hay tabla ni evidencia de SMS/push para este turno.

| Persona | Estado canónico | Total | Primera | Última |
|---|---|---|---|---|
| Jeiber Lopez | SENT (in-app, portal-only) | 11 | 08-09 16:46:40 | 08-10 18:53:29 |
| William Rodriguez | SENT (in-app) | 11 | 08-09 16:46:40 | 08-10 18:53:29 |
| Mariany Ortiz | SENT (in-app) | 14 | 08-09 16:46:40 | 08-10 19:15:39 |
| Jorge Cortes | SENT (in-app) | 9 | 08-09 16:46:40 | 08-10 18:53:29 |
| Carlos Ortiz | SENT (in-app) | 9 | 08-10 05:16:08 | 08-10 18:53:29 |
| Francisco Patino | SENT (in-app) | 9 | 08-09 16:46:40 | 08-10 18:53:29 |
| Alejandro Solano | SENT (in-app) | 9 | 08-09 16:46:40 | 08-10 18:53:29 |
| **Sophia Contreras** | **SENT sin destino alcanzable** (sin cuenta, sin email, sin teléfono) | 10 | 08-10 05:16:08 | 08-10 19:08:21 |

- **DELIVERED**: no medible. No existe acuse de entrega; `read_at` está NULL en el 100 % de las filas
  inspeccionadas → **nadie marcó como leída ninguna notificación de este turno**.
- **FAILED**: 0 registradas (no hay canal externo que pueda fallar).
- **UNKNOWN**: la entrega real al dispositivo (push nativo) no está instrumentada.
- **Ruido**: 6 envíos manuales de `enviar_notificacion_turno` + 3 tandas automáticas. Dos envíos separados
  por 107 segundos (05:16:18 y 05:18:05) con el mismo contenido.

**Publicado ≠ notificado ≠ entregado ≠ leído.** Aquí sólo está probado “creado en base”.

---

## 9. Sesión / relock

No existe tabla de sesiones de portal y los logs de auth no cubren la ventana. Lo verificable en código:

- Los 8 trabajadores tienen `must_change_pin = true` y **`access_pin_hash = NULL`, `pin_set_at = NULL`**.
  Es decir: **ninguno tiene PIN configurado y todos siguen marcados como “debe cambiar PIN”**.
- El PIN se usa en `CompanySwitchPinDialog` (cambio de compañía) y en `ActivateAccount`. Un usuario que
  cambia de contexto o reingresa vuelve a encontrar el flujo de PIN porque el flag nunca se limpió.
- La sesión de Supabase se refresca sola; una app iOS suspendida en segundo plano puede volver con el
  token vencido y forzar rehidratación → pantalla de desbloqueo/reingreso.

**¿Por qué un usuario ya desbloqueado vuelve a ser bloqueado?** Porque el desbloqueo **no se persiste**:
`must_change_pin` sigue en `true` y no hay hash guardado, así que cada rehidratación de sesión repite el
gate. **Clasificación: BUG (AUTH/PORTAL, P1)** — no es comportamiento esperado documentado.

---

## 10. Clock-in / clock-out UX

Flujo real en `PortalClock.tsx`:

1. `loadData()` lista turnos de **hoy (fecha local)** con assignment `confirmed|pending`.
2. El botón de fichar exige `selectedShift` seleccionado.
3. Clock-in = `insert` en `time_entries` + `insert` en `clock_events`. **No hay verificación previa de
   entrada abierta para ese turno, ni bloqueo del botón durante el vuelo de la petición documentado a nivel
   de guardia de duplicado.**
4. Tras el insert: `setSelectedShift(null)` y `await loadData()`.

Riesgos confirmados por lectura:

- **`setSelectedShift(null)` + refetch**: si el refetch tarda o falla (red móvil en un salón de eventos),
  la UI se queda sin turno seleccionado y **el botón desaparece**, dando exactamente la sensación de
  “hice clock-in y dejó de aparecer”.
- **Sin guardia de idempotencia**: dos toques podrían generar dos entradas. No ocurrió aquí, pero el
  camino está abierto.
- **Sin cola offline**: si el `insert` no sale del dispositivo, no queda rastro en ninguna parte. Esto es
  coherente con la ausencia total de errores en Postgres.

### ¿Cómo puede existir “0 fichados” con “2 salidas”?

Con datos, sin ambigüedad. `LiveShiftBoard.tsx` calcula:

- `fichados` = `groups.active` = entradas con `clock_in` y **sin** `clock_out` **y** dentro del margen de
  cierre. Las 4 asignaciones activas caían así: Jorge y Jeiber ya con `clock_out` → `completed`;
  Mariany abierta pero **pasada la hora de fin + gracia** → cae en `missing_clockout`, no en `active`;
  Carlos sin entrada → `no_clockin`.
- Resultado: **fichados = 0, salidas = 2, falta salida = 1, no fichados = 1** — exactamente lo que se vio.

No es corrupción de datos: es **etiquetado engañoso**. “Fichados” significa en realidad “activos ahora
mismo”, y a las 21:30 no había nadie activo. **Clasificación: UI, P1.**

---

## 11. Attendance vs time_entry

Estados reales del turno, separados:

| Etapa | Cuántos | Quiénes |
|---|---|---|
| Scheduled (slots) | 6 | — |
| Assigned (activos) | 4 | Jorge, Jeiber, Mariany, Carlos (+1 `pending`: William) |
| Accepted | 4 | los mismos, 3 de ellos aceptaron **después del inicio** |
| Arrived (evento `arrival`) | 0 | no se usó modo arrival |
| Clocked in | 3 | Jorge, Jeiber, Mariany |
| Clocked out | 2 | Jorge, Jeiber |
| Admin confirmed (`attendance_status`) | **0** | las 9 asignaciones siguen en `pending`, `attendance_validated_at` NULL |
| Closed (closeout) | 1 informe `submitted`, sin revisión | — |

- **No hubo conversión de asistencia manual en `time_entries`.** Correcto: ninguna entrada tiene
  `entry_source` distinto de `clock`.
- **¿Puede existir “salida” sin clock-in?** En estos datos, **no**: las 2 salidas tienen su clock-in.
  El `clock_out` es un UPDATE sobre una fila existente, no un insert independiente, así que estructuralmente
  no puede haber salida huérfana en `time_entries`. La sensación de “salidas sin fichados” proviene del
  contador de §10.

---

## 12. Cierre del turno

| Campo | Valor | Realidad contrastada |
|---|---|---|
| submitted_by | Jorge Cortes (e5495b59), role `admin` | también fue trabajador del turno |
| submitted_at | 2026-08-11 01:32:17 | **24 s después de su propio clock-out** |
| staff_count_reported | **6** | 3 personas ficharon; 4 asignaciones activas |
| no_show_count | 0 | Carlos Ortiz aceptó y no fichó = no-show real |
| late_count | 0 | 3 de 3 ficharon con 4 h 36 min / 5 h 30 min de retraso |
| incident_count | 0 | 1 fichaje abierto + 1 sin fichaje |
| ready_for_admin_review | true | — |
| reviewed_by / final_approval_status | NULL | nadie revisó ni aprobó |

**Validaciones que corrieron:** las del formulario de capitán (`CaptainCloseoutForm`), que **no bloquean**:
si hay pendientes (`missingClockOut > 0 || noShows > 0 || incidents > 0`) sólo exige marcar una casilla de
“acuse”. Los contadores son **auto-declarados por texto libre**, no derivados de los datos reales.

En paralelo, la tarjeta administrativa (`ShiftClosureCard` → `evaluateShiftClosure`) **sí** trata
“fichaje abierto” y “horas por revisar” como *blockers*. Es decir: **existen dos puertas de cierre con
reglas distintas y el turno salió por la puerta débil**.

Distinción obligatoria:

- `CLOSEOUT_SUBMITTED` — **SÍ**, 01:32:17.
- `FULLY_RECONCILED` — **NO**: 1 entrada abierta, 1 asignación sin fichaje, 0 asistencias validadas.
- `PAYROLL_READY` — **NO**: las 3 entradas siguen en `status = pending`, ninguna aprobada.

---

## 13. Portal mobile — qué bloquea y qué no

Verificado contra el código de las consultas de portal:

| Estado observado en video | ¿bloquea ver turnos? | ¿bloquea aceptar? | ¿bloquea clock-in? | Veredicto |
|---|---|---|---|---|
| Historial vacío | No | No | No | Warning cosmético |
| Perfil incompleto (`profile_status = incomplete`) | **No** | No | No | Warning |
| Actualización de dirección | No | No | No | Warning |
| Contacto de emergencia faltante | No | No | No | Warning |
| W-9 pendiente | No | No | No | Warning (con bypass de ruta en `PortalModuleGuard`) |
| **Sin `user_id` (Sophia)** | **SÍ, total** | Sí | Sí | Bloqueo real, no señalizado al admin |
| **Assignment en `removed`** | **SÍ** | Sí | Sí | Bloqueo real |

Ningún requisito no bloqueante dejó a nadie sin operar. Los dos bloqueos reales fueron **falta de cuenta de
portal** y **assignment retirado**. Sin embargo, la **prominencia visual** de las tareas de perfil hace que
el worker crea que está bloqueado cuando no lo está — coste operativo real (Mariany).

---

## 14. Clasificación de hallazgos

| # | Hallazgo | Categoría | Severidad |
|---|---|---|---|
| F1 | Entrada de Mariany abierta desde 00:37:20 y el turno se cerró igual | TIME_ENTRY / CLOSEOUT | **P0** |
| F2 | Dos puertas de cierre con reglas distintas: el capitán puede enviar cierre con bloqueadores que el admin sí bloquea | CLOSEOUT | **P0** |
| F3 | Closeout auto-declarado (6 staff, 0 no-show, 0 late, 0 incidentes) contradice los datos reales sin ninguna reconciliación | CLOSEOUT / DATA | **P0** |
| F4 | Clock-in sin idempotencia ni cola offline; refetch tras insert puede dejar la UI sin turno seleccionado (“desapareció mi fichaje”) | UI / TIME_ENTRY | **P0** |
| F5 | Assignment de Mariany removido y recreado (19:08→19:15) sin invalidación push: el turno desapareció de su portal | ASSIGNMENT / CACHE | **P1** |
| F6 | Sophia asignada sin cuenta de portal; sólo se emitió un log informativo | ASSIGNMENT / PORTAL | **P1** |
| F7 | 10 notificaciones creadas para un destinatario sin cuenta ni email ni teléfono | NOTIFICATION | **P1** |
| F8 | `must_change_pin = true` y `access_pin_hash = NULL` en los 8 trabajadores: el gate de PIN se repite indefinidamente | AUTH / PORTAL | **P1** |
| F9 | Contador “Fichados” significa “activos ahora”: produce “0 fichados / 2 salidas” | UI | **P1** |
| F10 | `attendance_status = pending` en las 9 asignaciones: nadie validó asistencia | ATTENDANCE | **P1** |
| F11 | Turno operado sin job site ni venue estructurado ni meeting point; geocerca no evaluable (`within_geofence` NULL) | DATA | **P1** |
| F12 | Tres `pay_periods` distintos para el mismo rango 2026-08-05 → 2026-08-11 | DATA / PAYROLL | **P1** |
| F13 | Sin acuse de entrega de notificaciones: `read_at` NULL en el 100 %; entrega push no instrumentada | NOTIFICATION | **P2** |
| F14 | 6 envíos manuales repetidos del mismo aviso (dos con 107 s de diferencia) | NOTIFICATION / UI | **P2** |
| F15 | Retención de logs de auth insuficiente para auditar sesiones de un turno pasado | UNKNOWN | **P2** |
| F16 | Fila de assignment `removed` de Mariany convive con la activa: lecturas que no filtran `removed` cuentan 9 asignaciones | DATA | **P2** |

---

## Respuestas explícitas al entregable

1. **¿Se perdió realmente algún clock-in?** No hay ningún clock-in perdido *en la base*: nunca existió una
   cuarta fila. Para Jorge Cortes, el primer intento **no llegó al servidor** (0 errores de Postgres, 0
   `clock_events` extra). Se perdió en el dispositivo/red o nunca se disparó, y la UI dio la impresión
   contraria. Evidencia preservada intacta.
2. **¿Hay `time_entries` duplicados?** **No.** Tres filas, una por trabajador, sin solapes.
3. **¿Qué horas conserva hoy la base?** Jeiber Lopez 00:36:36 → 01:31:53 (≈55 min). Jorge Cortes
   01:30:49 → 01:31:28 (≈39 s). Mariany Ortiz 00:37:20 → **abierta**. Las tres en `status = pending`.
   Ninguna refleja un turno de 5 h.
4. **¿Quién recibió notificación realmente?** Se **crearon** notificaciones in-app para los 8 asignados.
   Alcanzables: 7 (los que tienen cuenta). No alcanzable: Sophia. **Leídas: 0.** Emails: 0. Push: no medible.
5. **¿Quién pudo ver el turno realmente?** Jorge, Jeiber, Carlos, William, Alejandro y Francisco (hasta su
   retiro), y Mariany salvo la ventana 19:08–19:15. Sophia: nunca.
6. **¿Quién pudo hacer clock-in/out?** Clock-in: Jorge, Jeiber, Mariany. Clock-out: Jorge y Jeiber.
   Carlos pudo y no lo hizo. Sophia no pudo.
7. **¿Por qué algunos tuvieron que desbloquear/reingresar?** Porque el desbloqueo no persiste:
   `must_change_pin = true` con `access_pin_hash = NULL` en los 8 trabajadores, más rehidratación de sesión
   tras suspender la app. Es un bug, no comportamiento esperado.
8. **¿Qué pasó con Sophia?** Se le asignó un turno sin tener cuenta de portal (`user_id = NULL`,
   `portal_access_enabled = false`, sin email ni teléfono). Era asignable según el contrato canónico —
   que no exige portal — así que el sistema lo permitió y le generó 10 notificaciones inalcanzables.
   La retiraron a las 19:08:21. No fue identidad ni cumplimiento: fue **falta de portal**.
9. **¿Qué pasó con Mariany?** Su asignación fue **retirada a las 19:08:10 y recreada a las 19:15:38**.
   Durante ese lapso —y hasta el siguiente refetch de su app— el turno desapareció de su portal, porque
   ambas consultas excluyen `removed`. Completar el perfil **no** era un bloqueo; la coincidencia temporal
   con su actualización de datos (00:34) se explica porque ese flujo forzó el refetch que reveló la nueva
   asignación. Fichó a las 00:37:20 y **su fichaje sigue abierto**.
10. **¿Por qué existen salidas con 0 fichados?** Porque “Fichados” cuenta sólo a quien está *activo ahora*.
    A la hora del cierre: 2 completados (salidas), 1 abierto pero fuera de horario (“falta salida”), 1 sin
    fichaje. Cero activos. Etiqueta engañosa, no corrupción.
11. **¿El cierre preservó correctamente las horas?** Preservó lo que había —no borró ni alteró nada— pero
    **selló un turno con un fichaje abierto y con contadores auto-declarados que contradicen los datos**.
    No hubo reconciliación.
12. **¿Hay riesgo de payroll incorrecto?** **Sí, alto.** (a) La entrada abierta de Mariany no tiene horas
    computables y bloquea o distorsiona cualquier cálculo; (b) Jorge tiene 39 s registrados por un turno
    trabajado; (c) Jeiber tiene 55 min por un turno de 5 h; (d) las 3 entradas siguen `pending`, sin
    aprobación; (e) hay 3 `pay_periods` solapados para el mismo rango. Nada de esto se tocó.
13. **¿Qué fue UI y qué fue datos/backend?**
    **UI/cliente:** clock-in perdido (F4), contador engañoso (F9), portal stale tras cambio de asignación
    (F5, parte cliente), sensación de bloqueo por tareas de perfil (§13), repetición del gate de PIN (F8,
    parte cliente).
    **Datos/backend:** entrada abierta (F1), closeout sin validación dura (F2, F3), Sophia sin portal (F6),
    notificaciones inalcanzables (F7), asistencia nunca validada (F10), ausencia de job site (F11),
    `pay_periods` duplicados (F12), `must_change_pin` sin hash (F8, parte datos).
14. **Fixes P0 recomendados — NO aplicados:**
    - **P0-A · Puerta única de cierre.** `evaluateShiftClosure` como único juez para admin y capitán.
      Fichaje abierto = bloqueador en ambos caminos.
    - **P0-B · Closeout derivado, no declarado.** Prellenar staff/no-show/late/incidentes desde
      `time_entries` + `shift_assignments`; permitir corrección justificada, nunca cifras libres.
    - **P0-C · Estados de cierre separados.** Exponer `CLOSEOUT_SUBMITTED` / `FULLY_RECONCILED` /
      `PAYROLL_READY` como tres indicadores distintos; hoy la UI sugiere que “Cierre enviado” es el final.
    - **P0-D · Clock-in resiliente.** Guardia de idempotencia (una entrada abierta por worker+turno),
      no limpiar `selectedShift` hasta que el refetch confirme la fila, y cola de reintento offline con
      estado visible “pendiente de sincronizar”.
    - **P0-E · Fichaje abierto = incidencia operativa.** Alerta visible en Shift Ops y en el portal del
      worker mientras exista `clock_out IS NULL` en un turno terminado. Sin auto-cerrar horas jamás.
    - **P1-F · Bloquear asignación sin portal** (o marcarla explícitamente como “no podrá operar”) y no
      generar notificaciones a destinatarios inalcanzables.
    - **P1-G · Invalidación push de asignaciones** al portal (realtime sobre `shift_assignments`) para
      eliminar la ventana stale del caso Mariany.
    - **P1-H · Renombrar el contador** “Fichados” → “Activos ahora” y añadir “Ficharon (total)”.
    - **P1-I · Reparar el ciclo de PIN**: al establecerlo, escribir `access_pin_hash` + `pin_set_at` y
      limpiar `must_change_pin`.

---

## Preservación de evidencia

No se ejecutó ningún `UPDATE`, `DELETE`, `INSERT` ni migración. No se dedujo cuál fichaje es “el correcto”.
No se recalculó ni tocó nómina. Las tres `time_entries` —incluida la abierta— permanecen exactamente como
las dejó la operación real.
