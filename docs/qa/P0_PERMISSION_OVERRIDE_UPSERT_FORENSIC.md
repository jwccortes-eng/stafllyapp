# P0 — PERMISSION OVERRIDE UPSERT FORENSIC

Fecha: 2026-08-13 · Estado: solo diagnóstico (sin cambios aplicados)

## 1. Tabla afectada

`public.module_permissions`.

El guardado de `/app/permissions` llama a la RPC `public.admin_set_user_access(_user_id, _company_id, _actions, _modules, _reason)`.
Esa función hace dos upserts:

- `public.action_permissions` → funciona.
- `public.module_permissions` → **falla** con
  `there is no unique or exclusion constraint matching the ON CONFLICT specification`.

## 2. UPSERT exacto (definido en la migración `20260813040039_...sql`)

```sql
-- ACTIONS (OK)
INSERT INTO public.action_permissions (user_id, company_id, action, granted)
VALUES (_user_id,_company_id,k,(v#>>'{}')::boolean)
ON CONFLICT (user_id, company_id, action)
  DO UPDATE SET granted = EXCLUDED.granted, updated_at = now();

-- MODULES (FALLA)
INSERT INTO public.module_permissions (user_id, company_id, module, can_view, can_edit, can_delete)
VALUES (_user_id,_company_id,k,
        COALESCE((v->>'view')::boolean,false),
        COALESCE((v->>'edit')::boolean,false),
        COALESCE((v->>'delete')::boolean,false))
ON CONFLICT (user_id, company_id, module)
  DO UPDATE SET can_view=EXCLUDED.can_view, can_edit=EXCLUDED.can_edit,
                can_delete=EXCLUDED.can_delete, updated_at=now();
```

## 3. Columnas usadas en ON CONFLICT

- `action_permissions`: `(user_id, company_id, action)`
- `module_permissions`: `(user_id, company_id, module)`

## 4/5. Constraints e índices existentes

`action_permissions`
- `action_permissions_pkey` PRIMARY KEY (id)
- `action_permissions_user_id_company_id_action_key` UNIQUE (user_id, company_id, action) → **coincide exactamente** con su ON CONFLICT.

`module_permissions`
- `module_permissions_pkey` PRIMARY KEY (id)
- `module_permissions_user_company_module_uidx` UNIQUE (user_id, company_id, module) **WHERE company_id IS NOT NULL** ← índice **parcial**
- `module_permissions_user_module_legacy_uidx` UNIQUE (user_id, module) **WHERE company_id IS NULL** ← índice parcial legacy
- `module_permissions_company_idx` (índice común, no único)

No existe ningún UNIQUE total sobre `(user_id, company_id, module)`.

## 6. ¿Migración faltante o columnas equivocadas?

Las columnas del código son las correctas. **No es un error de código ni de datos: es una brecha de inferencia de índice.**

Postgres solo puede inferir un índice **parcial** en `ON CONFLICT (...)` si el `INSERT` incluye una cláusula `WHERE` cuyo predicado implique el del índice. El INSERT de la RPC no lleva `WHERE`, así que el planner descarta ambos índices parciales y no encuentra ninguna restricción aplicable → error.

`action_permissions` no falla porque su UNIQUE es total (constraint real, no índice parcial).

## 7. Clave lógica canónica

- `module_permissions` → `(user_id, company_id, module)`
- `action_permissions` → `(user_id, company_id, action)`

El desdoblamiento en dos índices parciales existe solo por filas legacy con `company_id IS NULL` (modelo previo a la consolidación de permisos por compañía). Esas filas legacy son las que impiden un UNIQUE total hoy.

## Resumen

| Punto | Resultado |
|---|---|
| Tabla afectada | `public.module_permissions` |
| Clave lógica correcta | `(user_id, company_id, module)` |
| Constraint existente | índice UNIQUE **parcial** `... WHERE company_id IS NOT NULL` (+ parcial legacy `WHERE company_id IS NULL`) |
| Constraint faltante | UNIQUE total sobre `(user_id, company_id, module)` inferible por `ON CONFLICT` |
| Causa raíz | ON CONFLICT no puede inferir un índice parcial sin un `WHERE` equivalente en el INSERT |

## Solución mínima (propuesta, NO aplicada)

Dos caminos, ambos sin tocar la lógica ni retirar el `ON CONFLICT`:

**Opción A — alinear el INSERT con el índice existente (cero cambios de esquema, cero riesgo sobre datos):**
añadir el predicado del índice parcial a la inferencia:

```sql
ON CONFLICT (user_id, company_id, module) WHERE company_id IS NOT NULL
  DO UPDATE SET ...
```

Es válida porque la RPC ya exige `_company_id IS NOT NULL` en su primera línea.

**Opción B — cerrar el modelo con un UNIQUE total:** requiere primero migrar/retirar las filas legacy con `company_id IS NULL`, y solo después crear
`UNIQUE (user_id, company_id, module)`. Toca datos reales, por lo que queda fuera del alcance mínimo.

Recomendación: **Opción A** ahora (desbloquea el guardado), Opción B como saneamiento posterior planificado.
