# P0 — Corrección canónica de autorización SQL

**Estado:** HALT seguro en precheck; migración no aplicada.  
**Fecha del precheck:** 2026-08-04 UTC.  
**Entorno consultable:** backend activo enlazado al proyecto.  
**Fuente obligatoria:** `docs/qa/P0_DOCUMENT_AUTHORIZATION_SQL_FULL_AUDIT.md`.

## 1. Decisión de despliegue

La corrección no se aplicó porque el entorno difiere materialmente del inventario
de diez callers aprobado en el encargo. El precheck activo encontró:

- una sola firma canónica: `public.has_company_role(uuid, uuid, text)`;
- ninguna sobrecarga cuyo tercer argumento sea `public.app_role`;
- cuatro funciones activas con la llamada incompatible;
- seis funciones del inventario original que ya consumen literales compatibles
  con `text` y, por tanto, no deben modificarse.

Aplicar una migración que reemplace cuerpos de las diez funciones habría violado
las reglas «no modificar funciones fuera del inventario afectado» y «abortar si
el caller actual no corresponde al patrón auditado».

## 2. Precheck del entorno activo

### 2.1 Contrato canónico

| Atributo | Valor observado |
|---|---|
| Schema | `public` |
| Firma | `has_company_role(uuid, uuid, text)` |
| Tipo de retorno | `boolean` |
| Owner | `postgres` |
| Seguridad | `SECURITY DEFINER` |
| Volatilidad | `STABLE` |
| `search_path` | `public` |
| Sobrecarga `app_role` | no existe |
| Ambigüedad de firma | no observada |
| Grants efectivos del objeto | preservados; no se modificaron |

El cuerpo compara el rol recibido con `public.company_users.role`, reconoce
`company_owner` y delega el bypass global existente a `public.is_global_owner`.
Este precheck no cambió esa semántica.

### 2.2 Tipo de rol

`public.app_role` sigue siendo un enum independiente con los valores observados:
`admin`, `employee`, `developer`, `owner`, `manager`, `supervisor`, `founder`.
No se alteró el enum ni se aceptaron valores nuevos.

### 2.3 Ledger de migraciones

| Dato | Resultado |
|---|---|
| Migraciones aplicadas | 428 |
| Última versión | `20260803031549` |
| Última versión del informe previo | `20260803031549` |
| Drift del ledger | no observado |
| Drift de cuerpos activos | **sí; material frente al inventario de diez** |

## 3. Inventario final de los diez objetos auditados

| Función | Módulo | Estado activo de la llamada a `has_company_role` | Decisión |
|---|---|---|---|
| `versioned_update_employee_document` | Documentos / metadata | `admin`, `owner`, `manager` con `::app_role` | afectada |
| `review_employee_document` | Documentos / transición | `admin`, `owner`, `manager` con `::app_role` | afectada |
| `submit_contractor_w9` | Workers / envío W-9 | `admin`, `owner` con `::app_role` | afectada |
| `review_contractor_w9` | Workers / revisión W-9 | `admin`, `owner` con `::app_role` | afectada |
| `versioned_update_company_setting` | Configuración operativa | literales `admin`, `owner` compatibles con `text` | no modificar |
| `versioned_update_company_profile` | Branding / perfil público | literales `admin`, `owner` compatibles con `text` | no modificar |
| `can_manage_shift_company` | Servicios / autorización compartida | literales `manager`, `supervisor` compatibles con `text` | no modificar |
| `shift_closeout_can_admin` | Cierre | literales `admin`, `manager`, `owner`, `supervisor` compatibles con `text` | no modificar |
| `shift_closeout_can_final_approve` | Cierre final | literales `owner`, `admin` compatibles con `text` | no modificar |
| `user_is_company_admin` | Autorización compartida | literal `admin` compatible con `text` | no modificar |

Las apariciones de `::app_role` que aún existen en algunas de las seis funciones
compatibles pertenecen a llamadas distintas a `public.has_role(uuid, app_role)`.
No son evidencia de incompatibilidad con `has_company_role` y no deben tocarse.

## 4. Firmas y atributos preservados

Los diez objetos están en `public`, pertenecen a `postgres`, son
`SECURITY DEFINER`, declaran `search_path=public` y conservan sus tipos de
retorno (`jsonb` para los carriles de escritura y `boolean` para helpers). No se
ejecutó `CREATE OR REPLACE FUNCTION`, `ALTER FUNCTION`, cambio de owner ni
cambio de grants.

## 5. Diff exacto propuesto y no aplicado

El único cambio técnicamente compatible para las cuatro funciones afectadas
sería convertir el argumento dentro del caller, por ejemplo:

```diff
- public.has_company_role(v_actor, p_company_id, 'admin'::app_role)
+ public.has_company_role(v_actor, p_company_id, ('admin'::app_role)::text)
```

El mecanismo conserva la validación del literal por `public.app_role` y adapta
explícitamente el valor al tercer argumento `text` del helper. No usa SQL
dinámico ni acepta un rol proporcionado por el cliente.

