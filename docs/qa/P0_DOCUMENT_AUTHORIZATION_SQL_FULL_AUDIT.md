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

## 10. Cierre

**Diagnóstico final:** las escrituras y transiciones de Documentos fallan
porque sus RPC llaman `has_company_role` con `app_role`, pero el backend sólo
ofrece la firma con `text`. El mismo patrón está activo en ocho funciones fuera
de Documentos, por lo que el incidente tiene radio sistémico de autorización.

**Confirmación obligatoria:** esta auditoría no implementó fixes, no cambió
seguridad, no modificó datos y no alteró RLS, permisos, roles, funciones ni
migraciones.