# P0 — EMERGENCY WORKER · FLUJO DE PERSONA EXISTENTE

## Diagnóstico

El error no era del constraint. `employees_phone_company_unique (phone_number, company_id)`
es correcto y **permanece exactamente igual**: un teléfono no puede repetirse dentro de
la misma empresa, y sí puede existir en varias empresas del ecosistema.

El fallo era de flujo: el diálogo de emergencia insertaba directamente en `employees`
sin verificar si la persona ya existía. Cuando existía, el INSERT chocaba con el UNIQUE
y el admin veía un error técnico en plena operación.

## Flujo nuevo (búsqueda obligatoria antes de crear)

1. El admin escribe el teléfono y pulsa **Buscar persona por teléfono**.
2. Según el resultado:

| Resultado | Qué hace el sistema |
|---|---|
| Existe en la empresa activa | ✓ *Persona encontrada*. **No se intenta INSERT.** Acciones: Asignar al servicio actual · Reactivar acceso (si está inactiva) · Actualizar datos · Ver ficha |
| Existe en otra empresa | *"Esta persona ya pertenece al ecosistema."* Acción: **Agregar a esta empresa** (solo membresía) · Ver ficha |
| Registro fusionado | Solo *Ver registro canónico*: nunca se opera sobre una ficha muerta |
| Sin coincidencias | Recién ahí se habilita **Crear trabajador de emergencia** |

El botón de creación está deshabilitado hasta que la búsqueda confirme que no hay
coincidencia ("Busca el teléfono primero"). Cambiar el teléfono invalida el resultado
anterior y obliga a repetir la verificación.

## Membresía sin duplicar identidad

`emergency_worker_add_company_membership(_company_id, _source_employee_id, _note)`:

- Copia nombre, teléfono, correo y **el mismo vínculo de acceso** (`user_id`) de la
  persona original: una sola identidad, un solo perfil, un solo teléfono por empresa.
- Marca la fila con `identity_source='ecosystem_membership'`, `added_via='ecosystem_membership'`
  y `resolved_person_id` apuntando a la persona canónica.
- Si ya existe alguien con ese teléfono en la empresa destino, **no inserta**: devuelve
  la ficha existente (`created=false`). Nunca puede violar el UNIQUE.
- Rechaza fuentes fusionadas y exige permisos de admin/gerente/supervisor de la
  empresa activa (`can_manage_shift_company`).

## Búsqueda cross-tenant segura

`emergency_worker_phone_lookup(_company_id, _phone)` (solo lectura, `SECURITY DEFINER`,
`search_path` fijo, `EXECUTE` revocado a `anon`):

- Autoriza contra la empresa activa antes de devolver nada.
- Coincidencia en la empresa activa: ficha completa.
- Coincidencia en otra empresa: solo nombre, inicial del apellido y nombre de la
  empresa. **No expone teléfono ni datos sensibles de otro tenant.**
- Normaliza con `normalize_auth_phone`, el mismo criterio que usa el resto de auth.

## Protegido (sin cambios)

`employees_phone_company_unique` · políticas RLS · `auth` · `profiles` · `company_users`
· `payroll` · `time_entries` · `shift_assignments` · datos de producción.
No hubo `ALTER TABLE`, ni `DROP CONSTRAINT`, ni borrados, ni backfills.

## Archivos

| Archivo | Rol |
|---|---|
| `src/lib/people/existing-person-flow.ts` | Motor puro: normaliza el teléfono, clasifica coincidencias y decide acciones. |
| `src/components/employee/EmergencyWorkerDialog.tsx` | Búsqueda primero, resultados accionables, creación bloqueada hasta confirmar que no existe. |
| `src/test/existing-person-flow.test.ts` | 8 casos, verde. |

## QA

1. Teléfono de alguien de la empresa → ✓ Persona encontrada, sin INSERT, 3–4 acciones. ✅
2. Persona inactiva → aparece *Reactivar acceso* y vuelve a estar disponible. ✅
3. Teléfono de otra empresa → mensaje de ecosistema y membresía sin duplicar identidad. ✅
4. Membresía repetida → devuelve la ficha existente, no viola el UNIQUE. ✅
5. Teléfono nuevo → creación habilitada, comportamiento anterior intacto. ✅
6. Registro fusionado → solo lleva al registro canónico. ✅

`vitest` 8/8 · typecheck limpio.
