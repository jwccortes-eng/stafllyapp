# Plan de Acción de Seguridad — Stafly

## Hallazgos Corregidos (Marzo 2026)

### 1. ✅ Datos personales de empleados expuestos a managers
- **Problema**: La vista `employees_safe` incluía `phone_number` y `email`
- **Fix**: Recreada sin columnas sensibles (`phone_number`, `email`, `access_pin`, `driver_licence` nunca estuvieron)
- **Impacto**: Managers y empleados ya no pueden ver teléfono/email de compañeros vía la vista segura

### 2. ✅ Emails de perfiles expuestos a empleados
- **Problema**: La política RLS "Company members can view co-member profiles" permitía a cualquier empleado ver emails de todos los compañeros
- **Fix**: Política reemplazada → solo Admin/Manager pueden ver perfiles de co-miembros. Empleados solo ven perfiles en sus conversaciones (política existente). Portal usa `profiles_safe` (solo `full_name`)
- **Impacto**: Empleados ya no pueden acceder a emails de compañeros

### 3. ✅ Vistas con Security Definer
- **Problema**: Vistas creadas como SECURITY DEFINER por defecto (bypass RLS)
- **Fix**: `ALTER VIEW SET (security_invoker = on)` en `employees_safe` y `profiles_safe`

### 4. ✅ Columna `tin_encrypted` residual en `contractor_w9`
- **Problema**: La columna existía en el schema aunque ningún código frontend la usaba. Riesgo de escritura accidental futura
- **Fix**: `ALTER TABLE contractor_w9 DROP COLUMN tin_encrypted`
- **Patrón correcto**: Solo `tin_last4` (últimos 4 dígitos) se almacena — nunca el TIN completo

### 5. ✅ Políticas RLS "Always True" en INSERT/UPDATE
- **Problema**: 5 políticas con `WITH CHECK (true)` o `USING (true)` en operaciones de escritura
- **Tablas afectadas**: `review_flags`, `review_requests`, `review_scores`
- **Fix**: Políticas restringidas a `authenticated` + verificación de rol (`developer`, `owner`, `admin`, `company_owner`, o `manager` según tabla)
- **Excepción aceptada**: `demo_requests` INSERT mantiene `WITH CHECK (true)` → es un formulario público de landing page, restringido a roles `anon` y `authenticated`

### 6. ✅ Tabla `parceros_event_queue` con RLS sin políticas
- **Problema**: RLS habilitado pero ninguna política definida (tabla inaccesible pero sin protección explícita)
- **Fix**: Política `FOR ALL` restringida a roles `developer` y `owner`

### 7. ✅ Dependencia vulnerable `vite-plugin-pwa`
- **Problema**: `serialize-javascript`, `@rollup/plugin-terser`, `workbox-build` con vulnerabilidades de severidad alta
- **Fix**: `vite-plugin-pwa` actualizado a v0.21.1

---

## Reglas de Prevención (Checklist para futuros cambios)

### Base de Datos
- [ ] **Toda nueva tabla** debe tener RLS habilitado + políticas restrictivas (nunca dejar sin políticas)
- [ ] **Toda nueva vista** debe usar `security_invoker = on`
- [ ] **Nunca exponer** `phone_number`, `email`, `access_pin`, `driver_licence`, `tin_last4` en vistas públicas
- [ ] **Queries de empleados** → usar `employees_safe` (nunca la tabla directa desde portal)
- [ ] **Queries del portal** → usar `profiles_safe` (nunca `profiles` directamente)
- [ ] **Nuevas políticas RLS** → nunca usar `USING (true)` o `WITH CHECK (true)` para INSERT/UPDATE/DELETE (excepto formularios públicos intencionalmente abiertos como `demo_requests`)
- [ ] **Foreign keys** → nunca referenciar `auth.users` directamente; usar `profiles`
- [ ] **Columnas sensibles nuevas** → documentar en este archivo y confirmar que las vistas `_safe` no las incluyen
- [ ] **Nunca almacenar** TIN/SSN completo — solo últimos 4 dígitos en `tin_last4`

### Código Frontend
- [ ] **Portal del empleado** → solo importar datos de vistas `_safe`
- [ ] **Selects explícitos** → siempre especificar columnas (nunca `select("*")` con datos sensibles)
- [ ] **No exponer** IDs internos, URLs de proyecto, o claves en el cliente
- [ ] **Validar rol** antes de mostrar datos sensibles (usar `useAuth().role`)
- [ ] **Audit log** → todo CRUD de datos sensibles debe pasar por `useAuditLog` con redacción automática de campos PII

### Edge Functions
- [ ] **Validar `auth.uid()`** en toda función que modifique datos
- [ ] **Sanitizar inputs** (regex para teléfonos, trim para texto)
- [ ] **Enmascarar errores** técnicos → mensajes genéricos al usuario
- [ ] **Validar firmas** de webhooks (Stripe, etc.)
- [ ] **`search_path = 'public'`** en todas las funciones SECURITY DEFINER

