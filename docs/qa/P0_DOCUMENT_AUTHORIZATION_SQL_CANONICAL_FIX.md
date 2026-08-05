# P0 — Corrección canónica de autorización SQL

**Estado:** HALT seguro en precheck; migración no aplicada.  
**Fecha del precheck final:** 2026-08-05 UTC.  
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
sería retirar el cast incompatible del literal interno, por ejemplo:

```diff
- public.has_company_role(v_actor, p_company_id, 'admin'::app_role)
+ public.has_company_role(v_actor, p_company_id, 'admin')
```

El literal no procede de parámetros ni del cliente: queda codificado dentro del
caller y PostgreSQL lo resuelve contra el tercer argumento `text` de la única
firma disponible. No usa SQL dinámico, no amplía los roles admitidos y replica
el patrón canónico ya activo en los otros seis objetos inventariados.

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
6. Una revisión estática independiente corroboró los cuatro callers afectados:
   Documentos y W-9. También confirmó que Configuración fue corregida por la
   migración posterior `20260802024442`, mientras los cuatro helpers compartidos
   nunca tuvieron el cast incompatible en el historial local inspeccionado.

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

## 14. Precheck final solicitado (2026-08-05 UTC)

### 14.1 Inventario exacto de literals por función

Consulta de catálogo realizada contra los cuerpos activos mediante
`pg_get_functiondef`. Los literals indicados son exactamente los pasados al
tercer argumento de `public.has_company_role`.

| Función | Literals exactos activos | Tipo efectivo | ¿Todos pertenecen a `app_role`? |
|---|---|---|---|
| `versioned_update_employee_document` | `'admin'::app_role`, `'owner'::app_role`, `'manager'::app_role` | `app_role` incompatible con la firma real | sí |
| `review_employee_document` | `'admin'::app_role`, `'owner'::app_role`, `'manager'::app_role` | `app_role` incompatible con la firma real | sí |
| `submit_contractor_w9` | `'admin'::app_role`, `'owner'::app_role` | `app_role` incompatible con la firma real | sí |
| `review_contractor_w9` | `'admin'::app_role`, `'owner'::app_role` | `app_role` incompatible con la firma real | sí |
| `versioned_update_company_setting` | `'admin'`, `'owner'` | literal desconocido resuelto como `text` | sí |
| `versioned_update_company_profile` | `'admin'`, `'owner'` | literal desconocido resuelto como `text` | sí |
| `can_manage_shift_company` | `'manager'`, `'supervisor'` | literal desconocido resuelto como `text` | sí |
| `shift_closeout_can_admin` | `'admin'`, `'manager'`, `'owner'`, `'supervisor'` | literal desconocido resuelto como `text` | sí |
| `shift_closeout_can_final_approve` | `'owner'`, `'admin'` | literal desconocido resuelto como `text` | sí |
| `user_is_company_admin` | `'admin'` | literal desconocido resuelto como `text` | sí |

Conjunto válido observado en `public.app_role`: `admin`, `employee`, `developer`,
`owner`, `manager`, `supervisor`, `founder`. La unión de literals usada por los
diez callers es `admin`, `owner`, `manager`, `supervisor`; es subconjunto estricto
del enum. No hay un rol procedente de parámetros de cliente.

Nota de precisión: `can_manage_shift_company` también llama a `has_role` con
`developer`, `owner` y `founder`; esos casts son correctos porque esa función sí
recibe `app_role` y quedan fuera del diff. Lo mismo aplica a los usos de
`has_role` en otros callers.

### 14.2 Firma real del backend activo

Existe una única función:

```sql
public.has_company_role(_user_id uuid, _company_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
```

Owner: `postgres`. No existe `(uuid, uuid, app_role)`. El cuerpo exige coincidencia
de `user_id` y `company_id`, acepta el rol solicitado o `company_owner`, y conserva
el bypass global preexistente mediante `is_global_owner(_user_id)`.

### 14.3 Diff de atributos: antes frente a después proyectado

No existe un «después aplicado». El único después admisible, si se elimina el
drift y se autoriza el inventario corregido de cuatro, debe ser:

