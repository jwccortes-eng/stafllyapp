# P0 — AUTH / PIN SINGLE SOURCE OF TRUTH (FORENSIC)

Fecha: 2026-08-13 · Modo: **solo lectura** (no se modificaron datos, no se reseteó ningún PIN, no se aplicaron parches)

---

## 0. Veredicto

**NO existe una sola identidad de autenticación por persona.**
Hoy una persona puede tener hasta **4 valores de PIN simultáneos y divergentes**, escritos por **7 escritores distintos** y leídos por **6 validadores distintos**, sin ningún resolver canónico entre ellos.

| Pregunta | Respuesta |
|---|---|
| ¿Cuántos PIN existen realmente por persona? | Hasta 4: `employees.access_pin` (uno **por cada ficha/compañía**), `employees.access_pin_hash`, `profiles.switch_pin`, y la contraseña derivada del PIN en el usuario de autenticación. |
| ¿Cuántos deberían existir? | **Uno**, por persona (Auth User), independiente de compañía. |
| ¿Puede un cambio de teléfono dejar dos identidades? | **Sí.** El teléfono se edita en la ficha, pero el correo interno de autenticación queda congelado con el teléfono viejo (`emp_<viejo>@employee.internal`). Además el bloqueo antifraude se guarda por texto de teléfono sin normalizar. |
| ¿Puede un cambio de empresa dejar dos PIN? | **Sí.** El PIN vive en la ficha de empleado, y cada compañía tiene su propia ficha. |
| ¿Puede un reset actualizar un lugar distinto al login? | **Sí.** El reset del panel actualiza una sola ficha y no toca el PIN de cambio de compañía, ni las demás fichas, ni el bloqueo por teléfono. |
| ¿Existe más de un escritor? | **Sí, siete.** |

---

## 1. Modelo AUTH real (no el deseado)

```text
Persona (concepto, sin tabla propia)
   ├── Auth User (uno... o varios: ver Caso A)
   │      ├── correo interno emp_<telefono>@employee.internal   ← congela el teléfono del día del alta
   │      ├── contraseña = prefijo + PIN                        ← copia #4 del PIN
   │      └── profiles (1:1 con Auth User)
   │             ├── phone_number            ← teléfono ACTUAL
   │             └── switch_pin              ← copia #3 del PIN (PIN de cambio de compañía)
   ├── Membership: company_users (user_id + company_id + rol)
   └── Employee (UNA FICHA POR COMPAÑÍA)
          ├── phone_number      ← clave real de login
          ├── access_pin        ← copia #1 (por compañía)
          ├── access_pin_hash   ← copia #2 (por compañía)
          └── is_active / merged_into_employee_id
```

El login **no parte de la persona ni del Auth User**: parte del **teléfono escrito en la ficha de empleado**, elige una ficha entre varias y valida el PIN de esa ficha. La identidad se deduce después, no antes.

---

## 2. Dónde existe un PIN (inventario completo, verificado)

Columnas con PIN en la base de datos:

| Ubicación | Alcance | Comentario |
|---|---|---|
| `employees.access_pin` | por ficha (por compañía) | texto plano, fuente principal del login |
| `employees.access_pin_hash` (+ `pin_hash_version`, `pin_set_at`, `pin_migrated_at`) | por ficha | bcrypt, sólo se valida en modo "dual" |
| `profiles.switch_pin` | por Auth User | **segundo PIN independiente**, para cambiar de compañía (6 perfiles lo tienen) |
| contraseña del usuario de autenticación | por Auth User | derivada del PIN (`prefijo + PIN`) |

No hay otra tabla legacy con PIN: el resto de coincidencias (`announcements.pinned`, `channel_messages.is_pinned`, `community_channels.pinned_message_ids`) son "pinned/fijado", no credenciales.

---

## 3. Dónde se valida un PIN

1. `supabase/functions/employee-auth/index.ts` (acción `login`, líneas ~686-770) — compara contra `access_pin` / `access_pin_hash` de **una** ficha elegida.
2. `supabase/functions/employee-auth/index.ts` (acción `change-pin`, línea ~1081) — compara contra `access_pin` de la ficha resuelta por `user_id`.
3. `supabase/functions/kiosk-clock/index.ts` (línea ~181).
4. `supabase/functions/front-desk-checkin/index.ts` (líneas ~229-262).
5. `supabase/functions/pin-qa-validate/index.ts` (herramienta QA).
6. `verify_switch_pin()` en base de datos — usado por `src/components/CompanySwitchPinDialog.tsx`, valida `profiles.switch_pin`.
7. (Implícito) inicio de sesión con contraseña: `prefijo + PIN` contra la contraseña del Auth User.

