# STAFLY — CERTIFICACIÓN OPERATIVA CON 10 TRABAJADORES REALES

Estado: **PENDIENTE DE EJECUCIÓN**. Protocolo listo; requiere un turno real y dispositivos físicos.
Regla única: no maquillar. Lo que no se observó se registra como *no observado*, no como éxito.

---

## 1. Preflight por trabajador (antes de publicar)

| # | Worker | Identidad canónica | Portal | Assignment | Notificación | Aceptó | Ready |
|---|---|---|---|---|---|---|---|
| 1 |  |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |  |
| 4 |  |  |  |  |  |  |  |
| 5 |  |  |  |  |  |  |  |
| 6 |  |  |  |  |  |  |  |
| 7 |  |  |  |  |  |  |  |
| 8 |  |  |  |  |  |  |  |
| 9 |  |  |  |  |  |  |  |
| 10 |  |  |  |  |  |  |  |

Criterio de identidad canónica: el registro no puede tener `merged_into_employee_id`,
debe estar `is_active = true` y ser el único activo con ese nombre en el tenant.

## 2. Publicación

| Campo | Valor |
|---|---|
| Turno (código) |  |
| `published_at` |  |
| Notificación intentada |  |
| Canal (push / SMS / email) |  |
| Enviadas |  |
| Entregadas |  |
| Fallidas |  |

Publicado ≠ notificado. Se registran por separado.

## 3. Portal

Por cada worker: abrir link → ingresar → ver el turno de inmediato → aceptar o rechazar.

| Worker | Abrió | Ingresó | Vio el turno | Aceptó/Rechazó | Problema observado |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## 4. Clock In — escenarios asignados

| Worker | Escenario | Estado final esperado | Estado observado | Duplicados |
|---|---|---|---|---|
| 1–6 | Online normal | `CONFIRMED` |  |  |
| 7 | WiFi → celular durante el submit | `CONFIRMED` o `PENDING_SYNC` reconciliado |  |  |
| 8 | Modo avión / offline | `PENDING_SYNC` → `CONFIRMED` al volver la red |  |  |
| 9 | Refresh mientras corre el contador | contador continúa, `CONFIRMED` |  |  |
| 10 | Cerrar y reabrir el navegador | contador continúa, `CONFIRMED` |  |  |

Prohibido: `UNKNOWN` silencioso. Si aparece, el sistema debe exigir verificación antes de re-habilitar el botón.

## 5. Durante el turno

- [ ] Contador persiste tras refresh y tras reabrir navegador
- [ ] Admin ve el mismo estado que el worker (mismo `ClockResolution`)
- [ ] Sin relock de sesión
- [ ] Sin turnos desaparecidos del portal
- [ ] Sin identity mismatch
- [ ] Sin duplicados

## 6. Clock Out

| Worker | Escenario | Mismo `time_entry` cerrado | Segundo `time_entry` creado |
|---|---|---|---|
|  | online / offline / cambio de red / reapertura |  | debe ser NO |

## 7. Closeout

Antes de cerrar, todos los estados deben reconciliar. Si algo queda pendiente,
el sistema debe **bloquear** `FULLY_RECONCILED` y permitir sólo `CLOSEOUT_SUBMITTED`
con la lista de pendientes visible. No forzar.

| Estado alcanzado | Bloqueadores listados |
|---|---|
|  |  |

## 8. Payroll readiness

Comparar horas programadas vs `time_entries` reales. Payroll readiness se basa
únicamente en horas reales. No ejecutar payroll si no corresponde.

| Worker | Horas programadas | Horas reales | Delta | Explicación |
|---|---|---|---|---|

## 9. Consultas de verificación post-turno (sólo lectura)

```sql
-- Duplicados de idempotencia: debe devolver 0 filas
select client_event_id, count(*) from time_entries
where client_event_id is not null group by 1 having count(*) > 1;

-- Fichajes abiertos del turno certificado
select employee_id, clock_in, clock_out, requires_time_review
from time_entries where shift_id = '<shift_id>' order by clock_in;

-- Doble time_entry para la misma persona en el mismo turno
select employee_id, count(*) from time_entries
where shift_id = '<shift_id>' group by 1 having count(*) > 1;
```

## 10. Marcador de certificación

| Métrica | Valor |
|---|---|
| Workers invitados |  |
| Workers notificados |  |
| Workers que recibieron |  |
| Workers que aceptaron |  |
| Clock Ins intentados |  |
| Clock Ins confirmados |  |
| Clock Ins offline |  |
| Sync exitosos |  |
| Clock Outs |  |
| Errores |  |
| Duplicados |  |
| Eventos perdidos |  |
| Relocks inesperados |  |
| Turnos invisibles |  |
| Closeout |  |
| Payroll ready |  |

## 11. Criterios de aprobación

Stafly pasa sólo con: 0 eventos perdidos · 0 `time_entries` duplicados · 100% de estados
explicables · portal sin rebotes · sesión persistente · assignments correctos ·
notificaciones trazables · closeout honesto · payroll intacto.

Cualquier fallo se clasifica P0 / P1 / P2, se corrige la causa raíz y se repite la prueba completa.