| Atributo | Antes activo | Después proyectado | Diff permitido |
|---|---|---|---|
| Seguridad, 10 callers | `SECURITY DEFINER` | `SECURITY DEFINER` | ninguno |
| Owner, 10 callers | `postgres` | `postgres` | ninguno |
| `search_path`, 10 callers | `public` | `public` | ninguno |
| Retorno | 6 RPC `jsonb`; 4 helpers `boolean` | idéntico | ninguno |
| Firma de cada caller | firma activa inventariada | idéntica | ninguno |
| Firma de `has_company_role` | `(uuid, uuid, text)` | idéntica | ninguno |
| Cuerpo, 4 afectados | literals con `::app_role` | mismos literals sin cast | retirar sólo el cast |
| Cuerpo, 6 compatibles | literals `text` | idéntico | ninguno |

Por tanto, el diff `SECURITY DEFINER / INVOKER` es **cero**: ningún objeto puede
cambiar a INVOKER ni viceversa.

### 14.4 Owner y grants antes/después

Owner activo de los once objetos consultados (diez callers más helper canónico):
`postgres`. Owner proyectado: `postgres`. Diff: ninguno.

ACL activa y ACL proyectada, sin cambios:

- `versioned_update_company_setting` y `versioned_update_company_profile`:
  `postgres=X/postgres`, `anon=X/postgres`, `authenticated=X/postgres`,
  `service_role=X/postgres` y rol de inspección enlazado `=X/postgres`; `PUBLIC`
  permanece revocado.
- Los otros ocho callers y `has_company_role`: ejecución explícita para
  `postgres`, `anon`, `authenticated`, `service_role` y rol de inspección, más
  ejecución heredada por `PUBLIC`, exactamente como está hoy.

El fix futuro no debe emitir `GRANT`, `REVOKE`, `ALTER OWNER` ni cambiar la ACL.
El precheck no interpreta estos grants históricos como autorización suficiente:
los cuerpos siguen derivando identidad de `auth.uid()` y aplicando sus gates.

### 14.5 RLS y policies

Estado activo capturado antes de cualquier cambio:

| Tabla de alcance | RLS | Policies |
|---|---:|---:|
| `companies` | habilitado | 2 |
| `company_settings` | habilitado | 3 |
| `contractor_w9` | habilitado | 5 |
| `employee_documents` | habilitado | 4 |
| `employee_onboarding_documents` | habilitado | 2 |
| `scheduled_shifts` | habilitado | 7 |
| `shift_assignments` | habilitado | 8 |

Total: 31 policies. Huella ordenada de definiciones:
`30122f95212df943dc4bb2d5aa631c68`. El fix proyectado no contiene DDL sobre
tablas, RLS o policies. Resultado de este precheck: **cero cambios en RLS y cero
cambios en policies**.

### 14.6 Matriz esperada por función

Estos son criterios de QA post-fix, no resultados ejecutados. En las cuatro
funciones afectadas, el resultado activo actual sigue siendo error de resolución
de firma antes de lock, escritura o auditoría cuando se alcanza el gate.

| Función | Usuario autorizado, post-fix | Usuario sin permiso | Tenant incorrecto |
|---|---|---|---|
| `versioned_update_employee_document` | `applied`/`noop` según patch y versión; auditoría `applied` | `denied`, cero write | `denied` en gate o `not_found`; cero write |
| `review_employee_document` | `applied`/`noop`; transición y auditoría correctas | `denied`, cero transición | `denied` en gate o `not_found`; cero transición |
| `submit_contractor_w9` | trabajador dueño o admin/owner: `applied`; auditoría `applied` | `denied`, cero envío | `not_found` por empleado fuera de empresa, o `denied`; cero write |
| `review_contractor_w9` | admin/owner: `applied`/`noop`; auditoría correcta | `denied`, cero transición | `denied` en gate o `not_found`; cero transición |
| `versioned_update_company_setting` | `applied`/conflicto VWC legítimo | `denied`, cero write | `denied`; cero write |
| `versioned_update_company_profile` | `applied`/conflicto VWC legítimo | `denied`, cero write | `denied`; cero write |
| `can_manage_shift_company` | `true` | `false` | `false` |
| `shift_closeout_can_admin` | `true` | `false` | `false` |
| `shift_closeout_can_final_approve` | `true` | `false` | `false` |
| `user_is_company_admin` | `true` | `false` | `false` |

