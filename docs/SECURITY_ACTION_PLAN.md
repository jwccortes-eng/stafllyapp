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

---

## Reglas de Prevención (Checklist para futuros cambios)

### Base de Datos
- [ ] **Toda nueva tabla** debe tener RLS habilitado + políticas restrictivas
- [ ] **Toda nueva vista** debe usar `security_invoker = on`
- [ ] **Nunca exponer** `phone_number`, `email`, `access_pin`, `driver_licence`, `tin_encrypted` en vistas públicas
- [ ] **Queries de empleados** → usar `employees_safe` (nunca la tabla directa)
- [ ] **Queries del portal** → usar `profiles_safe` (nunca `profiles` directamente)
- [ ] **Nuevas políticas RLS** → nunca usar `USING (true)` para INSERT/UPDATE/DELETE
- [ ] **Foreign keys** → nunca referenciar `auth.users` directamente; usar `profiles`

### Código Frontend
- [ ] **Portal del empleado** → solo importar datos de vistas `_safe`
- [ ] **Selects explícitos** → siempre especificar columnas (nunca `select("*")` con datos sensibles)
- [ ] **No exponer** IDs internos de Supabase, URLs de proyecto, o claves en el cliente
- [ ] **Validar rol** antes de mostrar datos sensibles (usar `useAuth().role`)

### Edge Functions
- [ ] **Validar `auth.uid()`** en toda función que modifique datos
- [ ] **Sanitizar inputs** (regex para teléfonos, trim para texto)
- [ ] **Enmascarar errores** técnicos → mensajes genéricos al usuario
- [ ] **Validar firmas** de webhooks (Stripe, etc.)

### Proceso
- [ ] **Antes de cada migración** → revisar si afecta datos sensibles
- [ ] **Después de cada migración** → ejecutar linter de seguridad
- [ ] **Mensualmente** → revisar políticas RLS de tablas con datos PII
- [ ] **Al agregar nueva tabla** → documentar qué campos son sensibles

---

## Arquitectura de Acceso por Rol

| Dato | Owner | Admin | Manager | Empleado |
|------|-------|-------|---------|----------|
| Tabla `employees` (completa) | ✅ | ✅ | Con permiso módulo | Solo su registro |
| Vista `employees_safe` | ✅ | ✅ | ✅ | ❌ |
| Tabla `profiles` (con email) | ✅ | ✅ | ✅ (co-miembros) | Solo propio + conversaciones |
| Vista `profiles_safe` (solo nombre) | ✅ | ✅ | ✅ | ✅ |
| Datos fiscales (W-9, TIN) | ✅ | ✅ | ❌ | Solo propio |
| Nómina (movements, periods) | ✅ | ✅ | Con permiso | Solo propio (portal) |

---

## Advertencia Pendiente (Pre-existente)

- **RLS Policy Always True** en alguna tabla → revisar y restringir en próximo sprint