Helper compartido de validación: `supabase/functions/_shared/pin-validation.ts` — pero sólo lo usan 1, 3, 4 y 5.

---

## 4. Dónde se escribe / resetea un PIN

| # | Escritor | Qué escribe | Qué NO escribe |
|---|---|---|---|
| 1 | RPC `reset_employee_access_pin` (panel admin, vía `src/lib/access-pin.ts`) | `access_pin` + hash de **una** ficha | contraseña de autenticación, otras fichas, `switch_pin`, bloqueo por teléfono |
| 2 | RPC `set_employee_access_pin` | igual que arriba | igual que arriba |
| 3 | `employee-auth` acción `provision` | ficha + hash + contraseña de autenticación + limpia bloqueo | otras fichas, `switch_pin` |
| 4 | `employee-auth` acción `change-pin` | ficha resuelta por `user_id` (`maybeSingle()` sobre varias fichas) + contraseña | otras fichas, `switch_pin` |
| 5 | `employee-auth` acción `activate` (línea ~437) | `access_pin` de la ficha activada | resto |
| 6 | `employee-auth` acción `sync-pins` | sobrescribe **la contraseña de autenticación** con el `access_pin` de una ficha arbitraria por usuario | — |
| 7 | Altas: `bulk-portal-invite` (~235), `approve-application` (~235/280, usa últimos 4 del teléfono), `src/pages/JoinCompany.tsx` (~101, PIN por defecto desde el cliente), `seed-test-users` | `access_pin` nuevo | resto |
| 8 | `set_switch_pin()` desde `CompanySwitchPinDialog.tsx` (línea ~80) | `profiles.switch_pin` **con el primer PIN que el usuario teclee**, y nunca se vuelve a actualizar | todo lo demás |

El escritor #8 es la causa directa del Caso A: el PIN de cambio de compañía queda **congelado para siempre** en el primer valor tecleado, aunque el PIN de acceso cambie después.

---

## 5. Dónde un cambio de teléfono puede crear otra identidad

1. El correo interno del Auth User se calcula una única vez: `emp_<telefono_normalizado>@employee.internal`. Al cambiar el teléfono en la ficha, ese correo **no se migra** → el Auth User conserva el teléfono viejo en su identidad.
2. `getPhoneLookupVariants()` busca fichas por texto de teléfono. Si el nuevo teléfono coincide con la ficha de otra persona/tenant, el login puede resolver otra ficha.
3. `auth_rate_limits` se indexa por **texto** de teléfono, no normalizado: hay filas `3476399595`, `13476399595` y `03476399595` para la misma persona. Un bloqueo puede quedar "escondido" en una variante.
4. Una persona con teléfono nuevo puede coincidir con un perfil administrativo distinto que ya usa ese teléfono (ver Caso A: dos Auth Users con el mismo `phone_number`).

---

## 6. Código que consulta el PIN de empleado ANTES del Auth User

Todo el login lo hace: `employee-auth/login` busca `employees` por teléfono, elige ficha y valida el PIN **antes** de existir cualquier Auth User. También `kiosk-clock`, `front-desk-checkin`, `bulk-portal-invite` y `resolve-applicant-identity` (que trata `access_pin` como señal de portal). El Auth User se crea o repara *después* del PIN, no antes.

---

## 7. Caso A — Jorge Cortés

| Dato | Valor |
|---|---|
| Teléfono antiguo | 3476399595 |
| Teléfono actual (ficha y perfil) | 7187515197 |
| Auth User de portal | `e5495b59-…7b1ccb`, correo **`emp_3476399595@employee.internal`** (teléfono ANTIGUO) |
| Segundo Auth User con el MISMO teléfono actual | `2bf0401f-…4860` (`jwc.cortes@gmail.com`, "Desarrollador"), `phone_number = 7187515197` |
| Fichas de empleado | `482e78ca…` (Quality, activa, PIN **6163**, `must_change_pin = true`) · `340db246…` (My Staff, activa, PIN **6163**) · `cbd94ddb…` (compañía demo `0b58f1d4…`, sin teléfono, PIN **1234**) |
| Membresías | `company_users`: Quality (company_owner) + My Staff (company_owner) |
| `profiles.switch_pin` | **9595** ← el PIN histórico del teléfono viejo |
| `profiles` del segundo usuario | `switch_pin = 7678` ← un cuarto valor |
| PIN que usa realmente el login | 6163 (ficha elegida por teléfono) |
| PIN que pide el cambio de compañía | 9595 (o 7678 según con qué usuario esté la sesión) |