### Dependencias
- [ ] **Mensualmente** → ejecutar `npm audit` y actualizar paquetes con vulnerabilidades high/critical
- [ ] **Antes de agregar** nueva dependencia → verificar que no tenga CVEs conocidos
- [ ] **Lockfiles** → revisar que no introduzcan versiones regresivas

### Proceso
- [ ] **Antes de cada migración** → revisar si afecta datos sensibles
- [ ] **Después de cada migración** → ejecutar linter de seguridad y verificar 0 warnings nuevos
- [ ] **Mensualmente** → revisar políticas RLS de tablas con datos PII
- [ ] **Al agregar nueva tabla** → documentar qué campos son sensibles en esta sección
- [ ] **Al crear triggers** → nunca atachar a schemas reservados (`auth`, `storage`, `realtime`, `supabase_functions`, `vault`)

---

## Arquitectura de Acceso por Rol

| Dato | Platform Owner | Company Owner | Admin | Manager | Empleado |
|------|---------------|---------------|-------|---------|----------|
| Tabla `employees` (completa) | ✅ | ✅ (su empresa) | ✅ | Con permiso módulo | Solo su registro |
| Vista `employees_safe` | ✅ | ✅ | ✅ | ✅ | ❌ |
| Tabla `profiles` (con email) | ✅ | ✅ | ✅ | ✅ (co-miembros) | Solo propio + conversaciones |
| Vista `profiles_safe` (solo nombre) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Datos fiscales (W-9, TIN) | ✅ | ✅ (su empresa) | ✅ | ❌ | Solo propio |
| Nómina (movements, periods) | ✅ | ✅ (su empresa) | ✅ | Con permiso | Solo propio (portal) |
| Reviews (review_flags, scores) | ✅ | ✅ | ✅ | Lectura | ❌ |
| Colas internas (parceros_event_queue) | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Campos Sensibles por Tabla

| Tabla | Campos sensibles | Protección |
|-------|-----------------|------------|
| `employees` | `access_pin`, `phone_number`, `email`, `driver_licence` | RLS por company_id + rol; vista `employees_safe` sin estos campos |
| `profiles` | `email` | RLS restrictivo; vista `profiles_safe` solo expone `full_name` |
| `contractor_w9` | `tin_last4` | Solo últimos 4 dígitos; `tin_encrypted` eliminado; audit log redacta automáticamente |
| `auth_rate_limits` | `phone_number` | Acceso solo sistema (SECURITY DEFINER) |
| `time_entries` | Geolocalización (`latitude`, `longitude`) | RLS por company_id |

---

## Política de Datos Fiscales (TIN/SSN/EIN)

> **Regla absoluta**: Nunca almacenar un TIN completo (SSN, EIN, ITIN) en la base de datos.

| Regla | Detalle |
|---|---|
| **Solo `tin_last4`** | Únicamente los últimos 4 dígitos se persisten, suficiente para verificación visual |
| **Truncar antes de guardar** | El truncamiento ocurre en el frontend/edge function antes del INSERT — nunca llega el TIN completo a la BD |
| **No cifrar el TIN completo** | Almacenar un TIN cifrado sigue siendo un riesgo (la clave de descifrado puede filtrarse). Mejor no persistirlo |
| **Excepción** | Solo si existe un requisito legal/compliance explícito (ej. IRS Form 1099 filing) se puede almacenar temporalmente con cifrado a nivel de columna + rotación de llaves, y eliminarlo post-filing |
| **Columna `tin_encrypted`** | Fue eliminada de `contractor_w9` — confirmado que no contenía datos |

---

## Changelog de Seguridad

### 2026-03-26
- **`vite-plugin-pwa`**: Actualizado de `0.21.1` → `1.2.0`
  - Corrige vulnerabilidad transitiva en `workbox-build` → `serialize-javascript` (RCE vía RegExp/Date)
  - `npm audit` confirma 0 vulnerabilidades high/critical post-actualización
  - Build compila sin errores
- **Finding `w9_tin_encryption`**: Marcado como resuelto — columna `tin_encrypted` ya no existe en BD
- **Security scan**: Re-ejecutado. Los 2 findings anteriores desaparecieron. Quedan 5 findings pre-existentes de scope RLS (documentados por separado)

---

## Estado del Linter (Última ejecución: Marzo 2026)

- **WARN residuales**: 1 — `demo_requests` INSERT `WITH CHECK (true)` → **intencional** (formulario público de landing)
- **INFO residuales**: 0
- **Vulnerabilidades npm**: 0 high/critical tras actualización de `vite-plugin-pwa` a v1.2.0
