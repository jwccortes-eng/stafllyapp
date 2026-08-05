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

El SQL listo para materializar es la concatenación, dentro de una única
transacción, de esos cuatro `CREATE OR REPLACE FUNCTION` completos. Cada cuerpo
fuente ya declara `SECURITY DEFINER` y `SET search_path = public`. No debe incluir
`ALTER OWNER`, `GRANT`, `REVOKE` ni un `ALTER FUNCTION` separado: el rollback
restaura exclusivamente los cuerpos previos y `CREATE OR REPLACE` conserva owner
y ACL del objeto existente. Owner, ACL, seguridad y `search_path` deben
compararse antes/después como aserciones de QA, no reescribirse.

No se incluyen cambios de datos, grants, RLS, policies, enum ni helper canónico.

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

## 16. Revisión independiente

Una auditoría estática independiente posterior corroboró:

- la firma local única `(uuid, uuid, text)` y ausencia de sobrecarga `app_role`;
- los literals exactos y la clasificación runtime 4 incompatibles / 6 compatibles;
- que Configuración tuvo versiones intermedias incompatibles en
  `20260802023647` y `20260802023856`, reemplazadas por la versión compatible
  `20260802024442`;
- que los cuatro helpers compartidos nunca usaron el cast incompatible en el
  historial local;
- que el rollback no puede declararse probado sin staging aislado.

La revisión señaló que owner y grants no pueden inferirse sólo del historial
local. Esa incertidumbre quedó resuelta mediante consulta directa al catálogo
activo: owner `postgres`, ACL detallada en §14.4, `SECURITY DEFINER` y
`search_path=public` para los diez callers. No se realizó ninguna escritura.

## 17. Precheck de ejecución autorizado — 2026-08-05 04:52 UTC

### 17.1 Resultado vinculante

**HALT — no se aplicó migración.** La consulta nueva al catálogo activo confirma
que persiste drift material respecto del inventario de diez callers de la fuente
obligatoria `P0_DOCUMENT_AUTHORIZATION_SQL_FULL_AUDIT.md`:

- cuatro callers conservan argumentos `app_role` incompatibles;
- seis callers ya usan literales compatibles con `text`;
- reemplazar los diez cuerpos no sería una corrección mínima y violaría la
  condición expresa de no ejecutar ante cualquier diferencia relevante.

No se ejecutaron DDL, `CREATE OR REPLACE FUNCTION`, cambios de datos ni QA
mutante. Las fases 2 a 5 quedan bloqueadas por la fase 1.

### 17.2 Contrato, atributos y versión observados nuevamente

| Comprobación | Evidencia activa |
|---|---|
| Schema | `public` |
| Firma única | `has_company_role(uuid, uuid, text)` |
| Sobrecarga `app_role` | no existe |
| Retorno / lenguaje | `boolean` / `sql` |
| Volatilidad | `STABLE` |
| Owner | `postgres` |
| Seguridad | `SECURITY DEFINER` |
| `search_path` | `public` |
| ACL | `PUBLIC`, `postgres`, `anon`, `authenticated`, `service_role` y rol de inspección conservan ejecución; sin cambios |
| Backend | PostgreSQL `17.6`, 64-bit, aarch64 |
| Ledger | 428 migraciones; última versión `20260803031549` |

El helper conserva exactamente la lógica existente: coincidencia de
`user_id`, `company_id` y rol; reconocimiento de `company_owner`; y bypass
global preexistente mediante `is_global_owner(_user_id)`. No se modificó esa
semántica.

### 17.3 Los diez callers y literales activos

| Caller | Literales pasados a `has_company_role` | Estado |
|---|---|---|
| `versioned_update_employee_document` | `'admin'::app_role`, `'owner'::app_role`, `'manager'::app_role` | incompatible |
| `review_employee_document` | `'admin'::app_role`, `'owner'::app_role`, `'manager'::app_role` | incompatible |
| `submit_contractor_w9` | `'admin'::app_role`, `'owner'::app_role` | incompatible |
| `review_contractor_w9` | `'admin'::app_role`, `'owner'::app_role` | incompatible |
| `versioned_update_company_setting` | `'admin'`, `'owner'` | canónico `text` |
| `versioned_update_company_profile` | `'admin'`, `'owner'` | canónico `text` |
| `can_manage_shift_company` | `'manager'`, `'supervisor'` | canónico `text` |
| `shift_closeout_can_admin` | `'admin'`, `'manager'`, `'owner'`, `'supervisor'` | canónico `text` |
| `shift_closeout_can_final_approve` | `'owner'`, `'admin'` | canónico `text` |
| `user_is_company_admin` | `'admin'` | canónico `text` |

