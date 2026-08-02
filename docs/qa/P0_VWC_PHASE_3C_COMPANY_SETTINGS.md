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

## 7. Siguiente bloque

Bloque D — Ubicaciones (`locations`, `locations_v2`) y superficies de plataforma.
