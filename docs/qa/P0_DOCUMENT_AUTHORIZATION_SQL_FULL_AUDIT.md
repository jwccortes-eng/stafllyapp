# P0 — Auditoría completa de autorización SQL en Documentos

**Estado:** investigación cerrada; defecto reproducible identificado.  
**Alcance:** sólo lectura, reconstrucción y reporte.  
**Cambios de seguridad o datos:** **cero**.  
**Correcciones implementadas:** **ninguna**, por restricción expresa del encargo.

## 1. Resumen ejecutivo

El error real:

```text
function public.has_company_role(uuid, uuid, app_role) does not exist
```

no nace en React, en el payload del documento, en RLS de
`employee_documents`, ni en el Versioned Write Contract. Nace dentro de las
RPC de Documentos al resolver una llamada SQL con tipos incompatibles:

- la única función disponible en el backend es
  `public.has_company_role(uuid, uuid, text)`;
- las RPC de Documentos llaman explícitamente
  `public.has_company_role(..., 'admin'::app_role)` y equivalentes;
- PostgreSQL no aplica de forma implícita el cast `app_role → text` durante la
  resolución de una función;
- no existe una sobrecarga
  `public.has_company_role(uuid, uuid, app_role)`.

Por tanto, PostgreSQL aborta la ejecución al alcanzar la autorización. La
operación no llega al bloqueo de fila, comparación de versión, `UPDATE` ni
auditoría VWC.

**Conclusión causal:** deriva de contrato SQL. El helper conserva un tercer
argumento `text`, mientras callers recientes fijaron el tercer argumento como
`public.app_role`.

## 2. Cadena completa de llamadas

### 2.1 Editar vencimiento desde la tabla

1. `/app/documents` monta `DocumentsCenter`.
2. `useCompanyDocuments` lee documentos filtrados por `company_id`, incluida
   su `version`.
3. `ExpirationCell.handleSave` construye un documento con `raw_id`,
   `company_id`, `employee_id`, `category` y `version`.
4. `updateDocumentExpiration` llama al carril común `versionedWrite` con:

   ```text
   entity = employee_documents
   id = document_id
   companyId = company_id
   patch = { expires_at }
   expectedVersion = version observada
   surface = documents:expiration
   ```

5. `versionedWrite` resuelve la entidad a la RPC
   `versioned_update_employee_document` y envía:
   `p_document_id`, `p_company_id`, `p_patch`, `p_expected_version`,
   `p_surface` y `p_intent_key`.
6. La RPC valida sesión y whitelist (`name`, `category`, `expires_at`).
7. Antes de leer o modificar la fila, evalúa:

   ```sql
   public.has_company_role(v_actor, p_company_id, 'admin'::app_role)
   public.has_company_role(v_actor, p_company_id, 'owner'::app_role)
   public.has_company_role(v_actor, p_company_id, 'manager'::app_role)
   ```

8. La resolución falla porque sólo existe la firma con `text`.
9. El cliente recibe un error SQL de la llamada RPC y lo presenta como fallo
   de guardado.

### 2.2 Aprobar, rechazar o pedir reemplazo

1. `DocumentsCenter` abre `DocumentPreviewDialog`.
2. `DocumentReviewActions` ejecuta `approveDocument` o `rejectDocument`;
   otras superficies usan el mismo helper para reemplazo/vencimiento.
3. El helper invoca `review_employee_document` con documento, origen,
   empresa, decisión, versión esperada, motivo y superficie.
4. La RPC valida sesión, origen, decisión y motivo.
5. Ejecuta las mismas tres llamadas tipadas como `app_role`.
6. Falla antes de `SELECT ... FOR UPDATE`, comparación de versión,
   transición, evento de revisión o auditoría VWC.

### 2.3 Extracción asistida

`AssistedExtractionPanel` no escribe automáticamente al leer el archivo. La
acción **Guardar fecha de vencimiento** converge en
`updateDocumentExpiration`; por ello comparte exactamente el fallo 2.1. La
lectura asistida y la autorización de escritura son caminos distintos.

## 3. Firmas verificadas en el backend

### 3.1 Helper existente

```sql
public.has_company_role(
  _user_id uuid,
  _company_id uuid,
  _role text
) returns boolean
```

Propiedades observadas:

