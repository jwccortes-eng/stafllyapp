# P1 — Cola de distribución de recibos de nómina

Estado: **implementado. Cero escrituras en producción durante el trabajo.**
Alcance: `/app/summary` → pestaña **Recibos** (antes "Publicación de recibos").

## 1. Arquitectura reutilizada

| Capa | Fuente canónica | Reutilizada |
|---|---|---|
| Nómina aprobada | `period_base_pay` + `movements` | sí, sin tocar |
| Elegibilidad + recibo | RPC `bulk_pay_statement_preview` (STABLE, zero-write) | sí |
| Publicación | `bulk_publish_pay_statements` → `publish_pay_statement` | sí |
| Acceso al portal | `employees.user_id` vía `resolvePortalStatus` | sí |
| Invitación | `employee_invitations` + `EmployeeInviteDialog` | sí |
| Identidad | capa sombra de persona canónica (señal `activation_unlinked`) | sí, solo lectura |

Sin tablas nuevas, sin RPC nuevos, sin segundo motor de publicación.

## 2. Derivación del estado de distribución

`src/lib/payroll/receipt-distribution.ts` (puro, testeado). Un estado por
trabajador-periodo, derivado nunca copiado:

- `PUBLISHED_VISIBLE` / `PUBLISHED_NO_ACCESS` — recibo publicado, con o sin acceso real.
- `BLOCKED_PENDING_ADJUSTMENT` — movimientos pendientes en el periodo.
- `BLOCKED_PAYROLL_REVIEW` — total no calculable.
- `IDENTITY_REVIEW` — invitación aceptada sin cuenta vinculada o bloqueo de identidad/tenant.
- `NEEDS_ACCOUNT` — nómina válida, sin cuenta usable (falta de contacto **no** es duplicado).
- `READY_TO_PUBLISH` — elegible y con acceso.
- `OTHER_BLOCKER`.

`eligible` (publicable server-side) es independiente del acceso: un
`NEEDS_ACCOUNT` sigue siendo publicable, como manda la semántica actual.

## 3. KPIs de periodo

Aprobados · Listos para publicar · Bloqueados · Sin acceso · Publicados ·
Publicados sin acceso, más la línea de cierre `X / Y publicados · Z visibles`.
Todos derivados de datos canónicos para la empresa y el periodo seleccionados.
Ningún número del informe anterior quedó escrito en código.

## 4. UX de la cola

Escritorio: tabla operativa (Trabajador, Total aprobado, Estado del recibo,
Cuenta/acceso, Bloqueo, Acción). Móvil: cards compactas con nombre, monto,
chips de estado, texto del bloqueo y una sola acción principal. Sin gráficos.
Filtros: Todos / Listos / Bloqueados / Sin cuenta / Identidad / Publicados /
Publicados sin acceso. Cada KPI aplica su filtro exacto (no hay KPI muerto).

## 5. Enrutado de bloqueos

| Problema | Destino exacto |
|---|---|
| Ajuste pendiente | `/app/summary/detail?employeeId=…&periodId=…` (trabajador + periodo) |
| Identidad | perfil canónico de la persona `/app/employees/:id` |
| Sin cuenta | diálogo canónico de invitación |
| Publicado | recibo del trabajador en ese periodo |

Nunca se envía al operador al módulo genérico de Ajustes.

## 6 y 7. Activación de cuenta e invitación canónica

CTA "Invitar a activar acceso" abre `EmployeeInviteDialog`, con todo su ciclo
existente (creada → abierta → auth → reclamada), verificación de contacto,
empresa y estado previo. Si ya hay invitación viva se muestra "Invitación
pendiente" y abrirla no la consume. No se crean cuentas ni Passports, no se
copian contactos. Cuando la cuenta queda vinculada, el estado cambia solo
porque `employees.user_id` deja de ser nulo.

## 8. Previsualización de publicación

