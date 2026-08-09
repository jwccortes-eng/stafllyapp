# P0 — Auditoría completa del puente Stafly → Connecteam CSV

Fecha: 2026-08-09
Tipo: **Auditoría read-only. Cero cambios de código, datos, permisos o esquema.**
Fuentes: código actual, template oficial `Template_3.csv` (subido), y los dos videos de flujo real.

---

## 1. Inventario del exportador actual

| Pieza | Archivo | Estado | Notas |
|---|---|---|---|
| Serializer + validador + headers | `src/lib/integrations/connecteam-export.ts` (528 líneas) | Implementado v1.2 | Puro frontend, sin escrituras |
| Mapeo Job/Sub item (reglas beta) | `src/lib/integrations/connecteam-compat.ts` (343 líneas) | Implementado, reglas hard-coded por tenant (Eminence / Production) | Marcado `TODO(post-beta)` |
| Diálogo masivo (rango/filtros) | `src/components/shifts/integrations/ExportConnecteamBulkDialog.tsx` | Implementado | Es el modal del video |
| Diálogo por servicio | `src/components/shifts/integrations/ExportConnecteamPreviewDialog.tsx` | Implementado | Desde detalle de servicio y hoja móvil |
| Entradas UI | `src/pages/admin/Shifts.tsx:3024`, `ShiftDetailDialog.tsx:1702`, `MobileShiftOperationsSheet.tsx:1304` | Implementado | — |
| Descarga | `downloadCsv()` en `src/lib/import-review/csv-export.ts` | Implementado | Blob `text/csv;charset=utf-8` |
| Tests | `src/test/connecteam-export.test.ts`, `src/test/connecteam-compat.test.ts` | Existen | — |
| Ruta / feature flag | Ninguna ruta propia; ninguna flag | — | Vive dentro de `/app/shifts` |
| Trazabilidad (`exported_at`, batch, checksum) | **No existe** | — | No hay tabla ni columna de export |

**Fuente de datos:** estado en memoria de `/app/shifts` — `filteredShifts`, `assignments`, `employees`, `clients`, `locations`. No hay query adicional al backend.

**Campos leídos:** `date`, `start_time`, `end_time`, `timezone`, `title`, `slots`, `notes`, `special_instructions`, `shift_code`, `client_id`, `location_id`, `category_id`, `publication_status`, `company_id`, `job_site_address`/`manual_address`/`address`, y direcciones/nombres de `locations`, `clients`, `categories`.

---

## 2. Por qué hoy marca **0 exportables**

Dos bloqueos independientes, ambos reproducibles con el código actual:

### 2.1 Causa principal — permiso mal derivado (el mensaje del video)

`src/pages/admin/Shifts.tsx:429`

```ts
const isAdminForCompany = role === "owner" || role === "admin";
```

`role` proviene de `useAuth()` y es el **rol global agregado**, no el rol resuelto para la compañía seleccionada. El propio `useAuth.tsx:637` documenta que ese valor **no debe usarse para gating por tenant** y que la función canónica es `canAccessAdminForCompany(companyId)`.

Consecuencia: cualquier usuario cuyo `role` global no sea literalmente `owner`/`admin` (p. ej. `developer`, `founder`, `company_owner`, `manager`, `supervisor`) recibe `isAdmin=false`. `validateShiftForExport` entonces retorna `blocked` con `no_admin` para **todos** los servicios → `exportable = 0` y el mensaje "Solo administradores pueden exportar".

Nota: `ExportConnecteamPreviewDialog` en la hoja móvil usa `canValidate`, y en `ShiftDetailDialog` usa `isAdminForTenant`. Es decir, **hay tres criterios distintos de permiso para la misma capacidad**. Inconsistencia real.

### 2.2 Causa secundaria — gate de publicación

```ts
if (pub && pub !== "published") → blocked "not_published"
```

Los servicios en `draft` (o cualquier estado no `published`) quedan bloqueados aunque tengan fecha, hora y título completos. Si el rango del video contenía borradores, seguirían en 0 incluso arreglando el permiso.

### 2.3 Causas terciarias posibles

