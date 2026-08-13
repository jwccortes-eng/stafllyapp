---
name: Multi-company auth access truth
description: Separación AUTH / MEMBERSHIP / EMPLOYEE en login por teléfono; una empresa inactiva nunca borra la identidad global
type: feature
---

Tres dimensiones independientes, nunca fusionadas en una sola consulta:

1. **AUTH** — quién eres: identidad por teléfono (todas las fichas, activas e inactivas, incluidas sombras fusionadas).
2. **MEMBERSHIP** — a qué compañías entras: fichas vivas con `is_active = true`.
3. **EMPLOYEE** — estado interno dentro de cada compañía.

Regla: un estado inactivo en UNA compañía no puede bloquear el acceso global si existe otra compañía activa. Nunca filtrar por `is_active` al resolver identidad.

Resolver único: `supabase/functions/_shared/multi-company-access.ts` (`resolveMultiCompanyAccess`), reexportado en `src/lib/auth/multi-company-access.ts`. Consumido por `employee-auth` en `check`, `activate` y `login`.

Resultados: `no_identity` (cuenta inexistente), `requires_activation`, `access_granted`, `access_disabled` (identidad válida sin ninguna empresa activa — mensaje distinto a "no account linked"). Las fichas fusionadas aportan identidad pero nunca acceso; el PIN se valida sólo contra fichas activas.
