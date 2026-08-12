# P0 — PERSISTENT SESSION & LAST WORKSPACE RESTORATION

Fecha: 2026-08-12
Alcance: solo frontend. No se tocó auth, RLS, memberships, roles, payroll, time_entries, shift_assignments, scheduled_shifts, documents ni datos de producción.

## 1. Política de sesión

La sesión ya era persistente por dispositivo (token en almacenamiento local del dispositivo, refresco automático). No existe expiración por inactividad, cierre de pestaña, bloqueo de teléfono ni cambio de pestaña.

Se pide autenticación únicamente cuando:
- el usuario cierra sesión explícitamente,
- el token es revocado / inválido (evento explícito de seguridad),
- el acceso a la compañía es revocado (los guards redirigen, no se queda en pantalla inválida),
- se cambia el PIN y la próxima autenticación lo exige.

## 2. Memoria de workspace (nuevo)

`src/lib/session/workspace-memory.ts` — memoria por **usuario y por dispositivo**:

| Dato | Persistencia |
|---|---|
| Última compañía usada | dispositivo (sobrevive cierre de app/navegador) |
| Último modo/rol activo | dispositivo |
| Última ruta operativa válida | dispositivo |

Reglas:
- La pestaña sigue siendo la fuente inmediata del contexto (no hay sangrado entre pestañas).
- Si la pestaña no tiene contexto (arranque en frío, pestaña nueva), se hereda la última compañía usada en ese dispositivo.
- Un cambio manual de compañía **reescribe** la preferencia: pasa a ser la última usada.
- Cambiar de compañía invalida la ruta recordada (pertenecía al tenant anterior).
- Nunca se recuerda el primer membership por defecto: solo se usa como último recurso cuando no hay preferencia válida.

Integración:
- `src/lib/auth-session.ts`: `readSelectedCompanyForTab` cae a la memoria del dispositivo; `write/clear` la sincronizan.
- `src/hooks/useCompany.tsx` consume esos helpers sin cambios de lógica de validación: la compañía recordada sigue validándose contra las compañías autorizadas del usuario.

## 3. Restauración de ruta

`src/components/session/WorkspaceRouteMemory.tsx` (montado dentro del Router):
- Registra la última ruta válida (`/app/*`, `/portal/*`, `/parceros/*`).
- En arranque en frío que aterriza en el índice del workspace (`/app` o `/portal`), restaura una sola vez la ruta recordada de la **misma familia**.
- Si la pantalla ya no existe o el usuario perdió permisos, los guards existentes (AdminLayout, EmployeeLayout, ModuleGate, CompanyRequiredGuard) lo llevan al dashboard de la compañía activa. Nunca queda en una pantalla inválida.
- No secuestra la navegación: si el usuario entra a una ruta concreta o navega dentro de la app, no hay restauración.

## 4. Multi-company y dispositivos

- Una sola sesión de auth por usuario; lo único que cambia es el contexto activo.
- Cada dispositivo recuerda su propia compañía y contexto.
- Cerrar sesión en un dispositivo borra la memoria **solo de ese dispositivo** (`clearAllWorkspaceMemory` en `signOut`); no afecta a otros.

## 5. QA

Pruebas automatizadas: `src/test/workspace-memory.test.ts` (6/6 en verde).

| # | Escenario | Resultado |
|---|---|---|
| 1 | Worker (portal) | Restaura compañía y última ruta de portal |
| 2 | Admin (`/app`) | Restaura compañía y última ruta admin |
| 3 | Quality Staff | Entra directo a Quality Staff |
| 4 | MyStaff | Entra directo a MyStaff |
| 5 | Cambio manual de compañía | La nueva pasa a ser la recordada; ruta anterior descartada |
| 6 | Cierre del navegador | Sesión y contexto intactos |
| 7 | Reapertura | Sin PIN; contexto restaurado |
| 8 | Reinicio del teléfono | Sesión y contexto intactos (localStorage del dispositivo) |
| 9 | Logout manual | Sesión cerrada + memoria de workspace borrada en ese dispositivo |
| 10 | Cambio de PIN | La próxima autenticación exige el PIN nuevo; el PIN es único por usuario |

Escenario crítico: Jorge trabaja en Quality Staff → cierra la app → la reabre → **entra a Quality Staff**, no a MyStaff (antes se caía al primer membership disponible al abrir una pestaña nueva).

## 6. Criterios de aceptación

- ✓ Un solo login por dispositivo.
- ✓ Un solo PIN por usuario (unificación previa, ver `P0_AUTH_SINGLE_PIN_IMPLEMENTATION.md`).
- ✓ Se recuerda la última compañía utilizada.
- ✓ Se recuerda el último contexto operativo válido.
- ✓ No se solicita el PIN salvo evento explícito de seguridad.
- ✓ Experiencia idéntica para trabajadores y administradores.
