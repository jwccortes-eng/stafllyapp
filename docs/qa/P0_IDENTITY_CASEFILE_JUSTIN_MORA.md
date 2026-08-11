# EXPEDIENTE DE IDENTIDAD — JUSTIN MORA

Sólo lectura. **No se ejecutó ninguna escritura**: ni auth, ni portal, ni payroll, ni assignments.
Requiere aprobación humana explícita antes de cualquier acción.

## Registros encontrados

| id | tenant | activo | portal/auth | creado | fichajes | asignaciones (futuras/pasadas) | refs payroll | docs |
|---|---|---|---|---|---|---|---|---|
| `744b546b` | `0000…0001` | sí | **sí** | 2026-02-25 | 238 (último 2026-03-11) | 0 / 131 (última 2026-06-02) | 57 | 0 |
| `e08b2240` | `0000…0001` | no | **sí** | 2026-04-20 | 0 | 0 / 19 (última 2026-04-26) | 0 | 0 |
| `03f1b351` | `0000…0001` | no | no | 2026-04-23 | 0 | 0 / 6 (última 2026-05-19) | 0 | 0 |
| `4e54517c` | `0b58f1d4…` | sí | no | 2026-03-01 | 0 | 0 | 0 | 0 |

## Lectura

- **Canónico propuesto: `744b546b`.** Concentra toda la evidencia real: 238 fichajes,
  131 asignaciones, 57 referencias de nómina y el portal con actividad.
- `e08b2240` es el bloqueador: está inactivo pero **conserva `user_id` propio** (segunda
  cuenta de auth). Sus 19 asignaciones son todas históricas (última 2026-04-26) y no tiene
  ni un fichaje ni una referencia de nómina.
- `03f1b351` es un duplicado muerto simple: sin portal, sin fichajes, sin payroll,
  6 asignaciones históricas.
- `4e54517c` pertenece a **otro tenant** (`0b58f1d4…`). Fuera de alcance: consolidar
  entre tenants rompería aislamiento. No tocar.

## Clasificación

| Registro | Clasificación |
|---|---|
| `744b546b` | `CANONICAL` |
| `e08b2240` | `HUMAN_REVIEW_REQUIRED` — doble auth |
| `03f1b351` | `SAFE_TO_ARCHIVE` (sin portal, sin payroll, sin fichajes) |
| `4e54517c` | `DO_NOT_TOUCH` — otro tenant |

## Propuesta (no ejecutada)

1. **Requiere decisión humana**: confirmar con la persona cuál de las dos cuentas de acceso
   usa hoy. Si usa la de `744b546b`, la credencial de `e08b2240` debe revocarse *antes* de
   archivar el registro; nunca al revés.
2. Tras esa confirmación: archivar `e08b2240` y `03f1b351` con
   `is_active = false`, `identity_status = 'merged'`, `merged_into_employee_id = 744b546b`.
3. **No mover** asignaciones (todas históricas), fichajes (ninguno), ni payroll (ninguno).
4. `4e54517c` queda intacto.

## Rollback

Revertir `is_active`, `identity_status` y `merged_into_employee_id` de los registros
archivados a su valor previo (`true` / `verified` / `null`). Ninguna otra tabla se altera,
por lo que el rollback es total.