- `SECURITY DEFINER`;
- `search_path = public`;
- compara `_role` contra `company_users.role`;
- considera `company_owner` y propietario global;
- tiene `EXECUTE` disponible para `authenticated` y otros roles heredados del
  estado actual del backend.

No existe una segunda firma cuyo tercer argumento sea `app_role`.

### 3.2 Enum existente

`public.app_role` existe y contiene, en el orden observado:

```text
admin, employee, developer, owner, manager, supervisor, founder
```

El enum es válido. El defecto no es un valor faltante: es usar ese tipo en una
posición donde la firma disponible exige `text`.

### 3.3 Diferencia con `has_role`

También existe:

```sql
public.has_role(_user_id uuid, _role app_role) returns boolean
```

`has_role` y `has_company_role` tienen contratos diferentes:

- `has_role` consulta rol global y acepta `app_role`;
- `has_company_role` consulta membresía de empresa y acepta `text`.

La coexistencia de ambos contratos probablemente favoreció el uso mecánico de
`::app_role` en callers de `has_company_role`, pero no los vuelve
intercambiables.

Los tipos TypeScript generados reflejan correctamente esta diferencia en el
estado actual del repositorio: `_role: string` para `has_company_role` y
`has_exact_company_role`, frente a `_role: app_role` para `has_role`. Por tanto,
el snapshot de tipos del cliente no explica el error ni presenta drift en este
punto; el defecto está en cuerpos SQL server-side.

### 3.4 Diferencia con `has_exact_company_role`

También existe `has_exact_company_role(uuid, uuid, text)`, creado como helper
`SECURITY DEFINER` para evitar recursión en RLS de `company_users`. Su semántica
es deliberadamente más estrecha:

- exige una coincidencia exacta en `company_users.role`;
- no trata `company_owner` como superrol;
- no incorpora el bypass de propietario global.

No puede sustituirse mecánicamente por `has_company_role`; hacerlo cambiaría
límites de privilegio aunque ambas funciones compartan los tipos de entrada.

## 4. Arqueología de migraciones

### 4.1 Origen del helper

La definición histórica en
`20260225015055_3301a19b-e11e-47c3-92a7-f5b374a8d2b6.sql` creó
`has_company_role(uuid, uuid, text)`. La migración
`20260318192629_9635b091-49bb-4cee-9b31-bd2120e91606.sql` volvió a definirla
con la misma firma `text` para reconocer `company_owner`.

No se encontró en las 426 migraciones locales ninguna creación, reemplazo,
eliminación o alteración de una sobrecarga con `app_role`.

### 4.2 Evolución de `app_role`

El repositorio muestra:

- creación inicial con `admin`, `employee`;
- adición posterior de `owner`, `manager`;
- adición de `developer`, `supervisor`, `founder`.

Estas ampliaciones no cambiaron la firma de `has_company_role`.

### 4.3 Introducción de callers incompatibles

La búsqueda estática encontró 69 llamadas a `has_company_role` en 24 archivos
de migración:

- 16 llamadas con cast explícito `::app_role`;
- 53 llamadas con literal no tipado u otra forma compatible con `text`;
- ninguna definición posterior que armonice ambos lados del contrato.

Los casts incompatibles aparecen en:

| Migración | Área | Llamadas `::app_role` |
|---|---|---:|
| `20260802021158_...` | W-9 / Workers | 4 |
| `20260802021810_...` | Documentos | 6 |
| `20260802023647_...` | Configuración de empresa | 4 |
| `20260802023856_...` | Ajuste de configuración | 2 |

La migración de Documentos creó RPCs sintácticamente válidas: PL/pgSQL puede
almacenar el cuerpo y resolver determinadas sentencias al ejecutarlas. Por eso
la migración pudo quedar aplicada y el defecto aparecer sólo en runtime.

### 4.4 Estado aplicado frente al repositorio

El backend consultado registra 428 migraciones y tiene como última versión
`20260803031549`. Las migraciones VWC relevantes de Workers, Documentos y
Configuración figuran aplicadas y sus definiciones activas conservan los casts
`::app_role`.

En migraciones antiguas existen pequeñas diferencias de identificador temporal
entre algunos nombres locales y entradas del ledger; no cambian el hallazgo,
porque se verificaron directamente las definiciones activas de las funciones.

Sólo hay un backend enlazado y consultable desde este proyecto. No fue posible
comparar una segunda base independiente etiquetada como staging o producción.
En el entorno activo, repositorio y runtime coinciden para las RPC afectadas.

