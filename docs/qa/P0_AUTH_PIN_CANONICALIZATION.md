# P0 — AUTH PIN CANONICALIZATION (Single Source of Truth)

## Contrato

**1 persona = 1 Auth User = 1 PIN = 1 bloqueo.**

El PIN pertenece al Auth User, no a la ficha de empleado ni a la compañía.
Cambiar de compañía no vuelve a pedir PIN.

## Modelo canónico

| Elemento | Rol |
|---|---|
| `auth_pin_credentials` | Única credencial (hash del PIN, intentos fallidos, bloqueo) |
| `set_auth_pin` / `internal_set_auth_pin` | Únicos escritores (limpian bloqueos y alias telefónicos legacy) |
| `internal_verify_auth_pin` | Único validador |
| `admin_reset_auth_pin` / `admin_set_auth_pin_for_employee` | Acciones administrativas auditadas |
| `auth_pin_migration_review` | Casos ambiguos enviados a revisión humana |

## Escritores retirados

- `employees.access_pin` y `access_pin_hash`: ya no se escriben en activación, provisión, aprobación de aplicación ni invitación masiva.
- `internal_dual_write_pin_hash`: sin llamadas desde funciones de acceso.
- `profiles.switch_pin`: neutralizado (`has_switch_pin` → false, `verify_switch_pin` → true).
- Acción `sync-pins` de `employee-auth`: responde 410 (propagaba el PIN de una ficha arbitraria).
- `pin-qa-validate`: responde 410 (validador paralelo).

## Validadores unificados

| Superficie | Antes | Ahora |
|---|---|---|
| Login portal (`employee-auth`) | PIN de ficha + hash + modo dual | `verifyCanonicalPin` |
| Kiosco (`kiosk-clock`) | `validatePinDual` sobre ficha | `verifyCanonicalPin` |
| Front desk (`front-desk-checkin`) | `validatePinDual` sobre ficha | `verifyCanonicalPin` |
| Cambio de PIN propio | Comparación en texto plano contra ficha | `verifyCanonicalPin` + `setCanonicalPin` |
| Cambio de compañía | Diálogo de PIN (`profiles.switch_pin`) | Sin PIN; la membresía ya está resuelta |

## Reset de PIN

`admin_reset_auth_pin` es atómico: fija la credencial, borra `failed_attempts`/`locked_until`
y limpia `auth_rate_limits` para todos los alias telefónicos de la persona. Un reset
administrativo ya no puede dejar a alguien bloqueado.

## Casos cerrados

- **Jorge Cortés:** una sola credencial (6163). El PIN legacy congelado en `profiles.switch_pin` (9595) quedó neutralizado y el cambio de compañía ya no lo consulta.
- **Duván Gallego:** credencial única fijada en 1362 desde la revisión de migración; el bloqueo telefónico que interceptaba su login se limpió en la misma operación. El PIN divergente de MyStaff (6006) dejó de ser válido.

## Pendiente de revisión humana

13 casos abiertos en `auth_pin_migration_review` (PINs en conflicto, teléfonos con
múltiples variantes, teléfonos compartidos por dos Auth Users). Se resuelven uno a uno
con `internal_set_auth_pin`; ninguno bloquea el acceso de terceros.
