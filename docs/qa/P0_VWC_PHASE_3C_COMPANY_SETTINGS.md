# P0 — VWC Fase 3C · Configuración de empresa (no financiera)

Alcance: editores de **configuración operativa y de identidad** de la empresa.
Prohibido y no tocado: billing, planes, payroll, RLS, permisos, roles y
activación/desactivación de tenants.

Superficie migrada: `/app/company-config` (`src/pages/admin/CompanyConfig.tsx`).

---

## 1. Inventario y clasificación de campos

| Clase | Definición | Campos | Trato en 3C |
|---|---|---|---|
| **A — Identidad visual** | Nombre visible, logo, color de marca (`companies`) | `name`, `logo_url`, `brand_color` | Migrado a VWC |
| **B — Operativos no financieros** | Geofence, tolerancias, auto-cierre, auto-validación, scheduling no financiero | `geofence`, `time_tolerance`, `auto_close`, `auto_validation`, `shifts_config`, `clock_config` | Migrado a VWC |
| **C — Preferencias de producto** | Onboarding, numeración de empleado, notificaciones, portal, branding, auto-dispatch | `onboarding_config`, `employee_number_config`, `notifications`, `branding`, `portal`, `auto_dispatch` | Migrado a VWC |
| **D — Financieros (bloqueados)** | Semana de corte, horas extra, tipos de pago, secuencias de nómina | `pay_week`, `overtime`, `pay_types`, `payroll_config`, `payroll_sequence` | **Solo lectura** en UI, badge «Se gestiona en Payroll». Sin cambios de carril |
| **E — Tenant / plataforma (bloqueados)** | Activación, plan, propietario, tipo de tenant | `is_active`, `plan_code`, `billing_status`, `owner_user_id`, `tenant_type` | Fuera de la whitelist del RPC. Rechazo server-side |
| **F — Registro técnico** | Listas históricas y utilidades internas | `imported_schedule_files`, sync de sandbox | No editable por operador. Excepción documentada |

## 2. Carril de escritura

- Cliente: `src/lib/data/company-config-write.ts`
  - `EDITABLE_SETTING_KEYS` (clases B y C) e `isEditableSettingKey()`.
  - `EDITABLE_COMPANY_FIELDS = ["name", "logo_url", "brand_color"]` (clase A).
  - `versionedCompanySettingWrite()` / `versionedCompanyProfileWrite()` — PATCH
    parcial + `company_id` + `expected_version` + relectura y comparación campo a campo.
- Backend:
  - `versioned_update_company_setting(p_company_id, p_key, p_patch, p_expected_version, p_surface, p_intent_key)`
    — whitelist de claves, merge JSONB server-side (`value || patch`), bloqueo de
    fila `FOR UPDATE`, auditoría en `versioned_write_audit`.
  - `versioned_update_company_profile(...)` — whitelist de columnas, rechazo
    explícito de campos protegidos, nombre no vacío, auditoría.
  - Permisos: admin/owner de la empresa, u owner/developer de plataforma.
  - `version` añadida a `company_settings` y `companies` con trigger de auto-incremento.
- Conflicto: `VersionConflictDialog` con `kind="config"` → «Conservar mis cambios»
  (reaplica sólo el patch sobre la versión nueva) o «Volver a editar con la versión nueva».

## 3. Reglas de UI

- Guardado por bloque (no «guardar todo»): cada tarjeta muestra su `versión N` y
  el badge «Sin guardar» cuando hay borrador pendiente.
- El logo nuevo se sube con `upsert: false` y no borra el archivo anterior
  (reemplazo no destructivo, historial recuperable).
- Las tarjetas financieras se renderizan en solo lectura con candado.

## 4. Evidencia QA

| Caso | Resultado |
|---|---|
| Carga de `/app/company-config` con tenant real | OK · versiones visibles por bloque |
| Guardar tolerancia y geofence (bloques distintos) | `applied` · `expected 1 → actual 2` en `versioned_write_audit` |
| **Caso A/B (mismo bloque)**: A guarda radio=133 (v1→v2); B, con v1 a la vista, guarda radio=177 | **Conflicto**: «Esta configuración cambió mientras la editabas». Nada se sobrescribe |
| Campo protegido en el patch de identidad (`is_active`) | Rechazo `invalid` server-side |
| Clave fuera de whitelist (`pay_week`) | Rechazo `invalid` server-side |

Auditoría verificada en `versioned_write_audit` (`entity in ('company_settings','companies')`).

## 4B. QA multi-tenant y A/B ejecutado sobre datos reales (2026-08-03)

Empresas: **Quality Staff by Keury** (`0000…0001`) y **My Staff Solution LLC** (`37f92f75…`).
Ejecutado invocando los RPC con la identidad real de cada operador (sin service_role),
por lo que se validan permisos, whitelist y versión tal como los ve la app.