## 5. RLS y orden efectivo de autorización

### 5.1 Políticas de documentos

Las políticas actuales de `employee_documents` y
`employee_onboarding_documents` no contienen llamadas directas problemáticas a
`has_company_role(..., app_role)`. La inspección de políticas activas que sí
usan `has_company_role` muestra argumentos `text`.

Por ello, el error observado en Documentos **no es emitido por una policy RLS**.
Es emitido por la autorización interna de una RPC `SECURITY DEFINER`.

### 5.2 Orden de ejecución

En ambas RPC de Documentos la comprobación incompatible ocurre antes de:

- seleccionar la fila por `id` y `company_id`;
- bloquearla con `FOR UPDATE`;
- comparar `expected_version`;
- ejecutar `UPDATE`;
- insertar `versioned_write_audit`;
- registrar el resultado aplicado o el conflicto.

Esto explica simultáneamente el error visible y la ausencia de una mutación
parcial de documento.

### 5.3 Seguridad del aislamiento

Aunque la operación falla, los contratos de las RPC sí transportan
`company_id` y las consultas posteriores filtran por documento y empresa. No
se encontró evidencia de lectura o escritura cruzada causada por este defecto.
El problema es de disponibilidad de operaciones autorizadas, no una evidencia
de bypass multi-tenant.

## 6. Radio de impacto

### 6.1 Impacto directo en Documentos

| Operación | RPC | Resultado actual |
|---|---|---|
| Editar `name`, `category`, `expires_at` | `versioned_update_employee_document` | Falla al autorizar |
| Aprobar documento admin | `review_employee_document` | Falla al autorizar |
| Rechazar documento admin | `review_employee_document` | Falla al autorizar |
| Pedir reemplazo | `review_employee_document` | Falla al autorizar |
| Marcar vencido / volver a pendiente | `review_employee_document` | Falla al autorizar |
| Revisar documento de onboarding | `review_employee_document` | Falla al autorizar |

Las lecturas, listados, filtros, URLs firmadas y descarga no atraviesan estas
llamadas y no quedan explicados por este error.

### 6.2 Callers activos adicionales

La inspección estática de funciones activas encontró 10 funciones con llamada
explícita `has_company_role(..., ::app_role)`:

1. `versioned_update_employee_document`;
2. `review_employee_document`;
3. `submit_contractor_w9`;
4. `review_contractor_w9`;
5. `versioned_update_company_setting`;
6. `versioned_update_company_profile`;
7. `can_manage_shift_company`;
8. `shift_closeout_can_admin`;
9. `shift_closeout_can_final_approve`;
10. `user_is_company_admin`.

Clasificación:

| Área | Funciones | Riesgo |
|---|---:|---|
| Documentos | 2 | bloqueo de edición y revisión |
| Workers / W-9 | 2 | bloqueo de envío/revisión según rama ejecutada |
| Configuración de empresa | 2 | bloqueo de escritura versionada |
| Servicios / cierre / autorización compartida | 4 | fallo directo o transitivo en callers |

El radio real excede Documentos. Cualquier función o policy que invoque una de
las funciones auxiliares afectadas puede fallar de forma transitiva aunque su
propio texto use argumentos correctos.

### 6.3 Lo que no debe inferirse

- No se comprobó que las 10 funciones fallen en todos sus caminos; una rama
  puede retornar antes de alcanzar la llamada incompatible.
- No se observó corrupción de datos.
- No se observó sobrescritura silenciosa.
- No se observó elevación de privilegios.
- No se debe confundir este inventario con una autorización para corregir las
  áreas adyacentes.

## 7. Análisis de causa raíz

### 7.1 Causa inmediata

Contrato de tipos inconsistente entre helper y caller:

```text
declarado: has_company_role(uuid, uuid, text)
invocado:  has_company_role(uuid, uuid, app_role)
```

### 7.2 Causa sistémica

No existe un contrato único, tipado y verificado para autorización de empresa.
El ecosistema mezcla:

- `has_role(..., app_role)` para roles globales;
- `has_company_role(..., text)` para roles de membresía;
- literals no tipados;
- casts explícitos a `text`;
- casts explícitos a `app_role`;
- wrappers adicionales como `user_is_company_admin`.