Los casts `::app_role` presentes en `can_manage_shift_company` y otros helpers
compatibles pertenecen a llamadas distintas a `has_role(uuid, app_role)` y son
correctos. No forman parte del diff. Todos los roles usados por los diez callers
pertenecen al enum activo: `admin`, `employee`, `developer`, `owner`, `manager`,
`supervisor`, `founder`.

### 17.4 Drift corroborado contra historial

El ledger confirma la migración `20260802024442`, que reemplazó los dos callers
de Configuración con literales `text`. Sus cuerpos activos coinciden con esa
versión. Los cuatro helpers compartidos también son compatibles. En cambio, los
dos callers de Documentos y los dos de W-9 conservan los cuerpos incompatibles
de `20260802021810` y `20260802021158`, respectivamente.

Resultado: el inventario activo no coincide con la afirmación histórica de diez
callers incompatibles. La diferencia es material y obliga al HALT.

### 17.5 Seguridad y rollback

- Owner, ACL, `SECURITY DEFINER` y `search_path` de los diez callers se
  capturaron otra vez; no cambiaron durante este precheck.
- Las siete tablas de alcance conservan RLS habilitado y 31 policies.
- No se ejecutaron cambios de auth, roles, `app_role`, grants, policies, RLS,
  auditoría, contratos frontend ni datos.
- No se creó helper, overload, wrapper o bypass.
- El rollback sigue preparado desde los cuatro cuerpos inmutables identificados
  en §14.7, pero no puede declararse probado porque no existe un entorno seguro
  independiente accesible. Probarlo contra el backend activo incumpliría el
  propio HALT.

### 17.6 QA no ejecutado por condición de parada

No se ejecutaron guardados de Documentos, flujo W-9, Configuración, conflicto
VWC ni pruebas mutantes de tenant. Sin migración no existe un estado post-fix
válido que probar. La evidencia de seguridad de este precheck se limita a:

- cero cambios persistentes;
- cero ampliación de privilegios;
- cero cambios de RLS, auth, grants, owner o `search_path`;
- cero bypass nuevo y cero exposición cross-tenant introducida por esta
  ejecución, porque no hubo ejecución de migración.

La confirmación textual de cierre solicitada no se emite: sería falsa mientras
cuatro callers sigan usando el tipo incompatible. El bloque permanece abierto y
detenido hasta reconciliar formalmente el alcance activo de cuatro callers y
disponer de un entorno seguro para validar rollback y QA autenticado.

## 18. Fix mínimo autorizado de cuatro callers — 2026-08-05 04:58 UTC

### 18.1 Resultado del precheck final activo

El inventario activo se cerró antes de la escritura y coincidió exactamente con
las cuatro definiciones aprobadas. La migración incorporó estas mismas
precondiciones y habría abortado toda la transacción ante cualquier diferencia
de firma, cuerpo, owner, ACL, seguridad o `search_path`.

| Caller / firma | Módulo y acción protegida | Roles | Identidad y tenant check | Atributos precheck |
|---|---|---|---|---|
| `versioned_update_employee_document(uuid,uuid,jsonb,integer,text,text)` | Documentos: editar `name`, `category`, `expires_at` | `admin`, `owner`, `manager` | `v_actor := auth.uid()`; autorización por `p_company_id`; fila por `id + company_id` | owner `postgres`; `SECURITY DEFINER`; `search_path=public`; ACL `6f435071…`; cuerpo `edc073ec…` |
| `review_employee_document(uuid,text,uuid,text,integer,text,text)` | Documentos: aprobar, rechazar, pedir corrección/reemplazo, expirar o volver a pendiente | `admin`, `owner`, `manager` | `v_actor := auth.uid()`; gate por `p_company_id`; ambos orígenes consultan `id + company_id` | owner `postgres`; `SECURITY DEFINER`; `search_path=public`; ACL `6f435071…`; cuerpo `4f0e9880…` |
| `submit_contractor_w9(uuid,uuid,jsonb,integer,text,text)` | W-9: crear o reenviar formulario | trabajador dueño, `admin`, `owner` | `v_actor := auth.uid()`; empleado por `id + company_id`; formulario por `employee_id + company_id` | owner `postgres`; `SECURITY DEFINER`; `search_path=public`; ACL `6f435071…`; cuerpo `00e0270c…` |
| `review_contractor_w9(uuid,uuid,text,integer,text,text)` | W-9: aprobar o rechazar | `admin`, `owner` | `v_actor := auth.uid()`; gate por `p_company_id`; formulario por `id + company_id` | owner `postgres`; `SECURITY DEFINER`; `search_path=public`; ACL `6f435071…`; cuerpo `f46c811a…` |

