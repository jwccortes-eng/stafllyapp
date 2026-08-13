# P0 — PERMISSION OVERRIDE UPSERT FIX

Fecha: 2026-08-13 · Alcance: fix mínimo aprobado (solo inferencia del ON CONFLICT)

## 1. Causa raíz confirmada

`public.admin_set_user_access` hacía:

```sql
INSERT INTO public.module_permissions (user_id, company_id, module, can_view, can_edit, can_delete)
VALUES (...)
ON CONFLICT (user_id, company_id, module) DO UPDATE ...
```

pero en `module_permissions` no existe un UNIQUE total sobre esas columnas. Solo existen dos índices únicos **parciales**:

- `module_permissions_user_company_module_uidx` → `(user_id, company_id, module) WHERE company_id IS NOT NULL`
- `module_permissions_user_module_legacy_uidx` → `(user_id, module) WHERE company_id IS NULL`

Postgres solo infiere un índice parcial si el `ON CONFLICT` incluye el mismo predicado. Sin él, no encuentra restricción aplicable y lanza
`there is no unique or exclusion constraint matching the ON CONFLICT specification`.

`action_permissions` nunca falló: su UNIQUE `(user_id, company_id, action)` es total.

## 2. Cambio aplicado

Un único cambio, dentro de `CREATE OR REPLACE FUNCTION public.admin_set_user_access(...)`:

```diff
-ON CONFLICT (user_id, company_id, module)
+ON CONFLICT (user_id, company_id, module) WHERE company_id IS NOT NULL
   DO UPDATE SET can_view=EXCLUDED.can_view, can_edit=EXCLUDED.can_edit,
                 can_delete=EXCLUDED.can_delete, updated_at=now();
```

Legítimo porque la propia RPC aborta con `company_required` si `_company_id IS NULL`, así que toda fila escrita cae siempre dentro del predicado del índice existente.

No se tocó nada más: mismo cuerpo, mismos GRANTs, mismas validaciones (`user_is_company_admin`, pertenencia a la compañía, auditoría en `activity_log`).

## 3. Evidencia

| Verificación | Resultado |
|---|---|
| Predicado presente en la definición viva de la función (`pg_get_functiondef`) | PASS |
| UNIQUE de `action_permissions` intacto | PASS |
| Índices de `module_permissions`: siguen siendo 4 (pkey + 2 parciales + índice de company) | PASS — ninguno creado ni eliminado |
| Estructura de `module_permissions` sin cambios (columnas, RLS, FKs) | PASS |
| Filas legacy con `company_id IS NULL` | 66 antes / 66 después — sin migrar ni borrar |
| Total de filas `module_permissions` | 66 → 66 |
| `action_permissions` | 202 → 202 |
| `max(updated_at)` de `module_permissions` | 2026-08-12 17:34 (sin escrituras nuevas por el fix) |
| Migración de datos creada | Ninguna |

## 4. Pruebas PASS/FAIL

| # | Prueba | Estado |
|---|---|---|
| 1 | Error `no unique or exclusion constraint matching the ON CONFLICT specification` eliminado por construcción (predicado alineado con el índice parcial existente) | PASS |
| 2 | Rama de `action_permissions` intacta | PASS |
| 3 | Protecciones de Owner (`PROTECTED_OWNER_PERMISSIONS`) sin cambios en la lógica de la consola | PASS (no tocado) |
| 4 | Aislamiento multi-compañía: la RPC sigue escribiendo siempre con `company_id` explícito; MyStaff no puede verse afectado por un guardado en Quality Staff | PASS por contrato de la función |
| 5 | Filas legacy `company_id IS NULL` (índice legacy) no alcanzables por esta ruta | PASS |
| 6 | QA end-to-end en UI (`/app/permissions`: guardar override en Quality Staff, recargar, quitar y volver a guardar; Owner / Shift Administrator / Time & Closeout Administrator) | **PENDIENTE de ejecución por operador** |

### Nota sobre la prueba 6

La sesión de pruebas automatizada disponible entra como usuario de plataforma en Vista global y `/app/permissions` exige contexto de empresa, por lo que no fue posible completar el recorrido sin seleccionar manualmente Quality Staff. Además, guardar overrides reales sobre personas reales cambiaría datos de producción, algo excluido explícitamente del alcance autorizado.

Recomendación de verificación manual (2 minutos, reversible):
1. Quality Staff → `/app/permissions` → Usuarios → elegir una persona no-Owner.
2. Activar un permiso de módulo, Guardar → debe confirmar sin error.
3. Recargar → el override persiste.
4. Cambiar a MyStaff → los permisos de esa persona allí no cambian.
5. Volver a Quality Staff, desactivar el permiso y Guardar → vuelve al estado inicial.
6. Repetir con un Shift Administrator y un Time & Closeout Administrator; con Owner, comprobar que los permisos protegidos siguen bloqueados.

## 5. Confirmaciones finales

- No se creó ningún UNIQUE nuevo.
- No se modificó la estructura de `module_permissions`.
- No se migraron ni eliminaron registros legacy con `company_id IS NULL`.
- No se tocaron RLS, la lógica de permisos ni el modelo multi-compañía.
- No se modificó ningún dato real: la única migración aplicada reemplaza el cuerpo de una función.
