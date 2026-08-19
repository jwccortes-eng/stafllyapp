# P0 — PIN LOCKOUT VERIFIED RECOVERY

Recuperación de acceso segura cuando el PIN queda bloqueado por intentos fallidos.
Caso real: Sophia bloqueada 12 minutos justo antes de operar.

## 1. Mapa del sistema ANTES (auditoría forense)

| Elemento | Realidad |
|---|---|
| Credencial | `auth_pin_credentials`, hash bcrypt (`extensions.crypt`), pertenece al Auth User |
| Validador único | `internal_verify_auth_pin` (vía `verifyCanonicalPin`) |
| Escritor único | `internal_set_auth_pin` / `set_auth_pin` |
| Conteo de fallos | `auth_pin_credentials.failed_attempts` + `auth_rate_limits` (alias telefónicos) |
| Lockout | Tier 1: 5 fallos → 15 min · Tier 2: 10 → 60 min · Tier 3: 20 → permanente |
| Recovery existente | Ninguno. Solo reset administrativo (`admin_reset_auth_pin`) que **revela** el PIN |
| Canal verificado | Email en la ficha: 226 de 227 trabajadores activos con cuenta (99%) |
| Mensajería | `enqueue_email` → cola `transactional_emails` → `process-email-queue` |
| UI de bloqueo | `EmployeeAuthFlow.tsx` mostraba el mensaje y dejaba al worker sin salida |

Conclusión: existía identidad canónica y canal verificado, faltaba **el puente**.
No se construyó otro sistema de auth: se reutilizó el existente.

## 2. Modelo implementado

```
PIN bloqueado
   └─ "Recuperar acceso"  (o "Esperar")
        └─ código de 6 dígitos al correo de la ficha (10 min, máx 5 intentos)
             └─ token de un solo uso (10 min)
                  └─ nuevo PIN de 4 dígitos
                       └─ internal_set_auth_pin  →  bloqueo y alias limpiados
```

| Pieza | Rol |
|---|---|
| `auth_recovery_requests` | Solicitudes: hash del código, intentos, expiración, token, origen, auditoría |
| `internal_start_pin_recovery` | Emite el código (service_role). Límite: 3/15 min + 60 s de espera |
| `internal_verify_pin_recovery` | Valida el código, emite token de un solo uso |
| `internal_complete_pin_recovery` | Fija el PIN por la vía canónica y consume la solicitud |
| `admin_can_recover_employee` | Autoriza al admin a **iniciar** la recuperación (nunca a ver el PIN) |
| `_shared/pin-recovery.ts` | Enmascarado, envío del correo, mensajes operativos |
| `employee-auth` | Acciones `recovery-start`, `recovery-verify`, `recovery-complete`, `recovery-admin-start` |

## 3. Seguridad — qué NO se debilitó

- El lockout canónico sigue intacto: solo se limpia **después** de verificar identidad.
- El PIN nunca se transporta ni se muestra: lo crea la propia persona.
- El admin inicia la recuperación, no la resuelve; el código va al canal del trabajador.
- Códigos y tokens se guardan hasheados (bcrypt / sha256), nunca en logs.
- `auth_recovery_requests` es invisible desde la app (RLS `false` para anon y authenticated).
- `recovery-start` responde igual exista o no la cuenta: sin enumeración de identidades.
- Rate limit propio de recuperación (3/15 min, 60 s de espera, 5 intentos de código, 10 min de vigencia).
- Identidad canónica: se recupera el MISMO Auth User; no se crean fichas ni membresías.

## 4. QA ejecutado

| Caso | Resultado |
|---|---|
| Inicio de recuperación | `ok=true`, código emitido y encolado por correo |
| Código incorrecto | `invalid_code`, intento contabilizado |
| Código correcto | `ok=true`, token emitido |
| Token inválido en el cierre | `invalid_token` (rechazado) |
| Segunda solicitud inmediata | `cooldown` (60 s) |
| Formato de PIN inválido | `invalid_pin_format` |
| Datos de prueba | Revertidos: `auth_recovery_requests` = 0 filas |

Fix colateral: `change-pin` releía el cuerpo de la petición ya consumido y fallaba
siempre con "El nuevo PIN debe ser exactamente 4 dígitos". Corregido.

## 5. UX (mobile-first, español operativo)

- Pantalla de bloqueo con dos salidas: **Recuperar acceso** o **Esperar**.
- Enlace "¿Olvidaste tu PIN?" también en la pantalla normal de PIN.
- Teclado numérico para el código, destino enmascarado (`s•••a@g•••.com`), reenvío.
- Creación del PIN nuevo con confirmación y vuelta directa al ingreso.

## 6. Veredicto

🟢 **GO** — continuidad operativa sin bajar seguridad. Rate limit intacto, PIN nunca
visible para terceros, identidad canónica preservada.

Pendiente: canal SMS (hoy solo correo). El 1% sin correo depende del admin, que puede
registrar el correo y luego enviar la recuperación.