**Explicación exacta del síntoma:** el PIN de acceso (6163) y el PIN de cambio de compañía (9595, congelado desde el teléfono antiguo) son **dos credenciales distintas en dos tablas distintas**. Ningún reset toca la segunda. Además existen dos Auth Users con el mismo teléfono actual, cada uno con su propio `switch_pin`, de modo que "aparece otro PIN" según qué sesión esté activa. Ninguna ficha tiene `access_pin_hash`, así que Jorge depende del PIN en texto plano.

---

## 8. Caso B — Duván Gallego

| Dato | Valor |
|---|---|
| Teléfono | 3472031873 |
| Auth User | `4338b336-…5645`, correo `emp_3472031873@employee.internal`, **sin inicios de sesión** |
| Ficha Quality | `4d603205-…bfbf5f`, activa, PIN **1362**, con hash bcrypt, `pin_set_at = 2026-08-13 03:17` |
| Ficha My Staff | `cad09ca0-…92cd`, activa, PIN **6006**, sin hash, `pin_set_at = 2026-08-12 17:37` |
| Ficha demo | `3f5f21d3-…3e27e2` (compañía `0b58f1d4…`, sin teléfono), PIN **1234** |
| Membresías | `company_users`: Quality (admin) + My Staff (admin) |
| `profiles.switch_pin` | ausente |
| Bloqueo activo | `auth_rate_limits`: teléfono `3472031873`, **6 intentos fallidos**, `locked_until = 2026-08-13 03:31:57 UTC` |

**Explicación exacta del síntoma:** el PIN nuevo (1362) está correctamente escrito en la ficha de Quality, pero:
1. El reset desde el panel usa la RPC, que **no limpia el bloqueo por teléfono**; el login se rechaza en la puerta de bloqueo antes de mirar el PIN (hasta 03:31:57 UTC).
2. Aunque no hubiese bloqueo, existen **dos PIN válidos distintos** para la misma persona (1362 en Quality, 6006 en My Staff): el que "funciona" depende de qué ficha elija el login.
3. Su ficha de My Staff no tiene hash, así que las dos fichas ni siquiera validan por el mismo camino.

---

## 9. Divergencia a nivel de plataforma (no sólo estos dos casos)

- **6 teléfonos activos** tienen dos fichas con **PIN distinto** para la misma persona: `3472031873`, `3473358615`, `3476783647`, `3477765508`, `9102185888`, `9296213479`.
- **13 Auth Users** están enlazados a más de una ficha de empleado, por lo que `change-pin` (que resuelve con `maybeSingle()`) escribe en una ficha indeterminada o falla.
- **6 perfiles** tienen `switch_pin`, un PIN paralelo que ningún reset actualiza.
- `auth_rate_limits` contiene variantes no normalizadas del mismo teléfono (`3476399595`, `13476399595`, `03476399595`).

---

## 10. Conclusión

El dominio AUTH no está cerrado. La credencial está **modelada al nivel equivocado**: pertenece al empleado (por compañía) cuando debería pertenecer a la persona (Auth User). Mientras el PIN viva en la ficha, cada compañía, cada alta y cada cambio de teléfono seguirán generando una credencial más.

Para cerrarlo definitivamente hace falta (fuera del alcance de esta auditoría, que es solo lectura):
1. Una única credencial por persona, guardada una sola vez y sólo como hash.
2. Un único escritor y un único validador, usados por portal, quiosco y recepción.
3. Eliminar `profiles.switch_pin` como credencial separada; el cambio de compañía debe verificar la credencial única.
4. Normalizar el teléfono al escribir y al bloquear, y migrar la identidad de autenticación cuando el teléfono cambie.
5. Que todo reset invalide el bloqueo por teléfono de la persona, no de una variante de texto.