- `no_tenant` si `selectedCompanyId` es null en el momento de abrir el modal.
- `tenant_mismatch` si `shift.company_id` no coincide con la compañía seleccionada.
- `no_capacity_no_users`: `slots <= 0` y cero asignaciones aceptadas.

---

## 3. Matriz de las 16 columnas

Template real (BOM UTF-8, CRLF, 1 fila de ejemplo):

```
Date,Start,End,Timezone,Unpaid break,Paid break,Shift title,Job,Sub item,Address,Users,Shift tags,Note,Number of users,Require Approval,Tasks
7/21/26,05:30pm,11:30pm,,,,Example,,,,,,Note example,,no,
```

| # | Columna | Origen Stafly hoy | Transformación actual | Fallback | Req. | Riesgo | Ejemplo actual |
|---|---|---|---|---|---|---|---|
| 1 | Date | `scheduled_shifts.date` | `MM/DD/YYYY` | vacío | Sí | **Template usa `M/D/YY`** — formato distinto | `07/21/2026` |
| 2 | Start | `start_time` | `HH:mm` 24h | vacío | Sí | **Template usa `hh:mmam/pm`** | `17:30` |
| 3 | End | `end_time` | `HH:mm` 24h | vacío | Sí | Igual que Start | `23:30` |
| 4 | Timezone | `shift.timezone` → default | `America/New_York` | default | No | Template lo deja **vacío**; valor no vacío no está verificado contra el importer | `America/New_York` |
| 5 | Unpaid break | — | siempre `""` | — | No | Sin mapping. Stafly sí tiene `break_minutes` en time entries, no en el servicio | `` |
| 6 | Paid break | — | siempre `""` | — | No | Sin mapping | `` |
| 7 | Shift title | `shift.title` | trim | bloquea si vacío | Sí | No incluye `shift_code`; el ref va a Note | `Bar Mitzvah` |
| 8 | Job | hint → location.name → client.name → category.name, más reglas beta | `resolveConnecteamJobAndSubItem` | `""` | No formal | **Alto**: si no coincide exacto con un Job de Connecteam la fila cae en "Select" y desaparece del reporting | `Eminence` |
| 9 | Sub item | category.name o regla beta | idem | `""` | No | Mismo riesgo que Job | `Headwaiters` |
| 10 | Address | `location.full_address` → `formatted_address` → `address` → `job_site_address` → `manual_address` → `shift.address` → `location.name` | primer no vacío | `""` + warn | No | Último fallback mete **nombre de venue** como dirección | `123 Main St, Bronx NY` |
| 11 | Users | assignments `accepted`/`confirmed` → `First Last` | **vacío por defecto** (`includeUsers:false`); si se activa, join con `"; "` | `""` | No | **El video indica separador `/`, el código usa `;`** — no verificado contra el importer | `` |
| 12 | Shift tags | — | siempre `""` | — | No | Sin mapping | `` |
| 13 | Note | `notes` + `special_instructions` + `Ref: <shift_code>` | join con `" · "` | `""` | No | El `·` es no-ASCII; sobrevive con BOM UTF-8 | `Traje negro · Ref: QK-001573` |
| 14 | Number of users | `shift.slots` | `String(slots ?? asignados)` | `0` | No | Semántica no confirmada: ¿total requerido u **open slots**? | `6` |
| 15 | Require Approval | — | siempre `""` | — | No | Template ejemplifica `no`; vacío no verificado | `` |
| 16 | Tasks | — | siempre `""` | — | No | Sin mapping | `` |

---

## 4. Comparación estructural contra `Template_3.csv`

| Aspecto | Template oficial | CSV de Stafly | ¿Coincide? |
|---|---|---|---|
| Nombres de columnas | 16 exactos | idénticos (`CONNECTEAM_HEADERS`) | Sí |
| Orden | canónico | idéntico | Sí |
| Encoding | UTF-8 **con BOM** | UTF-8 con BOM (`CSV_UTF8_BOM`) | Sí |
| Separador | `,` | `,` | Sí |
| Quoting | mínimo (solo cuando hace falta) | mínimo, `""` escapado | Sí |
| Line endings | **CRLF** | **LF** (`join("\n")`) | **No** |
| Formato de fecha | `7/21/26` (M/D/YY) | `07/21/2026` | **No (probable)** |
| Formato de hora | `05:30pm` | `17:30` | **No (probable)** |
| Booleanos | `no` en Require Approval | `""` | **No verificado** |
| Columnas vacías | permitidas | permitidas | Sí |