Los grants efectivos eran idénticos para los cuatro: ejecución para `PUBLIC`,
`postgres`, `anon`, `authenticated`, `service_role` y el rol de inspección del
entorno. Se capturaron como ACL, no se reinterpretaron ni modificaron. Todos los
cuerpos derivaban la identidad exclusivamente de `auth.uid()` y retornaban
`denied` cuando era nula.

### 18.2 Migración aplicada

Migración única: `20260805045812_ac9b62ed-659d-4a7b-9fbc-35541000fc41`.

Propiedades verificadas:

- una transacción y un advisory lock de alcance específico;
- precheck de la firma única `has_company_role(uuid,uuid,text)`;
- guardas por firma, MD5 de cuerpo, owner, ACL, `SECURITY DEFINER` y
  `search_path` para cada caller;
- idempotencia: acepta el MD5 anterior o el canónico y sólo reemplaza el cuerpo
  anterior;
- postcondiciones dentro de la misma transacción;
- cero DML, `GRANT`, `REVOKE`, `ALTER OWNER`, cambio de RLS, roles o enum;
- cero referencia a los seis callers compatibles.

### 18.3 Diff exacto

No cambió ninguna sentencia salvo los argumentos literales de
`has_company_role`:

```diff
- 'admin'::app_role
+ 'admin'
- 'owner'::app_role
+ 'owner'
- 'manager'::app_role
+ 'manager'
```

Aplicación por caller: tres retiros de cast en cada función de Documentos y dos
en cada función W-9. Total: diez casts retirados. No cambió un literal, operador,
orden de autorización, `auth.uid()`, tenant check, whitelist, transición, VWC o
auditoría.

MD5 post-migración:

| Caller | MD5 canónico |
|---|---|
| `versioned_update_employee_document` | `c688b184a805ec52bfd8a078c3422547` |
| `review_employee_document` | `d578874705aa00fca0d92317108a4bb2` |
| `submit_contractor_w9` | `4f2508951e9cf928f57e38b0c17b0a80` |
| `review_contractor_w9` | `248fe3e66756eb036c5530a3bdef4de7` |

### 18.4 Objetos expresamente no modificados

Los dos callers ya corregidos conservaron sus MD5:

- `versioned_update_company_setting`: `946f6cce6b21eb35cee193f52d837e32`;
- `versioned_update_company_profile`: `bee3a8e324a1b5f1e70fe10c62569937`.

Los cuatro callers que nunca tuvieron el defecto también conservaron sus MD5:

- `can_manage_shift_company`: `95c2ed512b8dc6bb25342dd1ea5d5059`;
- `shift_closeout_can_admin`: `3bf9dba60305bd0e7e75f1a4c30b39d1`;
- `shift_closeout_can_final_approve`: `d1f770e230231481c68f7051988125f4`;
- `user_is_company_admin`: `c8c5225ad1dff7cd71388e0c1605fb99`.

### 18.5 QA ejecutado y límites de evidencia

**Catálogo y seguridad:** los cuatro cuerpos ya no contienen una llamada
`has_company_role(..., ::app_role)`. Owner `postgres`, ACL, `SECURITY DEFINER` y
`search_path=public` son idénticos antes/después. Las tablas
`employee_documents`, `employee_onboarding_documents` y `contractor_w9`
conservan RLS habilitado y sus huellas de 4, 2 y 5 policies, respectivamente.