Los tests guardianes de VWC verifican PATCH, conflictos y ausencia de updates
directos, pero no compilan/ejecutan cada rama de autorización con una sesión
real ni validan las firmas de sus dependencias SQL.

La búsqueda en `src/test`, `tests/e2e` y `scripts` no encontró referencias a
`has_company_role`, `has_exact_company_role` o `has_role`: no existe cobertura
automatizada directa del contrato de tipos ni de la semántica de estos helpers.

### 7.3 Factores contribuyentes

1. `company_users.role` y `user_roles.role` representan ámbitos distintos.
2. `app_role` contiene valores usados en ambos ámbitos, pero no define por sí
   mismo el contrato de `company_users`.
3. PL/pgSQL permitió desplegar cuerpos cuyo fallo se manifestó al ejecutar.
4. Las pruebas A/B de concurrencia pueden cubrir la lógica VWC mediante rutas
   o identidades que no reproduzcan cada comprobación de autorización activa.
5. Los callers recientes copiaron el patrón correcto de `has_role` a un helper
   con firma diferente.

### 7.4 Hallazgos secundarios del flujo de Documentos

No explican el error SQL y no se corrigieron, pero quedan registrados para no
perder evidencia:

1. Los dos flujos de edición de vencimiento convierten un conflicto VWC en un
   mensaje de error, pero no abren el diálogo canónico de reconciliación que sí
   usan aprobar/rechazar. No hay falso éxito, pero la recuperación es manual.
2. El log adicional de cliente en `activity_log` es best-effort y tiene catch
   silencioso. La auditoría transaccional principal permanece en
   `versioned_write_audit` y `document_review_events`; los reportes que dependan
   sólo de `activity_log` podrían quedar incompletos.
3. La subida administrativa usa un `INSERT` acotado directo. Es un carril de
   creación, no una sobrescritura versionada, pero su auditoría no usa el mismo
   formato VWC que edición y transición.
4. El bloqueo de revisión de documentos W-9 se observó en la UI; la RPC genérica
   de revisión de documentos no repite esa restricción por categoría. Esto es
   un hallazgo de defensa en profundidad, no la causa del incidente actual.
5. La RPC y el trigger de revisión comparten parte de la lógica de estado. Una
   excepción del trigger puede propagarse como error SQL genérico en vez de una
   respuesta canónica de negocio.

## 8. Evidencia de no mutación durante esta auditoría

La investigación usó exclusivamente:

- lectura de archivos y búsqueda estática en el repositorio;
- consultas de catálogo (`pg_proc`, `pg_type`, `pg_enum`, `pg_policies`,
  `information_schema.triggers` y ledger de migraciones);
- lectura de definiciones con `pg_get_functiondef`;
- lectura de logs disponibles.

No se ejecutaron:

- `INSERT`, `UPDATE`, `DELETE`, `MERGE` o `TRUNCATE`;
- DDL;
- migraciones;
- despliegues de funciones;
- cambios de grants, RLS, policies, roles o tipos;
- llamadas funcionales que escriban documentos;
- modificaciones de datos de Quality Staff, My Staff u otra empresa.

El único archivo creado es este informe.

## 9. Recomendaciones para un bloque posterior (no implementadas)

Estas recomendaciones describen criterios de remediación; no forman parte de
esta auditoría:

1. Elegir un contrato canónico para rol de empresa y aplicarlo de forma
   consistente a helper, wrappers y callers.
2. No corregir sólo las dos RPC de Documentos: inventariar las 10 funciones
   activas afectadas y sus dependientes transitivos.
3. Añadir una prueba de catálogo que falle si un cuerpo activo llama
   `has_company_role` con un tipo no soportado.
4. Añadir pruebas autenticadas de ejecución para cada rama autorizada y
   denegada, no sólo pruebas de texto SQL.
5. Mantener separados los conceptos de rol global y rol por empresa.
6. Probar aislamiento multi-tenant y autorización antes de reabrir escrituras.
7. Verificar que la remediación no amplíe privilegios ni cambie la semántica de
   `company_owner`, propietario global, manager o supervisor.

## 10. Reproducción exacta y evidencia de ejecución

### 10.1 Recorrido reproducido

El recorrido autenticado observado fue:

1. ruta `/app/documents`;
2. apertura de un documento `employee_documents` pendiente;
3. edición de `expires_at`;
4. pulsación de **Guardar fecha de vencimiento**;
5. respuesta de la RPC con
   `function public.has_company_role(uuid, uuid, app_role) does not exist`;
