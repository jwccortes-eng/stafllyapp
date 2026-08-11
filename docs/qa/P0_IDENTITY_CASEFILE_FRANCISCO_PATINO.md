# EXPEDIENTE DE IDENTIDAD — FRANCISCO PATINO

Sólo lectura. **No se ejecutó ninguna escritura**: ni payroll, ni assignments, ni auth.

## Registros encontrados

| id | nombre | tenant | activo | portal | creado | fichajes | asignaciones (futuras/pasadas) | refs payroll |
|---|---|---|---|---|---|---|---|---|
| `82e58682` | Francisco Patino | `0000…0001` | sí | **sí** | 2026-02-25 | 17 (último 2026-03-11) | 3 / 40 (última 2026-08-13) | 8 |
| `1f61628f` | francisco patino | `0000…0001` | sí | no | 2026-03-06 | 0 | **1** / 2 (última 2026-08-11) | **2** |
| `f779aa90` | Francisco Patino* | `0b58f1d4…` | sí | no | 2026-03-01 | 0 | 0 | 0 |

## Referencias de nómina del duplicado `1f61628f`

| period | rango | estado del periodo | horas pagadas | total base |
|---|---|---|---|---|
| `9e2e3f43` | 2026-04-22 → 2026-04-28 | **closed** | 0.00 | 85.25 |
| `fd00e7b6` | 2026-03-18 → 2026-03-24 | **closed** | 0.00 | 490.00 |

Ambos periodos están **cerrados**. Son historia contable ya liquidada.

## Lectura

- **Canónico propuesto: `82e58682`.** Tiene el portal, los 17 fichajes, 43 asignaciones
  y 8 referencias de nómina.
- `1f61628f` no es un duplicado muerto: tiene **1 asignación futura activa** (turno con
  fecha 2026-08-11, hoy) además de 2 históricas. Es decir, hay trabajo real programado
  contra el registro equivocado.
- `f779aa90` pertenece a otro tenant. Fuera de alcance.

## Clasificación

| Elemento | Clasificación | Razón |
|---|---|---|
| `period_base_pay` × 2 de `1f61628f` | **DO_NOT_TOUCH** | Periodos cerrados; relinkear alteraría liquidaciones firmadas |
| 2 asignaciones pasadas de `1f61628f` | `HISTORICAL_ONLY` | Preservar donde están |
| 1 asignación futura de `1f61628f` | **SAFE_TO_RELINK** | Mismo tenant, sin fichaje asociado, trabajo aún no ejecutado |
| Registro `1f61628f` | `HUMAN_REVIEW_REQUIRED` | No archivar mientras sostenga trabajo futuro |
| `f779aa90` | `DO_NOT_TOUCH` | Otro tenant |

## Propuesta (no ejecutada)

1. Con aprobación humana: mover **únicamente** la asignación futura de `1f61628f` a
   `82e58682`, verificando antes que no genere doble asignación en el mismo turno.
2. Sólo después, archivar `1f61628f` (`is_active = false`, `identity_status = 'merged'`,
   `merged_into_employee_id = 82e58682`).
3. **Nunca** tocar las 2 referencias de `period_base_pay`: quedan ancladas al registro
   archivado como evidencia histórica, exactamente igual que en los casos ya consolidados.
4. La trazabilidad se conserva porque `merged_into_employee_id` permite recorrer la
   historia desde el canónico.

## Rollback

Devolver la asignación relinkeada a `1f61628f` y restaurar `is_active`, `identity_status`
y `merged_into_employee_id`. Payroll y fichajes no participan, por lo que no hay riesgo
financiero en el rollback.
