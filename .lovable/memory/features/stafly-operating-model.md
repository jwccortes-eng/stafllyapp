---
name: Stafly Operating Model
description: Cadena operativa de 8 etapas y responsabilidades canónicas; capa de experiencia sobre roles/permisos, sin infraestructura nueva
type: feature
---

Fuente única: `src/lib/auth/operating-model.ts` (`OPERATING_CHAIN`,
`RESPONSIBILITIES`, `operatingChainFor`, `companyOperatingFlow`,
`uncoveredStages`, `visibleAliases`). Es **solo lectura**: no autoriza nada.
La autorización sigue siendo `usePermissions` / `evaluatePermission` /
`public.has_permission`, y el guardado sigue siendo `admin_set_user_access`.

Cadena (misma en todas las empresas, solo cambian las personas):
Cliente → Servicio → Programación → Operación → Control de horas →
Preparación de payroll → Aprobación final → Pago.

Reglas de lenguaje: la UI habla de **responsabilidades y entregas**, nunca de
jerarquía. Cada rol declara misión, qué controla, qué entrega, de quién recibe,
a quién entrega, qué NO le corresponde y su foco al iniciar sesión.

Superficies: `ResponsibilityCard` (perfil en `/app/permissions` → Usuarios) y
`CompanyOperatingModel` (pestaña "Modelo operativo"). Prohibido crear un
dashboard o consola paralela: el Command Center ya filtra por permisos.

Service Supervisor es un rol técnico único; Supervisor / Captain / Headwaiter
son alias visibles.

Referencia: `docs/qa/P2_STAFLY_OPERATING_MODEL_IMPLEMENTATION.md`.