6. presentación del error de guardado;
7. documento aún pendiente y sin cambio de metadata.

Trazabilidad frontend exacta:

| Dato | Evidencia |
|---|---|
| Ruta | `/app/documents` |
| Pantalla | `src/pages/admin/DocumentsCenter.tsx` |
| Componente | `ExpirationCell` (líneas 629–724) |
| Acción | `ExpirationCell.handleSave` (líneas 667–689) |
| Hook de carga | `useCompanyDocuments` |
| Helper de escritura | `updateDocumentExpiration` (`src/lib/document-actions.ts`, líneas 344–398) |
| Carril | `versionedWrite` |
| RPC | `public.versioned_update_employee_document` |
| Tabla objetivo | `public.employee_documents` |
| Patch | `{ "expires_at": <date-or-null> }` |
| Control VWC | `p_expected_version = row.version` |
| Superficie | `documents:expiration` |
| Respuesta | error SQL de resolución de función; no JSON VWC |

El payload lógico enviado por el cliente contiene
`p_document_id`, `p_company_id`, `p_patch`, `p_expected_version`, `p_surface`
y `p_intent_key`. Los identificadores reales de usuario, empresa y documento
se mantienen fuera de este documento; fueron tratados como evidencia sensible.

### 10.2 Datos que no quedaron capturados de forma fiable

No se conserva evidencia suficiente para publicar un timestamp exacto de la
petición, SQLSTATE, rol PostgreSQL efectivo ni `search_path` de esa sesión. El
mensaje completo disponible no incluye SQLSTATE. La función activa sí declara
`SET search_path = public`, pero eso no equivale a afirmar el `search_path` de
la conexión cliente. Estos campos quedan marcados **no verificados**, no
inferidos.

El entorno reproducido fue el backend activo enlazado al proyecto. No hay
evidencia independiente que permita etiquetarlo simultáneamente como preview,
staging y producción.

## 11. Inventario de `app_role`

| Atributo | Resultado verificado |
|---|---|
| Schema | `public` |
| Tipo | enum `public.app_role` |
| Valores activos | `admin`, `employee`, `developer`, `owner`, `manager`, `supervisor`, `founder` |
| Duplicados homónimos | no observados en el backend consultado |
| Movido de schema | sin evidencia |
| Reemplazado por `text` | no; el enum sigue activo |
| Callers con casts | existen callers `::app_role`, `::text` y literales no tipados |
| Policies dependientes | existen policies con helpers de rol; las policies activas de documentos no usan la firma incompatible |

Cronología verificable:

1. el enum nació con `admin` y `employee`;
2. migraciones posteriores añadieron `owner`, `manager`, `developer`,
   `supervisor` y `founder`;
3. esas ampliaciones no alteraron `has_company_role(uuid, uuid, text)`;
4. no apareció una sobrecarga de `has_company_role` con `app_role`.

La clasificación de hipótesis queda así:

| Hipótesis | Veredicto |
|---|---|
| tipo inexistente | descartada |
| tipo en otro schema | descartada; está en `public` |
| helper con `text`, caller con enum | **confirmada** |
| orden de argumentos | correcto; no causa el incidente |
| sobrecarga ambigua | descartada; falta la sobrecarga enum |
| `search_path` | no es causa: ambos objetos están cualificados o en `public` |
| migración de compatibilidad faltante | no existe en el repositorio; no se puede calificar como “faltante” sin una decisión de contrato |
| drift runtime/repositorio | descartado para las RPC afectadas en el backend activo |

## 12. Auditoría completa de acciones de Documentos