Las tres diferencias reales (CRLF, fecha, hora) son de **formato de celda**, no de estructura. Muchos importadores toleran `MM/DD/YYYY` y LF; **no está verificado** contra el importer de Connecteam. Ver §14.

---

## 5. Users — clasificación

Estado actual: **la columna se exporta vacía a propósito** (`includeUsers:false`), documentado en el código como decisión tras un primer import real que falló silenciosamente al no poder emparejar nombres.

| Clase | Definición | Cobertura hoy |
|---|---|---|
| A. Match seguro | Existe un identificador exacto que Connecteam reconoce (email o `connecteam_employee_id`) | **No implementado en el exportador** — `employees.connecteam_employee_id` sí existe en el modelo (lo llena el parser de import) pero el exportador no lo usa |
| B. Match probable | Nombre completo `First Last` normalizado | Es lo único que el código sabe construir; falla en silencio |
| C. No existe en Connecteam | Worker nuevo de Stafly | No detectado |
| D. No exportable | Nombre placeholder (`System X`, `Unknown`, `Temp`) | **Sí detectado** vía `isPlaceholderName` y descartado |

Riesgos no cubiertos: duplicados de worker, acentos/caracteres especiales, separador (`;` en código vs `/` en el video), y usuarios con match parcial.

---

## 6. Number of users — semántica no resuelta

El código usa `slots` (capacidad total requerida) y cae a la cantidad de asignados. El template no documenta la semántica y en el flujo del video la columna se relaciona con **open shifts**. Tres lecturas posibles, ninguna confirmada:

1. Total requerido (lo que hace hoy).
2. Cupos abiertos = `slots - asignados`.
3. Cantidad de shifts duplicados a crear.

**No se puede cerrar sin una prueba de import real.** El modal ya calcula y muestra "Cupos abiertos", así que el dato está disponible para cualquiera de las tres lecturas.

---

## 7. Job / Sub item

Connecteam agrupa horas y costo por Job + Sub item. Un valor que no coincide exactamente cae en "Select" y sale del reporting.

Hoy Stafly infiere con `BETA_COMPAT_RULES`: reglas regex hard-coded para dos tenants (Eminence, Production) que combinan venue, rol, texto libre, pay type y fin de semana. Todo lo demás cae en fallback (`location.name` → `client.name` → `category.name`) con warning `job_fallback`.

**No existe catálogo de Jobs de Connecteam en Stafly.** No hay columnas `connecteam_job_name` en `clients`, `locations` ni `scheduled_shifts` (el código las lee de forma opportunista, pero no están en el esquema). Recomendación documentada en el propio archivo: mover a `company_settings.connecteam_compat_profile` o tabla `connecteam_compat_profiles`.

---

## 8. Shift title

Hoy exporta `shift.title` crudo y bloquea si está vacío. No usa UUID (correcto). El `shift_code` viaja solo en Note como `Ref: QK-001573`, por política `mem://business-logic/legacy-shift-number-policy`.

Formato propuesto (no implementado): `QK-001573 · Bar Mitzvah` — pendiente de confirmar que Connecteam no trunca ni rechaza el separador.

---

## 9. Location / Address

La prioridad v1.1 ya es correcta: **dirección física primero, nombre del venue como último recurso**, y avisa (`address_from_venue_name`) cuando cae ahí. No usa punto de encuentro en ningún caso — correcto según el contrato pedido. Si no hay nada: `""` + warning `address_missing` (no bloquea).

---

## 10. Draft vs Ready — estados

Hoy solo hay tres estados en `ExportStatus`: `ready`, `needs_review`, `blocked`. El modelo pedido de cuatro estados **no existe**:

| Pedido | Existe hoy | Gap |
|---|---|---|
| NOT_READY | ≈ `blocked` | Sí existe con razones específicas por código de warning (`missing_date`, `missing_start`, `missing_end`, `missing_title`, `missing_timezone`, `not_published`, `no_admin`, `no_tenant`, `tenant_mismatch`, `no_capacity_no_users`) |
| READY_FOR_EXPORT | `ready` / `needs_review` | Existe |
| EXPORTED | **No existe** | Sin trazabilidad |
| REEXPORTABLE | **No existe** | Sin trazabilidad |

Nota positiva: el bloqueo **no** es genérico — cada razón tiene código y mensaje propio. Lo que sí es genérico en la UI es el resumen superior; el detalle vive en la lista de advertencias del modal.

---

## 11. Permisos

**Estado actual (tres criterios distintos para la misma acción):**

| Entrada | Criterio |
|---|---|
| Bulk en `/app/shifts` | `role === "owner" \|\| role === "admin"` (rol **global**) |
| Detalle de servicio | `isAdminForTenant` |
| Hoja móvil | `canValidate` |

**Quién debería poder exportar (propuesta, no implementada):** cross-tenant `developer`/`owner`/`founder`, y por compañía `company_owner`/`admin`/`manager`/`supervisor` — exactamente `canManageShifts()` de `src/lib/shifts/shift-permissions.ts`, que ya es la fuente única para operar servicios. Exportar un CSV es una lectura; es más restrictivo que crear o publicar un servicio, así que ampliar a `canManageShifts` **no amplía superficie real de riesgo**.

Capability canónica propuesta: `services.export.connecteam`. **No existe** en `action_permissions` ni en el catálogo de capacidades ECC. No implementarla en esta fase.

---

## 12. Rango y filtros

`ExportConnecteamBulkDialog` recibe `filteredShifts` — el mismo array que renderiza la vista. Por construcción respeta rango de fechas, cliente, venue, estado y equipo. **No hay riesgo de exportar servicios invisibles.**

Lo que **no** soporta: selección explícita de servicios individuales dentro del modal. Es todo-o-nada sobre el filtro actual.

---

## 13. Idempotencia / reexport

- El exportador es **puro**: sin `supabase`, sin `fetch`, sin escrituras. Reexportar es seguro por construcción.
- **No existe** ninguna trazabilidad: ni `exported_at`, ni `exported_by`, ni batch, ni checksum, ni tabla de export log. Búsqueda en migraciones y en `types.ts`: cero resultados.
- Tampoco existe la distinción `CSV_GENERATED` vs `IMPORTED_IN_CONNECTEAM`. Correcto no marcarla hoy: descargar un archivo no es importar.

---

## 14. Simulación con los servicios del rango del video

No se ejecutó ninguna consulta ni escritura sobre datos reales. Simulación derivada del código, asumiendo un servicio típico de Quality Staff en Eminence con `publication_status = "draft"`:

| Verificación | Resultado |
|---|---|
| ¿Sale alguna fila? | **No.** `no_admin` bloquea antes de cualquier otra validación |
| Corrigiendo solo el permiso | Sigue en 0 si los servicios son `draft` (`not_published`) |
| Corrigiendo permiso + publicando | Fila generada con Date/Start/End/Timezone/Shift title/Job/Sub item/Address/Note/Number of users; Users vacío; breaks, tags, approval y tasks vacíos |
| ¿Faltaría algo estructural? | No — 16 columnas en orden, BOM correcto |
| ¿Faltaría algo de formato? | Sí — LF en lugar de CRLF, `MM/DD/YYYY` en lugar de `M/D/YY`, `17:30` en lugar de `05:30pm` |

---

## 15. Procedimiento manual de aceptación en Connecteam

1. En Stafly: `/app/shifts`, fijar el rango y filtros del lote, abrir "Exportar Servicios → Connecteam (.csv)", descargar.
2. Connecteam → Scheduling.
3. Add.
4. Import shifts from Excel.
5. Descargar el template oficial desde Connecteam y comparar la primera línea con la del CSV de Stafly (deben ser idénticas byte a byte tras el BOM).
6. Subir el CSV de Stafly.
7. Overview — confirmar sin editar el archivo: fechas, horas (am/pm correcto, no desplazadas 12 h), títulos, Job y Sub item resueltos (no "Select"), Address como dirección real, Users, y open shifts según Number of users.
8. **No publicar.** Descartar el import de prueba.
9. Registrar si Connecteam pidió alguna corrección estructural o de formato de celda.