Este diff **no fue aplicado** porque el encargo exige una migración aprobada
sobre diez callers, mientras el runtime demuestra que sólo cuatro necesitan
corrección. Se requiere reconciliar formalmente el inventario antes de una
nueva migración.

## 6. Seguridad preservada

Durante el precheck se confirmó y preservó:

- identidad derivada de `auth.uid()`;
- filtro conjunto por entidad y `company_id` en los carriles de escritura;
- roles codificados por el servidor, no recibidos desde frontend;
- `SECURITY DEFINER` y `search_path=public`;
- ausencia de SQL dinámico en el cambio propuesto;
- ausencia de nueva sobrecarga, wrapper o fuente de autorización;
- cero cambios de owner, grants, RLS, policies, roles o enum;
- cero ampliación de privilegios;
- comportamiento fail-closed actual de las cuatro funciones afectadas.

## 7. QA de Documentos

No se ejecutó QA mutante después del precheck porque no hubo despliegue. Por
tanto, no se declaran como validados el guardado de vencimiento, metadata,
aprobación, rechazo, corrección o reemplazo.

Evidencia válida disponible:

- el fallo de firma en guardado de vencimiento ya estaba reproducido en el
  informe fuente;
- el cliente no presenta falso éxito cuando la RPC devuelve el error;
- la excepción ocurre antes del lock, write y auditoría VWC;
- las políticas de documentos no contienen la firma incompatible;
- no se ejecutaron operaciones sobre archivos ni datos de documentos durante
  este precheck.

## 8. QA de W-9, configuración y autorización compartida

No existe cobertura automatizada autenticada que ejecute las ramas permitidas,
denegadas y cross-tenant de estos diez objetos. Los guardianes actuales prueban
el carril VWC y whitelists del cliente, pero no el contrato SQL de
`has_company_role`.

Resultados honestos del precheck:

- W-9: dos RPC siguen afectadas; QA funcional no ejecutado;
- configuración: las dos RPC activas ya usan el contrato `text`; no se tocaron;
- cierre y autorización compartida: los cuatro helpers activos ya usan el
  contrato `text`; no se tocaron;
- persistencia, auditoría y casos cross-tenant posteriores al fix: pendientes
  porque no existe fix aplicado.

## 9. Comparación de entornos

| Entorno | Firma antes | Migración aplicada | Callers corregidos | QA |
|---|---|---|---|---|
| Backend activo enlazado | sólo `(uuid,uuid,text)` | no | 0 | precheck de catálogo |
| Staging independiente | no accesible | no | no verificable | no ejecutado |
| Producción independiente | no accesible | no | no verificable | no ejecutado |

No se asumió equivalencia entre entornos y no se promovió ningún cambio.

## 10. Rollback

No se aplicó migración, por lo que no hubo nada que revertir. El rollback de
datos, funciones, RLS y grants fue un no-op verificado por ausencia de cambios.

Antes de una futura aplicación deberá adjuntarse una migración inversa que
restaure exclusivamente los cuatro cuerpos previos completos, mantenga la
función canónica y no toque datos, auditoría, RLS ni grants. No es correcto
declarar ese rollback «probado» hasta ejecutarlo en un entorno seguro separado.

## 11. Observabilidad

No hubo ventana de despliegue. En consecuencia, no se generaron nuevos eventos
de autorización ni auditoría atribuibles a este bloque. No se registraron datos
sensibles, identificadores de documentos ni contenido fiscal.

La futura ejecución debe correlacionar función, entorno, timestamp, actor y
`company_id`, registrando sólo resultado y error SQL, y vigilar errores de
firma, denegaciones inesperadas, intentos cross-tenant y fallos de auditoría.

## 12. Riesgos pendientes y condición para reanudar

1. El informe fuente sobredimensiona el inventario activo: seis de los diez
   objetos no contienen actualmente la llamada incompatible.
2. Las cuatro RPC realmente afectadas continúan fallando cerradas en las ramas
   que alcanzan el cast incompatible.
3. No hay tests autenticados del contrato SQL para los diez objetos.
4. No existen conexiones independientes para verificar staging y producción.
5. No se puede satisfacer el criterio «diez callers corregidos» sin modificar
   seis funciones que no requieren corrección.

Para reanudar se necesita aprobar el inventario runtime corregido de cuatro
callers, o aportar evidencia de otro entorno donde los diez cuerpos sigan el
patrón incompatible. Sólo entonces corresponde preparar una migración única,
su rollback exacto y el QA autenticado por entorno.

## 13. Confirmación explícita

**No se aplicó ninguna migración ni se modificaron funciones, datos, RLS,
policies, grants, roles, `app_role`, auth, payroll, fichajes, storage, contratos
frontend, VWC o auditoría existente.**

La confirmación final solicitada todavía no puede emitirse como cierre porque
cuatro callers activos siguen incompatibles. El estado verificable es:

> Los callers compatibles continúan usando la única firma canónica existente;
> la remediación de los cuatro callers incompatibles fue detenida de forma
> segura por drift material, sin ampliar privilegios, modificar RLS ni permitir
> acceso cross-tenant.