| Acción | Camino | Dependencia del helper | Momento del fallo | Efecto parcial / consistencia |
|---|---|---|---|---|
| Subir documento admin | storage + `INSERT employee_documents` | no por estas RPC | no afectada por este error | si falla el insert, intenta limpiar el blob; no se observó falso éxito |
| Editar metadata | `versioned_update_employee_document` | `app_role` incompatible | antes de lock/update | cero write y cero auditoría VWC |
| Guardar vencimiento | mismo RPC, patch `expires_at` | `app_role` incompatible | antes de lock/update | cero write; estado permanece igual |
| Aprobar | `review_employee_document` | `app_role` incompatible | antes de lock/transición | cero transición y cero evento |
| Rechazar | `review_employee_document` | `app_role` incompatible | antes de lock/transición | cero transición y cero evento |
| Pedir corrección/reemplazo | `review_employee_document` | `app_role` incompatible | antes de lock/transición | cero transición y cero evento |
| Reemplazar archivo | flujo de carga, separado de las dos RPC | no demostrado por este error | no clasificado como fallido | requiere QA posterior específico |
| Historial | lectura | no | no afectado | lectura solamente |
| Eliminar/archivar | no forma parte de estas dos RPC | no demostrado | no clasificado como fallido | fuera del incidente probado |
| Exportar/abrir/descargar | lectura/URL firmada | no | no afectado | lectura solamente |
| Asignar a persona | no pasa por la RPC de vencimiento | no demostrado | no clasificado como fallido | requiere auditoría separada si se modifica |

La UI no presenta falso éxito en el caso reproducido: recibe `error`, muestra
fallo y no ejecuta el `onSaved` de éxito. La auditoría VWC no se genera porque
la excepción ocurre antes del primer insert de auditoría.

## 13. Inventario de policies, triggers y funciones intermedias

### 13.1 Objeto exacto que dispara el incidente

No es una policy ni un trigger. Es la sentencia de autorización interna de la
función `SECURITY DEFINER` `public.versioned_update_employee_document`, líneas
249–251 de la migración `20260802021810_...`, que invoca tres veces:

```sql
public.has_company_role(v_actor, p_company_id, '<role>'::app_role)
```

`public.review_employee_document`, líneas 72–74 de esa misma migración,
repite el defecto para transiciones.

### 13.2 RLS de tablas de documentos

Las policies activas de `employee_documents` y
`employee_onboarding_documents` no contienen la llamada incompatible. Las
policies activas encontradas que llaman `has_company_role` usan literals
resolubles como `text`. Por tanto:

- RLS sigue fail-closed;
- no se observó bypass cross-tenant;
- el fallo ocurre dentro de RPC `SECURITY DEFINER` antes del write;
- los triggers de versionado y revisión no llegan a ejecutarse en este caso.

### 13.3 Inventario funcional resumido

| Objeto | Firma relevante | Seguridad | `search_path` | Estado |
|---|---|---|---|---|
| `has_company_role` | `(uuid, uuid, text) → boolean` | `SECURITY DEFINER` | `public` | activo |
| `has_exact_company_role` | `(uuid, uuid, text)` | `SECURITY DEFINER` | contrato más estrecho | activo, no intercambiable |
| `has_role` | `(uuid, app_role) → boolean` | helper de rol global | `public` | activo, ámbito distinto |
| `versioned_update_employee_document` | `(uuid, uuid, jsonb, integer, text, text) → jsonb` | `SECURITY DEFINER` | `public` | activo, caller incompatible |
| `review_employee_document` | `(uuid, text, uuid, text, integer, text, text) → jsonb` | `SECURITY DEFINER` | `public` | activo, caller incompatible |

El helper de empresa tiene ejecución disponible para el rol autenticado y
otros grants heredados observados. El owner exacto del objeto no se reproduce
en este informe porque no quedó conservado como evidencia estable. No se debe
deducir ni cambiar ownership a partir de esta auditoría.

## 14. Radio de impacto por módulo

| Módulo | Objeto/camino | Estado | Severidad | Tenant / integridad |
|---|---|---|---|---|
| Documentos | dos RPC indicadas | fallo confirmado | **CRÍTICO** | bloqueo fail-closed; sin corrupción observada |
| Compliance | revisión de documentos compartida | fallo directo potencial/confirmado por camino | **ALTO** | impide transición; sin bypass |
| Workers / W-9 | `submit_contractor_w9`, `review_contractor_w9` | riesgo activo por rama | **ALTO** | disponibilidad; no corrupción demostrada |
| Configuración | dos RPC versionadas | riesgo activo | **ALTO** | escritura bloqueada; aislamiento no debilitado |
| Servicios/cierre | cuatro helpers/wrappers enumerados en §6.2 | riesgo transitivo | **ALTO** | depende de rama y caller |
| Assignments | sin caller incompatible directo demostrado | no confirmado | **BAJO** para este incidente | sin evidencia de impacto |
| Invitations | sin caller incompatible demostrado | no confirmado | **BAJO** | sin evidencia |
| `service_requests` | sin caller incompatible demostrado | no confirmado | **BAJO** | sin evidencia |
| Validation | posible dependencia transitiva, no reproducida | riesgo potencial | **MEDIO** | fail-closed esperado |
| Portal | W-9 y superficies que alcancen wrappers | riesgo potencial | **MEDIO/ALTO** | según operación |
| Admin | Documentos y configuración | afectado | **CRÍTICO** en Documentos |
| Edge functions | no se encontró caller directo que explique este caso | no confirmado | **BAJO** | sin evidencia |
| Payroll / Time Clock | fuera del alcance y sin vínculo causal demostrado | no evaluado | no clasificado | no tocar |

