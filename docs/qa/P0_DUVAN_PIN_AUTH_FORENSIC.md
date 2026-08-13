# P0 — DUVÁN PIN AUTH FORENSIC

**Fecha de observación:** 2026-08-13 03:22 UTC  
**Alcance:** auditoría forense de solo lectura. No se modificaron datos, PIN, autenticación, permisos, fichas, membresías ni datos operativos.  
**Confidencialidad:** el PIN y los hashes no se reproducen. Las comprobaciones se hicieron por igualdad criptográfica.

---

## 1. Conclusión ejecutiva

El PIN recién generado sí quedó correctamente escrito en la ficha de **Quality Staff** que el login seleccionaría, tanto en texto legacy como en hash bcrypt. Sin embargo, el intento posterior no llegó a resolver usuario, ficha ni PIN: fue rechazado antes por un bloqueo activo asociado al **teléfono normalizado** en `auth_rate_limits`.

La causa exacta del rechazo inmediato fue esta secuencia:

1. **03:16:57 UTC:** un intento fallido dejó `failed_attempts = 6` y `locked_until = 03:31:57 UTC`.
2. **03:17:38 UTC:** el panel generó el nuevo PIN sobre la ficha Quality mediante `reset_employee_access_pin`.
3. Ese RPC actualizó el PIN y el hash de la ficha, pero **no eliminó ni reinició** `auth_rate_limits`.
4. **03:17:57 UTC:** el portal recibió otro intento, ejecutó primero `checkRateLimit()` y devolvió bloqueo. No ejecutó el resolver multi-company ni ninguna comparación de PIN.

Por tanto, para este intento concreto, no hubo un bcrypt incorrecto ni un segundo `auth_user_id`: el PIN nuevo nunca fue evaluado.

---

## 2. Cadena de identidad encontrada

### Teléfono → fichas

El portal normaliza el teléfono a 10 dígitos y consulta `employees.phone_number` con las variantes de 10 y 11 dígitos (`employee-auth/index.ts:195-210`, `645-664`). La consulta devolvió dos fichas vivas:

| Empresa | `employee_id` | `auth_user_id` | Activa | Portal |
|---|---|---|---:|---:|
| Quality Staff by Keury | `4d603205-6937-4159-897e-b3fcd44fbf5f` | `4338b336-0f65-4285-9d50-6abcc28e5645` | sí | habilitado |
| My Staff Solution LLC | `cad09ca0-065e-4e4b-a6ab-58582592c9cd` | `4338b336-0f65-4285-9d50-6abcc28e5645` | sí | deshabilitado |

No existe divergencia de `auth_user_id`: ambas fichas apuntan al mismo usuario.

### Membresías

El mismo `auth_user_id` tiene estas dos membresías:

| Empresa | Rol |
|---|---|
| Quality Staff by Keury | `admin` |
| My Staff Solution LLC | `admin` |

Las membresías no participan en la comparación del PIN; son contexto de acceso posterior.

### Selección de ficha durante `login`

Después del rate limit, `resolveMultiCompanyAccess()` conserva ambas fichas activas (`_shared/multi-company-access.ts:67-117`). El login selecciona en este orden (`employee-auth/index.ts:683-689`):

1. primera ficha activa cuyo `access_pin` sea igual al PIN ingresado;
2. primera ficha activa que tenga PIN o hash;
3. `primaryRecord`;
4. primera ficha activa.

Con el PIN recién generado, la condición 1 es verdadera únicamente para la ficha **Quality** `4d603205-…bf5f`. Esa es la ficha que habría sido seleccionada si el intento hubiera superado el bloqueo.

---

## 3. Dónde quedó el PIN recién generado

El panel abierto en `/app/employees/4d603205-…bf5f` pasa exactamente `employee.id` a `resetEmployeePin()` (`EmployeeAccessTab.tsx:142-150`). El helper llama `reset_employee_access_pin(_employee_id)` (`src/lib/access-pin.ts:35-42`).

La auditoría registró:

| Campo | Evidencia |
|---|---|
| Acción | `reset_access_pin` |
| Timestamp | **2026-08-13 03:17:38.709696 UTC** |
| Actor | administrador `2bf0401f-…4860` |
| Ficha actualizada | Quality `4d603205-…bf5f` |
| Escritura | `access_pin` + `access_pin_hash` + `pin_hash_version='bcrypt'` + `pin_set_at` |
| Resultado plaintext | coincide con el PIN recién generado |
| Resultado bcrypt | `crypt(PIN, access_pin_hash) = access_pin_hash` → **true** |

La ficha MyStaff `cad09ca0-…92cd` no fue modificada por ese reset: conserva otro `access_pin`, no tiene `access_pin_hash` y no coincide con el PIN recién generado.

El RPC de reset actualiza solamente `employees WHERE id = _employee_id`; no propaga el valor a las demás fichas del mismo `user_id` y no toca `auth_rate_limits`.

---

## 4. Qué valida realmente el login

### Orden real

El orden de `action='login'` es:

```text
normalizar teléfono
→ checkRateLimit(teléfono)
→ consultar fichas employees por teléfono
→ resolveMultiCompanyAccess
→ seleccionar employee
→ validar PIN de ese employee
→ resetear rate limit
→ sincronizar contraseña puente del auth user
→ crear sesión
```

Evidencia: `employee-auth/index.ts:645-665`, `666-689`, `699-774`, `777-873`.

### Fuente de PIN por tenant

Quality y MyStaff no son el tenant demo autorizado para modo hash; `resolvePinAuthModeSafe()` fuerza `effective='legacy'` (`employee-auth/index.ts:9-56`). En modo legacy el login compara directamente:

```ts
employee.access_pin === pin
```

(`employee-auth/index.ts:762-770`). Por tanto, en este caso productivo el bcrypt no decide el acceso. El hash existe y coincide, pero el gate efectivo sigue leyendo `employees.access_pin` de la ficha seleccionada.

El bcrypt se usa solo en los modos demo `dual` / `hash_only_ready`: `validatePinDual()` llama `internal_verify_pin_hash(_employee_id, _pin)`, que lee `employees.access_pin_hash` de ese mismo ID (`_shared/pin-validation.ts:84-99`, `181-193`).

### Resultado del intento de 03:17:57

Los logs muestran únicamente:

```text
[phone-login] normalizedPhone=… hasPin=true step=login
```

No aparece `login_access_truth`, `pin-auth-mode`, `pin-auth-validate` ni `login_sign_in`. Eso coincide exactamente con el retorno anticipado de `checkRateLimit()` en `employee-auth/index.ts:650-655`.

Para ese intento:

| Dato solicitado | Resultado comprobado |
|---|---|
| `auth_user_id` usado durante authenticate | ninguno; no se alcanzó resolución |
| `employee_id` usado durante authenticate | ninguno; no se alcanzó selección |
| `pin source` | ninguno; no se leyó PIN |
| bcrypt compare | no ejecutado |
| resultado | bloqueado por teléfono antes de autenticar |

---

## 5. Verdad del bloqueo

Fila observada a las **03:22:00 UTC**:

| Tabla | Clave lógica | `failed_attempts` | `last_attempt_at` | `locked_until` | Activo al observar |
|---|---|---:|---|---|---:|
| `auth_rate_limits` | teléfono normalizado | **6** | 2026-08-13 03:16:57.647 UTC | 2026-08-13 03:31:57.647 UTC | sí |

El bloqueo no pertenece al auth user, employee ni membership. Pertenece a una fila separada de `auth_rate_limits` identificada por `phone_number` (`employee-auth/index.ts:80-108`, `111-158`).

Cada fallo incrementa el contador; desde 5 intentos se fija un bloqueo de 15 minutos. Un login válido elimina la fila, pero esa eliminación ocurre **después** de validar el PIN (`employee-auth/index.ts:160-165`, `774`).

---

## 6. Reset PIN: escrituras reales y divergencias