| # | Caso | Sesión / actor | Resultado |
|---|---|---|---|
| 1 | Cambio de geocerca sólo en Quality Staff | A · owner de Quality Staff | `applied` v1→v2. My Staff **sin cambios** |
| 2 | Cambio de geocerca sólo en My Staff | B · owner de My Staff | `applied` v3→v4. Quality Staff **sin cambios** (200 m vs 133 m, valores independientes) |
| 3 | Admin **exclusivo** de My Staff intenta editar identidad de Quality Staff | B estricto | `denied` — «No tienes permiso para editar esta empresa» |
| 4 | Mismo admin intenta editar `company_settings` de Quality Staff | B estricto | `denied` |
| 5 | Clave de payroll `pay_week` desde este carril | B | `invalid` — clave fuera de whitelist |
| 6 | Campo de tenant `is_active` en el patch de identidad | B | `invalid` — «Campos protegidos: is_active» |
| 7 | **Conflicto A/B**: A guarda `brand_color` (v1→v2); B, con v1 a la vista, guarda `logo_url` | A owner / B admin | B recibe `conflict` `expected 1 → actual 2`. **El color de A permanece**; nada se sobrescribe |
| 8 | B recarga la versión nueva y reaplica su logo | B | `applied` v2→v3 con **ambos cambios vivos** (`brand_color` de A + `logo_url` de B) |

Aislamiento de estado y caché en cliente (verificado en código):
- `useCompanyConfig` usa `queryKey = ["company_config", key, selectedCompanyId]` — no hay caché compartida entre tenants.
- `CompanyConfig.tsx` descarta `drafts`, `rows` y `company` al cambiar de empresa (`useEffect` sobre `selectedCompanyId`).
- Toda lectura filtra por `company_id`/`id` de la empresa activa y toda escritura viaja con `p_company_id`.
- El branding se lee de la fila de la empresa activa; no existe estado global de marca compartido.

Evidencia en `versioned_write_audit` (`surface like 'qa:3c%'`): 6 `applied` y 2 `conflict/stale_version`,
todos con el `company_id` correcto. Los valores de prueba fueron revertidos al cierre
(color, logo y geocerca originales en ambas empresas).

**Cero impacto** en billing, payroll, permisos, roles, RLS, ownership, subscription,
integraciones, secrets y activación de compañías: ninguna de esas columnas o claves
está en la whitelist de los RPC y los intentos (casos 5 y 6) son rechazados server-side.
No se modificó código ni esquema de esos dominios en esta fase.


## 5. Tests guardianes

`src/test/versioned-write.test.ts` — 23/23 en verde. Nuevos:
- claves financieras y de tenant no editables por este carril;
- identidad limitada a `name`/`logo_url`/`brand_color`;
- toda escritura viaja con `company_id` y `expected_version`;
- la pantalla no hace `.update()`/`.upsert()` directos;
- el reemplazo de logo no borra el archivo anterior;
- caso A/B de conflicto.

## 6. Excepciones temporales (inventario, sólo puede reducirse)

| Archivo | Razón | Owner | Fase objetivo | Riesgo |
|---|---|---|---|---|
| `src/hooks/useCompanyConfig.tsx` | claves de payroll fuera de alcance | Payroll | 3F | Lost update en config de nómina (sin regresión) |
| `src/hooks/usePayrollConfig.tsx` | configuración financiera | Payroll | 3F | Igual al anterior |
| `src/pages/admin/ImportSchedule.tsx` | registro histórico `imported_schedule_files` | Importaciones | 3D | Bajo (lista append-only) |
| `src/components/SandboxSyncDialog.tsx` | herramienta interna de sandbox | Plataforma | 3D | Bajo (no producción) |
| `src/pages/admin/Companies.tsx` | alta/baja y activación de tenant | Plataforma | 3D | Tenant |
| `src/hooks/useBilling.tsx`, `src/components/billing/UpgradeRequestDialog.tsx` | billing/plan | Billing | 3F | Fuera de alcance por orden explícita |

## 7. Consistencia entre superficies (refresh · desktop · móvil)

- `/app/company-config` es la **única** superficie de edición: móvil y escritorio renderizan
  el mismo componente con el mismo carril de escritura (no hay editor móvil paralelo).
- Tras guardar, la vista invalida su query y **relee del backend**; el valor mostrado es
  siempre la fila persistida, no el borrador local. Un refresh devuelve exactamente el mismo
  estado (comprobado en los casos 1, 2 y 8: las relecturas del RPC coinciden con la fila final).
- El branding consumido por el resto de la app (cabeceras, `ContextSwitcher`) sale de la fila
  de la empresa activa; no hay copia persistida en `localStorage` ni estado global de marca.
- Nota: la verificación con navegador autenticado no pudo ejecutarse en este turno
  (sesión de preview cerrada); la evidencia funcional es la ejecución de RPC con identidad
  real más la auditoría, y la carga visual verificada en la corrida anterior de esta fase.

## 8. Cierre

**La configuración no financiera de empresa ya no permite sobrescrituras silenciosas ni
contaminación entre tenants.**

## 9. Siguiente bloque

Bloque D — Ubicaciones (`locations`, `locations_v2`) y superficies de plataforma,
precedido por el paso de consolidación del carril genérico (regla «VWC como infraestructura»).

