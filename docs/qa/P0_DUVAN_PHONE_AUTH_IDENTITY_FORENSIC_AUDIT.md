# P0 — Duván Gallego · Auditoría forense teléfono / identidad de acceso

**Modo:** SOLO LECTURA. Sin resets, sin cambios de auth, empleados ni PIN.
**Teléfono auditado:** 3472031873
**Fecha:** 2026-08-12 (UTC)

---

## 1. Ocurrencias del teléfono

Búsqueda normalizada (solo dígitos, variantes con y sin prefijo 1) sobre empleados, vínculo de portal/auth y alias:

| Employee UUID | Nombre | Empresa | Email | user_id (auth) | is_active | identity_status | merged_into | PIN configurado | Portal habilitado | must_change_pin | Creado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4d603205-6937-4159-897e-b3fcd44fbf5f | Duvan Gallego | Quality Staff (0000…0001) | duvangallego@qualitystaff.co | 4338b336-0f65-4285-9d50-6abcc28e5645 | **false** | verified | — | sí (texto) | true | true | 2026-02-25 |
| cad09ca0-065e-4e4b-a6ab-58582592c9cd | Duvan Gallego | MyStaff (37f9…9ed9) | duvangallego@qualitystaff.co | 4338b336-0f65-4285-9d50-6abcc28e5645 | **true** | verified | — | sí (texto + hash) | false | false | 2026-03-19 |

- No existen otros registros con ese teléfono (ni variantes formateadas, ni con prefijo 1).
- No hay alias telefónicos asociados a ese número.
- No hay filas en `profiles` con ese teléfono ni login por teléfono de administrador configurado.
- Ambos registros apuntan al **mismo** usuario de autenticación: `4338b336-0f65-4285-9d50-6abcc28e5645`.
- Membresías del mismo usuario: `admin` en Quality Staff y `admin` en MyStaff. Rol global: `supervisor`.
- El email en MyStaff está desactualizado (`@qualitystaff.co` en lugar de `@mystaffsolution.co`). No afecta el login por teléfono.

## 2. Resolución real del login

El servicio de acceso por teléfono filtra empleados por teléfono **e `is_active = true`**, y prioriza el registro cuyo PIN coincide, luego el primero con PIN.

- Registro Quality Staff: inactivo → **excluido** de la resolución.
- Registro MyStaff: activo → **es el único candidato**, y es el PIN que se está validando.
- Los dos registros tienen **PIN distinto** (verificado por comparación, sin exponer valores).

## 3. Origen de las iniciales “EP”

“EP” **no es una identidad**. Es una constante escrita a mano en el componente de acceso (`src/components/auth/EmployeeAuthFlow.tsx`, `const initials = "EP"`). La pantalla de PIN no consulta el nombre del trabajador (el endpoint de verificación devuelve solo `found` / `requires_activation` para no filtrar PII), así que siempre muestra el mismo marcador para cualquier persona. No corresponde a ningún empleado y no indica identidad equivocada.

## 4. Estado del bloqueo

| Teléfono | Intentos fallidos | Bloqueado hasta | Último intento |
|---|---|---|---|
| 3472031873 | 5 | 2026-08-12 17:52:33 UTC | 2026-08-12 17:37:33 UTC |

Bloqueo temporal de nivel 1 (15 minutos), no permanente. Expira solo; a los 10 intentos pasa a 60 minutos y a los 20 a bloqueo permanente.

## 5. Respuestas

1. **¿3472031873 resuelve a Duván?** Sí. Resuelve al registro activo de Duván Gallego en MyStaff (`cad09ca0…`). El registro de Quality Staff está inactivo y no participa.
2. **¿Quién es “EP”?** Nadie. Es un texto fijo de la interfaz de la pantalla de PIN, no una identidad resuelta.
3. **¿Más de una identidad con ese teléfono?** Dos registros de empleado (uno por empresa), pero **una sola persona y un solo usuario de acceso**. No hay colisión de identidad ni auth cruzado.
4. **¿El PIN validado es el de Duván?** Sí: es el PIN del registro MyStaff de Duván. Pero **no es el mismo** que el del registro de Quality Staff, que es probablemente el que él recuerda/usa.
5. **Causa raíz.** Duván tiene dos registros de empleado con PIN distinto. El registro de Quality Staff (donde fue activado, con `must_change_pin`) quedó **inactivo**, así que el acceso por teléfono solo puede validar el PIN del registro de MyStaff. Al escribir su PIN habitual falla, y cinco intentos activaron el bloqueo de 15 minutos. La pantalla con “EP” reforzó la impresión de identidad equivocada, pero es cosmética.
6. **¿Es seguro resetear el PIN?** Sí, una vez confirmada la identidad (ya confirmada aquí). El reset debe hacerse sobre el registro **activo** `cad09ca0…` (MyStaff) y, si se quiere paridad, alinear el registro de Quality Staff. También hay que limpiar el bloqueo del teléfono o esperar a que expire. Ninguna de estas acciones se ejecutó.
7. **¿Quality Staff y MyStaff comparten el usuario canónico?** Sí. Ambos registros ya apuntan al usuario `4338b336-0f65-4285-9d50-6abcc28e5645`, con membresía `admin` en las dos empresas. **No hace falta crear una segunda cuenta**; el modelo de membresías por compañía ya cubre el acceso doble.

## 6. Auth user canónico

`4338b336-0f65-4285-9d50-6abcc28e5645` — único usuario de acceso de Duván Gallego, vinculado a los dos registros de empleado y con permisos de administrador en ambas empresas.

## 7. Observaciones para la fase de corrección (no ejecutadas)

- El registro Quality Staff está inactivo pese a que Duván sigue siendo administrador operativo allí; revisar si debe reactivarse.
- Dos registros de la misma persona con PIN divergentes: el PIN debería ser una propiedad de la persona, no del registro por empresa.
- La pantalla de PIN debería mostrar iniciales reales o ningún avatar, en lugar de la constante “EP”.
- Email desactualizado en el registro MyStaff.