Este paso 7 es el único que puede cerrar las incógnitas de §3 (fecha/hora), §5 (separador de Users) y §6 (semántica de Number of users).

---

## 16. Qué cambiaría (propuesta, no implementado)

Orden por relación impacto/riesgo:

1. **Permiso único** — sustituir los tres criterios por `canManageShifts({ allRoles, canAccessAdminForCompany, companyId })`. Desbloquea el 100 % de los casos del video. Riesgo bajo: es la misma función que ya autoriza operar servicios.
2. **Formato de celda** — CRLF, `M/D/YY` y `hh:mmam/pm`, tras confirmarlo en §15. Riesgo bajo, reversible.
3. **Gate de publicación configurable** — permitir exportar borradores con warning en vez de bloqueo, o mantener el bloqueo con un mensaje que ofrezca publicar. Decisión de producto.
4. **Users por identificador** — usar `employees.connecteam_employee_id` o email cuando exista y clasificar A/B/C/D en el modal antes de activar `includeUsers`.
5. **Number of users** — fijar la semántica con evidencia del import de prueba.
6. **Job/Sub item por tenant** — mover `BETA_COMPAT_RULES` a configuración de compañía y eliminar los strings de tenant del código.
7. **Trazabilidad** — tabla de export log con `exported_at`, `exported_by`, `format`, `row_count`, `checksum`, y estado `CSV_GENERATED` explícitamente distinto de importado en Connecteam.
8. **Selección explícita** de servicios dentro del modal.

---

## 17. Riesgos

| Riesgo | Severidad | Detalle |
|---|---|---|
| Job/Sub item en fallback | **Alto** | Las filas caen en "Select" y desaparecen del reporting de horas y costo de Connecteam |
| Reglas de tenant hard-coded | Alto | `Eminence`/`Production` en el código; no escala y puede aplicarse a un tenant equivocado si un venue coincide por regex |
| Formato de hora 24h vs am/pm | Medio | Si el importer interpreta mal, los turnos de tarde entran como mañana |
| Users por nombre | Medio | Falla silenciosa; por eso hoy va vacío |
| Number of users mal interpretado | Medio | Puede crear open shifts de más o de menos |
| Address desde nombre de venue | Bajo | Ya advertido en UI |
| Sin trazabilidad de export | Bajo | Riesgo operativo de doble import manual, no de datos |

---

## 18. ¿El CSV puede importarse hoy sin edición?

**Estructuralmente sí; operativamente no.**

- La estructura (16 columnas, orden, BOM, separador, quoting) coincide con el template oficial.
- Pero hoy **no se genera ningún archivo**, porque el gate de permiso deja 0 exportables.
- Y si se generara, las diferencias de formato de celda (CRLF, fecha, hora) no están verificadas contra el importer real. Hasta ejecutar §15, no se puede afirmar "sin edición".

---

## 19. Recomendación

Fase 1 (mínima, desbloquea el flujo): corregir el criterio de permiso a `canManageShifts` en las tres entradas y decidir el gate de publicación. Con eso se obtiene un CSV real.

Fase 2 (verificación): ejecutar el procedimiento de §15 con ese CSV en un entorno de prueba de Connecteam, sin publicar, y cerrar las tres incógnitas de formato/semántica.

Fase 3 (confiabilidad): identificadores de Users, catálogo de Job/Sub item por tenant, y trazabilidad de export.

No implementar Fase 2 ni 3 antes de tener la evidencia del import real. El exportador debe adaptarse al formato externo; el modelo interno de Stafly no debe cambiar.

---

## 20. Confirmación

No se modificaron Servicios, asignaciones, payroll, time_entries, permisos, tenants ni datos reales durante esta auditoría. No se ejecutaron migraciones, ni escrituras a la base de datos, ni cambios de código.
