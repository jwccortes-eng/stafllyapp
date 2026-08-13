# P0 — DUVÁN LAST ACTIVITY TRUTH

**Fecha:** 2026-08-13 (UTC)
**Alcance:** auditoría forense de sólo lectura. **No se modificó ningún dato ni ninguna pantalla.**
**Caso:** Duván Gallego nunca ha logrado ingresar (ni Quality Staff ni MyStaff), pero su perfil administrativo muestra "Last activity: 3 days ago".

---

## 1. Identidad auditada

| Ficha | Empresa | `employees.id` | `user_id` | Activa |
|---|---|---|---|---|
| Duvan Gallego | Quality Staff by Keury | `4d603205-…bf5f` | `4338b336-0f65-4285-9d50-6abcc28e5645` | sí |
| Duvan Gallego | My Staff Solution LLC | `cad09ca0-…92cd` | `4338b336-0f65-4285-9d50-6abcc28e5645` | sí |

Un solo usuario de autenticación (`emp_3472031873@employee.internal`) para las dos fichas.

---

## 2. Qué alimenta "Last activity"

1. **Pantalla:** `src/pages/admin/UnifiedPersonProfile.tsx`, KPI `key: "activity"`, etiqueta `"Last activity"`.
2. **Tabla:** `public.activity_log`.
3. **Columna exacta:** `activity_log.created_at` de la fila más reciente.
4. **Filtro:** `entity_id = <employee.id>` **y** `entity_type = 'employee'`, `order by created_at desc limit 8` → se muestra `recentActivity[0].created_at`.

No consulta sesiones, `auth.users.last_sign_in_at`, ni ningún evento de portal.

---

## 3. El evento exacto de "hace 3 días"

Ficha Quality (`4d603205-…`), fila más reciente en `activity_log` con `entity_type='employee'`:

| Campo | Valor |
|---|---|
| `created_at` | **2026-08-10 03:48:49.959555+00** (≈3 días antes del 13-ago) |
| `action` | `delete` |
| `entity_type` | `employee` |
| `entity_id` | `4d603205-…bf5f` (ficha Quality) |
| `user_id` (actor) | `2bf0401f-…4860` → **Jorge (cuenta admin `jwc.cortes@gmail.com`)** |
| `details` | `archive_type: deactivation`, `reason: other`, `effective_date: 2026-08-10`, `eligible_for_rehire: true` |

**Actor:** administrador humano desde la consola de administración (escritura de auditoría desde la app, no import, no trigger, no edge function, no el propio usuario).
**Evento real:** desactivación/archivado administrativo de la ficha de Quality. Es decir, el "último rastro" es una acción **sobre** Duván, no una acción **de** Duván.

Evento más reciente en la ficha MyStaff (`cad09ca0-…`): `reset_access_pin` el **2026-08-12 17:37 UTC**, actor el mismo admin, vía RPC (`details: {via: rpc, hash: dual_write}`). También es acción administrativa.

---

## 4. Respuestas directas

**¿Duván tiene algún login exitoso registrado?**
**No.** `auth.users.last_sign_in_at = NULL` para `4338b336-…`. Cero logins en toda la vida de la cuenta (creada 2026-03-14).

**¿Tiene alguna sesión válida histórica?**
**No.** `auth.sessions` = 0 filas; `auth.refresh_tokens` = 0 filas. Nunca existió sesión.

**¿Tiene algún portal event real?**
**No.** `clock_events` = 0. Ningún evento originado por el usuario. Lo único con su `employee_id` son registros creados por administración/importación: 8 `time_entries` (último clock-in **2026-02-12**, anterior incluso a la creación de su cuenta de acceso) y 4 `shift_assignments` (última **2026-03-19**).

**¿Cuál fue el evento de hace 3 días?**
La **desactivación administrativa** de su ficha de Quality Staff el 2026-08-10 03:48 UTC, ejecutada por el administrador Jorge. Registrada como `action = 'delete'` en `activity_log`.

**¿Corresponde al employee de Quality, MyStaff, auth user, perfil o histórico?**
A la **ficha de employee de Quality Staff**. No al auth user, no al perfil, no a historial operativo.

**¿"Last activity" está mal nombrado?**
**Sí.** Mide el último *cambio administrativo auditado sobre el registro*, no la última actividad de la persona. Nombre correcto: **"Last record change"** / "Último cambio del registro" (con el actor visible). Tal como está, induce a creer que hubo acceso o trabajo real.

**¿Debe existir un resolver canónico de User Access / Activity?**
**Sí.** Hoy conviven al menos cuatro semánticas distintas bajo etiquetas parecidas: `activity_log.created_at` (perfil), `location_presence.last_seen_at` ("Última actividad" en `/app/workforce`), `last_clock_in` (WorkerDuplicates) e `mcp_invocations.invoked_at` (Integraciones). Se recomienda un módulo único que devuelva dimensiones separadas y nunca intercambiables:

- `lastRecordChange` — `activity_log` + actor + acción.
- `lastAuthAccess` — login real (`auth.users.last_sign_in_at` / sesiones), vía RPC segura.
- `lastOperationalActivity` — clock-in / evento de reloj real.
- `lastPresence` — `location_presence.last_seen_at`.

Con la regla de que **ninguna se infiere desde otra** (mismo principio que `resolvePersonStatus`).

---

## 5. Conclusión

El indicador no está roto en su cálculo: está **mal nombrado y mal interpretado**. Duván no tiene ni un solo acceso, sesión ni evento operativo propio. El "3 days ago" es el rastro de un administrador desactivando su ficha de Quality Staff.

**Acciones sugeridas (no ejecutadas, requieren aprobación):**
1. Renombrar el KPI a "Last record change" y mostrar actor + acción en el hint.
2. Añadir un KPI separado "Last access" alimentado por login real, con valor "Nunca ingresó" cuando no hay sesiones.
3. Crear el resolver canónico de User Access / Activity con las cuatro dimensiones anteriores.
