# Change Intelligence — F1.2 Etapa 1 · Ventana 24–48 h

Estado: **ventana ABIERTA**. Documento vivo; se completa al cerrar la ventana.

## 0. Brecha detectada y cerrada antes de activar

El flag F1.2 era global (localStorage) y no permitía activación exacta por compañía.
Según la condición del punto 3, se detuvo la activación y se cerró la brecha:

- `src/lib/change-intelligence/flags.ts`: `getDurableCompanyAllowlist / setDurableCompanyAllowlist / isDurableCompanyAllowed`.
  Lista vacía = ninguna compañía observada. Sin fallback por entorno, sin fallback por rol.
- `src/lib/change-intelligence/observation/durable-sink.ts`: corta la persistencia si `row.company_id` no está en la lista.
- `src/components/change-intelligence/DurableObservationPanel.tsx`: campo explícito para escribir los ids activados.

La activación requiere ahora **tres condiciones simultáneas**: flag de observación ON, flag durable ON,
company id en la lista local **y** fila vigente en `ci_pilot_allowlist` (verificada en la Edge Function).

## 1. Autorizaciones vigentes

**Staff lector** (`ci_platform_allowlist`)

| Campo | Valor |
|---|---|
| user_id | `2bf0401f-7c8a-4017-b3bd-033935e34860` |
| roles de plataforma | `developer`, `founder` (no manager de tenant, no admin de compañía) |
| alcance | lectura de `ci_*` únicamente |
| inicio | 2026-07-30 16:35 UTC |
| expira | 2026-08-01 16:35 UTC (48 h, revocable) |
| autorizado por | Product Owner (esta aprobación) |
| propósito | F1.2 Stage 1 demo observation |

**Compañía piloto** (`ci_pilot_allowlist`)

| Campo | Valor |
|---|---|
| company_id | `d3500000-0000-4000-8000-000000000001` (Stafly Demo) |
| etapa / entorno | 1 / `demo` |
| límite diario | 500 (degrada a agregados al superarse) |
| activado por | mismo user_id |
| expira | 2026-08-01 16:35 UTC |
| motor / adapter | `ci-engine@1.0.0` / `scheduling@1` |

Ninguna compañía productiva autorizada. Ningún otro usuario en allowlist.

## 2. Evidencia de control de acceso

Inventario de políticas (`pg_policies`, tablas `ci_*`): **6 políticas, todas `SELECT` para `authenticated`**,
más una `INSERT` solo en `ci_observation_reviews`. No existe política de INSERT/UPDATE/DELETE sobre
`ci_observations`: ningún cliente puede insertar ni alterar el registro original, ni siquiera el staff.

| Caso | Evidencia |
|---|---|
| Staff autorizado | `ci_can_read_observations('2bf0401f…') = true` → lee `ci_*`; sin política de escritura sobre `ci_observations` |
| Usuario no autorizado | `ci_can_read_observations('00000000-…-999') = false` → SELECT devuelve vista vacía; sin INSERT; el panel lo bloquea con `ObservationAccessGuard` |
| Anon (REST real) | GET `ci_observations` / `ci_pilot_allowlist` / `ci_platform_allowlist` → `[]`; POST → `42501 new row violates row-level security policy`; RPC `ci_purge_expired_observations` → `42501 permission denied for function` |

Limitación declarada: los casos A y B se verificaron a nivel de política y de función de autorización;
no se ejecutó login real porque la sesión de preview está `signed_out`. Pendiente de confirmación visual
en el panel al iniciar la ventana.

## 3. Configuración del flag

- Global: **OFF**.
- ON manual únicamente para `d3500000-0000-4000-8000-000000000001`.
- Sin activación por entorno, por rol ni automática al iniciar sesión.
- Hora de activación de la allowlist de base de datos: 2026-07-30 16:35 UTC.
- Responsable: staff `2bf0401f-7c8a-4017-b3bd-033935e34860`.
- Versiones: motor `ci-engine@1.0.0`, adapter `scheduling@1`.

## 4. Prueba de humo (10 casos)

Ejecutada de forma determinística sobre el pipeline completo motor → fila durable
(`src/lib/change-intelligence/__tests__/stage1-smoke.test.ts`): **14/14 verdes**.

| # | Caso | Escenario | Resultado |
|---|---|---|---|
| 1 | Cambio de hora | A1 | pass |
| 2 | Cambio de fecha | B | pass |
| 3 | Cambio de ubicación | C | pass |
| 4 | Trabajador agregado | D | pass |
| 5 | Trabajador removido | E | pass |
| 6 | Reemplazo consolidado | F | pass, un solo evento correlacionado |
| 7 | Cancelación | G | pass |
| 8 | Cambio Nivel 0 | N | pass |
| 9 | Manager unresolved | L | pass, audiencia = `{assigned: 1}`, sin fallback ampliado |
| 10 | Persona unreachable | M | pass |

Controles verificados en cada caso: `observation_only = true`, entorno `demo`, etapa 1,
ausencia total de claves de delivery, `privacy_gate = pass` sin hallazgos, identidad estable por
`event_id` (sin duplicados), muestreo determinístico, y persistencia limitada a la compañía activada.

Pendiente al iniciar la ventana: repetir los 10 casos como operaciones reales en la UI demo para
confirmar que la operación de negocio se guarda normalmente, que la UI no se bloquea y que la fila
aparece en el panel (requiere sesión iniciada del staff).

## 5–6. Ventana y monitoreo

Ventana prevista: 2026-07-30 16:35 UTC → 2026-08-01 16:35 UTC (máx. 48 h).
Monitoreo mínimo (a completar): errores de Edge Function, rechazos por esquema/PII, descartes por volumen,
degradación a agregados, duplicados, latencia, errores de RLS, crecimiento de tablas, calidad de mensajes,
unresolved, unreachable y diferencia contra legacy.

Criterios de aborto vigentes tal como fueron aprobados. Ante cualquiera: apagar flag, conservar evidencia,
sin reintento automático, documentar causa, no avanzar a Etapa 2.

## 7. Métricas finales

Pendientes hasta el cierre de la ventana (puntos 1–30 del reporte): totales de operaciones,
observaciones persistidas, degradadas, rechazadas, duplicados evitados, interrupciones legacy vs CI,
reducción de ruido, unresolved, unreachable, reemplazos consolidados, gates, falsos positivos/negativos,
errores de acceso y persistencia, impacto operativo, capturas del panel y recomendación final.

Ya probados por anticipado:
- borrado por compañía: `ci_delete_company_observations` → 2 observaciones borradas, agregados conservados;
- retención: `ci_purge_expired_observations` → 1 observación (>30 d) y 1 agregado (>90 d) eliminados;
- apagado del flag: lista de compañías vacía ⇒ `isDurableCompanyAllowed` = false para la demo (test verde);
- revocación de staff: `enabled=false` o `expires_at` vencido ⇒ `ci_can_read_observations` = false (misma función ya validada).

## 8. Cierre

Al terminar: apagar el flag, expirar la allowlist de staff y del piloto, verificar que no se generan
nuevas observaciones, ejecutar borrado por compañía, conservar solo evidencia aprobada.
No avanzar a Etapa 2 sin aprobación explícita.