“Riesgo activo” no significa fallo reproducido en cada rama. Sólo Documentos
tiene reproducción ligada al incidente reportado; el resto exige QA específico
antes de afirmar impacto real.

## 15. Diff por entorno

| Entorno | `app_role` | `has_company_role` | RPC afectadas | Resultado |
|---|---|---|---|---|
| Repositorio/local estático | enum definido en migraciones | `(uuid,uuid,text)` | contienen `::app_role` | incompatibilidad demostrable por inspección |
| Preview/backend activo | existe con valores inventariados | sólo `(uuid,uuid,text)` | activas con casts enum | **afectado y reproducido** |
| Staging independiente | no accesible desde este proyecto | no verificado | no verificado | indeterminado |
| Producción independiente | no accesible como base separada | no verificado | no verificado | indeterminado |

El ledger del backend activo registra 428 migraciones hasta
`20260803031549`; las migraciones relevantes figuran aplicadas. No existe base
técnica para afirmar un diff “real” staging–producción sin conexiones
independientes. Tampoco se encontró evidencia demostrable de hotfix manual no
versionado. Las discrepancias menores de nombres temporales en migraciones
antiguas no alteran las definiciones activas verificadas.

## 16. Seguridad de una remediación futura

Una corrección superficial puede ampliar privilegios si cambia semántica en
vez de sólo alinear tipos. Debe preservarse:

- `auth.uid()` como identidad del actor;
- comprobación explícita de `p_company_id`;
- filtro conjunto por `id` y `company_id`;
- fail-closed ante ausencia de membresía;
- diferencias entre rol global y rol por empresa;
- semántica actual de `company_owner` y propietario global;
- `SECURITY DEFINER` con `SET search_path` seguro;
- grants mínimos de `EXECUTE`;
- versión esperada, bloqueo de fila y auditoría transaccional.

No debe sustituirse por `has_exact_company_role`, desactivar la autorización,
confiar en el rol enviado por el cliente, conceder ejecución pública adicional,
quitar el filtro tenant ni convertir todo el modelo de roles a `text` sin una
decisión de dominio y pruebas de equivalencia.

## 17. Causa raíz exacta

**La migración `20260802021810_efb18f84-f84f-466d-bcfb-60d8bdcddd36.sql`
desplegó `versioned_update_employee_document` y `review_employee_document` con
llamadas explícitas a `public.has_company_role(uuid, uuid, public.app_role)`,
pero el helper creado en `20260225015055_...` y redefinido en
`20260318192629_...` conserva únicamente la firma
`public.has_company_role(uuid, uuid, text)`; el backend activo no tiene una
sobrecarga enum ni conversión implícita aplicable, por lo que PostgreSQL aborta
la RPC antes de leer, bloquear, actualizar o auditar el documento.**

## 18. Opciones de corrección — no implementadas

### Opción A — Alinear callers al contrato canónico existente (recomendada)

- **Cambio:** migración versionada que ajuste los callers activos
  incompatibles para pasar el tipo contractual de rol de empresa, sin cambiar
  lógica, roles admitidos ni firma pública del helper.
- **Objetos:** primero las dos RPC de Documentos; el mismo bloque debe resolver
  las demás funciones activas incompatibles o impedir que quede contrato mixto.
- **Riesgo:** bajo/moderado si el cambio es exclusivamente de tipos y se compara
  la semántica antes/después.
- **RLS/multi-tenant:** sin cambio esperado; debe probarse explícitamente.
- **Compatibilidad:** mantiene la firma histórica y los 53 callers compatibles.
- **Downtime/datos:** no requiere migración de datos; normalmente sin downtime.
- **Rollback:** restaurar las definiciones previas de las funciones desde una
  migración inversa; las operaciones volverían a fallar cerradas.