Para las RPC, un caso cross-tenant puede devolver `denied` antes de buscar la
entidad o `not_found` tras un gate permitido por rol global; ambos son fail-closed
si no existe mutación, no se retorna la fila ajena y no se registra `applied`.

### 14.7 SQL de rollback preparado

El rollback exacto de una futura corrección debe restaurar los cuatro cuerpos
previos completos desde estas fuentes inmutables del repositorio:

- W-9: `supabase/migrations/20260802021158_2f521744-97af-419c-829e-7f38c09a6735.sql`,
  líneas 118–250 y 255–333.
- Documentos: `supabase/migrations/20260802021810_efb18f84-f84f-466d-bcfb-60d8bdcddd36.sql`,
  líneas 30–208 y 213–299.

El SQL listo para ejecutar es la concatenación, dentro de una única transacción,
de esos cuatro `CREATE OR REPLACE FUNCTION` completos, seguida de estas
restauraciones defensivas:

```sql
ALTER FUNCTION public.submit_contractor_w9(uuid, uuid, jsonb, integer, text, text)
  OWNER TO postgres;
ALTER FUNCTION public.review_contractor_w9(uuid, uuid, text, integer, text, text)
  OWNER TO postgres;
ALTER FUNCTION public.review_employee_document(uuid, text, uuid, text, integer, text, text)
  OWNER TO postgres;
ALTER FUNCTION public.versioned_update_employee_document(uuid, uuid, jsonb, integer, text, text)
  OWNER TO postgres;

ALTER FUNCTION public.submit_contractor_w9(uuid, uuid, jsonb, integer, text, text)
  SECURITY DEFINER SET search_path TO public;
ALTER FUNCTION public.review_contractor_w9(uuid, uuid, text, integer, text, text)
  SECURITY DEFINER SET search_path TO public;
ALTER FUNCTION public.review_employee_document(uuid, text, uuid, text, integer, text, text)
  SECURITY DEFINER SET search_path TO public;
ALTER FUNCTION public.versioned_update_employee_document(uuid, uuid, jsonb, integer, text, text)
  SECURITY DEFINER SET search_path TO public;
```

Los `CREATE OR REPLACE` preservan firmas y ACL; las sentencias defensivas fijan
owner, seguridad y `search_path` al baseline. No se incluyen cambios de datos,
grants, RLS, policies, enum ni helper canónico.

**Estado de prueba del rollback:** preparado y cotejado estáticamente contra los
cuerpos activos, pero **no probado en un entorno seguro independiente** porque
este proyecto sólo expone el backend activo enlazado. Ejecutarlo allí, aun dentro
de una transacción revertida, incumpliría el HALT y no sustituiría una prueba de
staging. Por ello el requisito 9 no está satisfecho y bloquea la migración.

### 14.8 Huellas de drift y decisión final

- Ledger activo: 428 migraciones; última versión `20260803031549`.
- Drift de ledger desde el precheck anterior: no.
- Drift material del inventario: sí, sin resolver (4 incompatibles / 6 compatibles).
- Migración de corrección aplicada: no.
- QA mutante de los diez callers: no ejecutado.
- QA completo de Documentos, W-9 y Configuración: no ejecutado.
- Prueba de auditoría post-fix: no ejecutada.
- Prueba de rollback en entorno seguro: no disponible.

## 15. Criterio de cierre

Este bloque permanece en **HALT**. No se emite ninguna afirmación de migración
aplicada ni de guardado autorizado exitoso post-fix. La evidencia disponible sí
confirma: denegación fail-closed de los cuatro callers afectados por error de
firma, cero cambios persistentes, cero cambios cross-tenant, cero ampliación de
privilegios y cero modificación de módulos dependientes durante el precheck.

El cierre solicitado sólo será posible después de disponer de un entorno seguro,
resolver formalmente el inventario 4/10, aplicar una única migración atómica y
producir evidencia autenticada de éxito autorizado, denegación, aislamiento de
tenant, auditoría, rollback y regresión por entorno.