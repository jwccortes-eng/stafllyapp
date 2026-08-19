---
name: Recuperación verificada de PIN
description: Flujo único de recuperación tras bloqueo por intentos fallidos; código por correo, token de un solo uso, PIN creado por la persona
type: feature
---

El lockout canónico (`auth_pin_credentials`) NUNCA se relaja para mejorar UX.
La única salida ante bloqueo es la recuperación verificada:

1. `recovery-start` (edge `employee-auth`) → `internal_start_pin_recovery`: código de 6 dígitos
   al correo de la ficha. Límite 3/15 min + 60 s de espera. Nunca revela si la cuenta existe.
2. `recovery-verify` → `internal_verify_pin_recovery`: máx. 5 intentos, vigencia 10 min,
   devuelve token de un solo uso (sha256 en base).
3. `recovery-complete` → `internal_complete_pin_recovery`: fija el PIN por el escritor único
   `internal_set_auth_pin`, lo que limpia bloqueo y alias telefónicos.

Reglas duras: el admin solo puede **iniciar** la recuperación (`recovery-admin-start` +
`admin_can_recover_employee`); nunca ve ni crea el PIN. Códigos, tokens y PIN jamás en logs.
`auth_recovery_requests` es invisible desde la app (RLS false para anon/authenticated).
Documentación: `docs/qa/P0_PIN_LOCKOUT_VERIFIED_RECOVERY.md`.