### Opción B — Sobrecarga temporal estricta

- **Cambio:** sobrecarga enum que delegue explícitamente al contrato canónico,
  sólo si hay callers externos imposibles de migrar en el mismo despliegue.
- **Riesgo:** moderado; duplica superficie pública y puede perpetuar ambigüedad.
- **RLS/multi-tenant:** debe demostrar equivalencia y conservar `auth.uid()`.
- **Compatibilidad:** alta, pero crea deuda y exige fecha de retiro.
- **Downtime/datos:** no requiere datos ni downtime.
- **Rollback:** retirar la sobrecarga una vez migrados todos los callers.
- **Recomendación:** no usar salvo incompatibilidad externa demostrada.

### Opción C — Migración consolidada del contrato de autorización

- **Cambio:** normalizar helper, wrappers, callers, grants y pruebas de catálogo
  en una sola versión si una comparación independiente confirma drift amplio.
- **Riesgo:** alto por radio de seguridad; requiere revisión formal.
- **RLS/multi-tenant:** impacto potencial amplio.
- **Compatibilidad:** debe mantener una ventana explícita o migración atómica.
- **Downtime/datos:** no necesita datos; puede requerir ventana controlada.
- **Rollback:** restauración coordinada de todas las definiciones y grants.

**Recomendación:** Opción A, mediante una única migración revisada y atómica,
después de inventariar todos los callers activos. No crear una función nueva ni
hacer un cast rápido aislado en Documentos.

## 19. Riesgos y plan de rollback

Riesgos principales de una futura corrección:

1. convertir un fallo cerrado en acceso cross-tenant;
2. confundir rol global con membresía de empresa;
3. cambiar la jerarquía efectiva de owner/admin/manager;
4. dejar algunas funciones con el contrato antiguo y otras con uno nuevo;
5. ampliar grants de ejecución;
6. introducir `search_path` inseguro en `SECURITY DEFINER`;
7. recuperar writes sin recuperar auditoría y control de versión.

Rollback propuesto para el bloque futuro:

1. conservar definiciones previas completas y grants;
2. desplegar la corrección como una sola migración reversible;
3. si falla autorización o aislamiento, restaurar cuerpos y grants previos;
4. verificar que el sistema vuelve a fail-closed;
5. no revertir datos porque la alineación de contrato no debe migrarlos;
6. revisar auditoría para confirmar que no hubo writes cross-tenant durante la
   ventana.

## 20. Plan de QA posterior a aprobación

Tras aprobar e implementar una corrección, ejecutar en desktop y móvil:

1. admin guarda `expires_at`; persiste tras refresh;
2. owner repite la operación;
3. manager, si la política aprobada lo permite, repite;
4. usuario sin permisos recibe denegación sin write;
5. usuario de otra empresa recibe denegación sin existencia observable;
6. aprobar documento pendiente;
7. rechazar con motivo;
8. pedir corrección/reemplazo;
9. reemplazar documento conforme al flujo autorizado;
10. conflicto A/B conserva el cambio ganador;
11. auditoría VWC y evento de revisión se generan una sola vez;
12. `activity_log` no se usa como única evidencia transaccional;
13. RLS sigue activa y fail-closed;
14. IDs cruzados documento/empresa devuelven `not_found` o denegación segura;
15. descarga y URL firmada mantienen sus permisos;
16. pruebas de catálogo validan firma de cada dependencia;
17. pruebas autenticadas cubren ramas permitidas y denegadas;
18. W-9, configuración y servicios/cierre se prueban por separado antes de
    declarar cerrado el radio sistémico.

## 21. Cierre

**Diagnóstico final:** las escrituras y transiciones de Documentos fallan
porque sus RPC llaman `has_company_role` con `app_role`, pero el backend sólo
ofrece la firma con `text`. El mismo patrón está activo en ocho funciones fuera
de Documentos, por lo que el incidente tiene radio sistémico de autorización.

**Confirmación obligatoria:** esta auditoría no implementó fixes, no cambió
seguridad, no modificó datos y no alteró RLS, permisos, roles, funciones ni
migraciones.

**“No se realizó ninguna modificación de código, migración, RLS, función SQL ni
dato de producción durante esta auditoría.”**