**Usuario sin sesión:** se invocaron los cuatro RPC mediante el rol público con
identificadores nulos no existentes. Los cuatro devolvieron HTTP 200 con estado
de negocio `denied` y mensaje de sesión no válida. No se produjo error de firma,
mutación ni auditoría: `versioned_write_audit` registró cero filas con la
superficie de QA.

**Persistencia:** se verificaron conteos posteriores de 69 documentos, 0
documentos de onboarding y 8 W-9, junto con cero filas de auditoría de la prueba
denegada. Esto prueba ausencia de escritura para el caso sin sesión, no un
guardado autorizado.

**QA autenticado autorizado, usuario autenticado sin rol y cross-tenant:** no se
pudo ejecutar porque la sesión de preview estaba cerrada (`signed_out`) y no se
fabricaron credenciales ni identidades. Por la misma razón no se declaran
validados todavía el guardado de vencimiento/metadata, las transiciones de
Documentos ni el flujo W-9 completo. Configuración no pertenece a los cuatro
callers y sus cuerpos permanecieron intactos.

El linter global continúa reportando hallazgos históricos del proyecto. No se
introdujo un nuevo helper ni se cambió el perfil de seguridad de estos cuatro
objetos; corregir ACLs históricas quedó expresamente fuera de alcance.

### 18.6 Rollback

El rollback preparado restaura exclusivamente los cuatro cuerpos completos de
`20260802021810` y `20260802021158` mediante `CREATE OR REPLACE FUNCTION`, sin
`DROP`, DML, `GRANT`, `REVOKE`, `ALTER OWNER` ni cambios de RLS. Los MD5 de
retorno esperados son `edc073ec…`, `4f0e9880…`, `00e0270c…` y `f46c811a…`.

**No se declara probado:** este proyecto no expone un entorno seguro independiente
y ejecutar rollback/reapply sobre el backend activo violaría el requisito de
prueba aislada. La migración aplicada conserva las guardas necesarias para una
reaplicación idempotente, pero eso no sustituye una prueba de rollback.

### 18.7 Estado de cierre

La parte estructural del fix mínimo está aplicada y verificada. El cierre P0
completo permanece condicionado a una sesión autenticada para probar autorizado,
denegado con identidad, cross-tenant, persistencia y auditoría, y a un entorno
seguro para probar rollback.

Confirmación verificable actual:

> Solo se modificaron los cuatro callers incompatibles confirmados. No se
> tocaron los callers compatibles, RLS, grants, owner, roles ni datos.

## 19. QA final solicitado — 2026-08-05 05:00 UTC

### 19.1 Condiciones de ejecución

El QA final comenzó con dos guardas obligatorias:

- sesión administrada del preview: `signed_out`;
- entorno seguro independiente para rollback: no disponible; sólo está enlazado
  el backend activo.

Por tanto, no se fabricaron credenciales, no se suplantaron identidades y no se
ejecutó el rollback sobre el entorno activo. Conforme al criterio de cierre, el
**Authenticated path permanece UNVERIFIED** y el bloque no puede declararse
cerrado.

### 19.2 Catálogo post-fix y atributos protegidos

La migración `20260805045812_ac9b62ed-659d-4a7b-9fbc-35541000fc41` figura en el
ledger activo. Una nueva lectura de `pg_proc` confirmó:

| Caller | MD5 activo | Schema | Owner | Seguridad | `search_path` | Retorno |
|---|---|---|---|---|---|---|
| `versioned_update_employee_document` | `c688b184a805ec52bfd8a078c3422547` | `public` | `postgres` | DEFINER | `public` | `jsonb` |
| `review_employee_document` | `d578874705aa00fca0d92317108a4bb2` | `public` | `postgres` | DEFINER | `public` | `jsonb` |
| `submit_contractor_w9` | `4f2508951e9cf928f57e38b0c17b0a80` | `public` | `postgres` | DEFINER | `public` | `jsonb` |
| `review_contractor_w9` | `248fe3e66756eb036c5530a3bdef4de7` | `public` | `postgres` | DEFINER | `public` | `jsonb` |