"Preparar publicación" abre un diálogo con: total a congelar, elegibles
seleccionados, ya publicados (se omiten), excluidos por ajustes, revisión de
identidad, sin acceso, y la lista nominal exacta de quiénes se publicarían.
Los trabajadores sin acceso aparecen separados y explicados ("Sin acceso a
Stafly"), nunca excluidos en silencio ni invitados automáticamente.

## 9. Publicación masiva controlada

Implementada y segura: delega en el RPC canónico existente, con tenant
derivado del periodo, idempotencia (`published` → skip), auditoría en
`activity_log` y confirmación explícita con texto no ambiguo
("Publicar N recibos"). No se construyó un segundo motor.

## 10. Fallo parcial

El resultado se muestra desglosado: publicados, omitidos, bloqueados y
fallidos, con el motivo y el nombre de cada trabajador. Los recibos correctos
no se revierten por el fallo de otro.

## 11. Portal del trabajador

Sin cambios. `worker_pay_statements` sigue mostrando solo recibos publicados de
su empresa, con el total congelado y sin datos de terceros. Los reportes
históricos de Connecteam siguen conviviendo en el mismo historial de pagos.

## 12. Aislamiento de tenant

La empresa se deriva del periodo en el servidor; el cliente solo lee filas
autorizadas por RLS. Los cruces de empresa se clasifican como bloqueo, jamás
como publicables.

## 13 y 14. QA móvil y escritorio

Móvil: KPIs 2 columnas, cards, chips, un CTA por card, estados de carga, vacío
y error honestos, nombres y montos largos truncados. Escritorio: filtros,
navegación KPI → filtro, trabajador → detalle exacto, bloqueo → resolución,
invitación y previsualización verificados.

## 15. Periodos 146 / 147 / 148 (datos reales, solo lectura)

| Periodo | Aprobados | Publicados | Bloqueados por ajustes | Sin cuenta |
|---|---|---|---|---|
| 146 · 2026-08-19 → 08-25 | 26 | 0 | 2 | 2 |
| 147 · 2026-08-26 → 09-01 | 60 | 2 | 0 | 9 |
| 148 · 2026-09-02 → 09-08 | 68 | 1 | 0 | 12 |
| **Total** | **154** | **3** | **2** | **23** |

Coincide con la auditoría P0. Antes: estos huecos no eran visibles en pantalla.
Ahora se ven, se filtran y cada uno tiene una acción de resolución.
Jorge Cortes sigue bloqueado por su movimiento pendiente y no es seleccionable;
Carlos Alvarez conserva sus valores; la diferencia explicada de $780 del
periodo 146 sigue explicada.

## 16 y 17. Integridad y datos de producción

Ningún recibo publicado fue republicado, despublicado ni recalculado. Periodos
142 y 147 intactos. Cero escrituras ejecutadas: el trabajo fue UI + una capa
derivada de solo lectura.

## 18. Regresión

`bunx vitest run`: 115 archivos, **1318 pruebas verdes** (10 nuevas).
`tsgo --noEmit` limpio.

## 19. Bloqueos restantes

- Publicar a alguien sin cuenta genera un recibo que no verá hasta activar acceso (avisado).
- Edinson Leon y Francisco Patino siguen requiriendo evidencia humana de identidad.
- La señal `PAYROLL_RECEIPTS_PENDING_DISTRIBUTION` está derivada y expuesta en la cola, pero aún no consumida por un Command Center canónico.

## 20. P1.1 recomendado

Consumir la señal desde el Command Center, permitir invitación por lotes
explícita desde el filtro "Sin cuenta", y evaluar el evento opcional de
comunicación "recibo publicado" sobre la infraestructura canónica.

## Zero-silo

La cola no es un motor de nómina, ni tabla de identidad, ni sistema de cuentas,
invitaciones, recibos o mensajería: es una proyección operativa sobre
persona canónica → relación con empresa → periodo → nómina aprobada →
elegibilidad → publicación → acceso → historial de pagos.

## Veredicto

🟢 **RECEIPT DISTRIBUTION QUEUE READY — CONTROLLED PUBLICATION SAFE**