Existen dos operaciones distintas en la misma pestaña administrativa:

### “Generar PIN”

`generateRandomPin()` usa solo `reset_employee_access_pin` (`EmployeeAccessTab.tsx:142-150`). Escribe:

- `employees.access_pin` de la ficha abierta;
- `employees.access_pin_hash` de la ficha abierta;
- metadatos del hash;
- una fila de auditoría.

No escribe:

- otras fichas con el mismo `user_id`;
- contraseña puente del usuario de autenticación;
- `auth_rate_limits`.

### “Guardar PIN” manual

`handlePinChange()` usa `set_employee_access_pin` y luego intenta sincronizar la contraseña puente mediante `admin-reset-password` (`EmployeeAccessTab.tsx:105-139`). Tampoco limpia el rate limit.

### Ruta `employee-auth action='provision'`

Existe una tercera ruta que sí escribe el PIN de la ficha, hash, contraseña puente y además elimina el rate limit (`employee-auth/index.ts:952-978`). Esa no es la ruta usada por el botón “Generar PIN” del perfil.

### Contraseña puente

El usuario de autenticación no tenía, al momento de la auditoría, una contraseña equivalente al PIN recién generado. Esto no explica el mensaje inmediato de bloqueo: tras superar el PIN gate, el flujo normal de login actualiza la contraseña puente con el PIN ingresado antes de `signInWithPassword()` (`employee-auth/index.ts:804-805`, `840-854`). En el intento auditado nunca se llegó a esa fase.

---

## 7. Búsqueda de lectores legacy

Se confirmó que el login productivo aún lee directamente `employees.access_pin`:

- selección preferente por igualdad: `employee-auth/index.ts:686`;
- gate legacy: `employee-auth/index.ts:764`;
- activación y provisión también escriben/leen `access_pin` en la misma función.

No se encontraron columnas `employee_pin`, `portal_pin`, `legacy_pin` ni `company_pin` en la cadena de login auditada. La columna real es `employees.access_pin`, por ficha y por compañía; no existe hoy una credencial PIN almacenada en un registro canónico de auth user.

---

## 8. Respuestas QA

**✔ ¿Qué registro valida el login?**  
Después del rate limit, valida la ficha activa seleccionada por coincidencia de `employees.access_pin`. Con el PIN recién generado, habría sido Quality `4d603205-…bf5f`.

**✔ ¿Qué registro actualiza Reset PIN?**  
Exclusivamente la ficha abierta en el panel: Quality `4d603205-…bf5f`.

**✔ ¿Ambos son el mismo?**  
Sí, para el PIN recién generado y una vez superado el rate limit, la ficha actualizada y la ficha seleccionable por igualdad son la misma. El PIN y su bcrypt coinciden en esa ficha.

**✔ ¿Dónde divergen?**  
La divergencia causal no estuvo entre dos fichas durante el intento de 03:17:57. Estuvo entre subsistemas: Reset PIN actualizó la credencial de `employees`, pero dejó intacto el bloqueo por teléfono en `auth_rate_limits`. Además, dejó sin sincronizar la ficha MyStaff y la contraseña puente, aunque ninguna de esas dos diferencias fue la causa del rechazo inmediato.

**¿Por qué un PIN recién generado desde el panel no sirvió para iniciar sesión?**  
Porque el teléfono ya estaba bloqueado hasta las 03:31:57 UTC y el botón “Generar PIN” no limpia ese bloqueo. El intento de las 03:17:57 terminó en `checkRateLimit()` antes de consultar fichas o comparar el PIN. La evidencia confirma que el PIN recién generado sí estaba correctamente guardado y que su bcrypt era válido en la ficha Quality.

---

## 9. Veredicto forense

**Causa raíz demostrada:** estado de bloqueo por teléfono desacoplado del reset administrativo de PIN.  
**No causa del intento auditado:** PIN mal escrito, bcrypt incorrecto, `auth_user_id` alterno o selección de la ficha MyStaff.  
**Cambios ejecutados:** ninguno.