Las firmas siguen siendo exactamente las registradas en §18.1 y la ACL de los
cuatro continúa con huella `6f43507185d891bbb39a6636918e8fda`. Ninguno contiene
ya una llamada `has_company_role(..., <literal>::app_role)`. El helper compartido
permanece único con firma `(uuid, uuid, text)`, retorno `boolean`, owner
`postgres`, `SECURITY DEFINER` y `search_path=public`.

### 19.3 Seis callers compatibles

El smoke estructural volvió a confirmar sin reemplazar ni ejecutar sus cuerpos:

| Caller compatible | MD5 activo | Resultado |
|---|---|---|
| `versioned_update_company_setting` | `946f6cce6b21eb35cee193f52d837e32` | intacto |
| `versioned_update_company_profile` | `bee3a8e324a1b5f1e70fe10c62569937` | intacto |
| `can_manage_shift_company` | `95c2ed512b8dc6bb25342dd1ea5d5059` | intacto |
| `shift_closeout_can_admin` | `3bf9dba60305bd0e7e75f1a4c30b39d1` | intacto |
| `shift_closeout_can_final_approve` | `d1f770e230231481c68f7051988125f4` | intacto |
| `user_is_company_admin` | `c8c5225ad1dff7cd71388e0c1605fb99` | intacto |

Nota: los dos callers de Configuración contienen casts `::app_role` válidos en
llamadas a otros helpers tipados; no pasan esos casts a `has_company_role`.
No se realizó smoke mutante autenticado por ausencia de sesión.

### 19.4 RLS, policies, auditoría y datos

Las siete tablas de alcance conservan RLS habilitado y el mismo número de
policies: `companies` 2, `company_settings` 3, `contractor_w9` 5,
`employee_documents` 4, `employee_onboarding_documents` 2,
`scheduled_shifts` 7 y `shift_assignments` 8. No se emitió DDL ni DML durante
este QA. La superficie reservada `p0_auth_fix_qa%` mantiene **cero** filas en
`versioned_write_audit`.

El linter devuelve 156 advertencias históricas globales, incluyendo ejecución
pública de funciones `SECURITY DEFINER`; no se corrigieron ni reclasificaron
porque grants y seguridad están expresamente fuera de alcance. No se observó
un cambio atribuible al fix mínimo.

### 19.5 Matriz funcional final

| Área | Autorizado | Sin rol | Otro tenant | Sin sesión |
|---|---|---|---|---|
| `versioned_update_employee_document` | **UNVERIFIED** | **UNVERIFIED** | **UNVERIFIED** | `denied`, verificado en §18.5 |
| `review_employee_document` | **UNVERIFIED** | **UNVERIFIED** | **UNVERIFIED** | `denied`, verificado en §18.5 |
| `submit_contractor_w9` | **UNVERIFIED** | **UNVERIFIED** | **UNVERIFIED** | `denied`, verificado en §18.5 |
| `review_contractor_w9` | **UNVERIFIED** | **UNVERIFIED** | **UNVERIFIED** | `denied`, verificado en §18.5 |

En consecuencia, guardado de `expires_at`, edición de metadata, approve, reject,
correction, replacement, fila afectada, auditoría autorizada y persistencia tras
refresh permanecen **UNVERIFIED**. Tampoco puede afirmarse cero acceso
cross-company mediante evidencia E2E hasta probar al menos dos identidades de
tenants distintos; la estructura SQL sigue aplicando `auth.uid()` y
`id + company_id`, pero esa revisión estática no sustituye el escenario real.

### 19.6 Rollback

El rollback continúa preparado y cotejado estáticamente contra los cuatro MD5
anteriores, pero **UNVERIFIED en ejecución**. No se aplicó sobre el backend
activo porque el encargo prohíbe hacerlo en producción sin necesidad y no existe
un staging independiente enlazado. Tampoco se ejecutó reapply ni smoke posterior.

### 19.7 Decisión de cierre

**NO CERRADO.** La corrección estructural de los cuatro callers y la invariancia
de los seis compatibles están demostradas. Faltan sesión real con identidades
autorizada, sin rol y cross-tenant, además de un entorno seguro para rollback.
Por ello no se emite la confirmación final solicitada: afirmar QA autenticado,
denegación con identidad, cero acceso cross-tenant y rollback probado sería
incorrecto con la evidencia disponible.