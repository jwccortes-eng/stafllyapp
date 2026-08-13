# P1 — Stafly Canonical Role & Scope Model

Fecha: 2026-08-13
Estado: implementado sobre la infraestructura de permisos existente (sin tablas nuevas, sin RLS nueva, sin segunda consola).

Cadena oficial:

```text
Auth User → Company Membership (company_users.role) → Role Template (role_templates)
          → Permissions (permission-catalog.ts) → Scope (role-model.ts)
```

---

## FASE 1 — Auditoría del modelo actual

Plantillas existentes antes de este trabajo (todas `is_system = true`, `company_id = NULL`):

| Plantilla original | Acciones | Diagnóstico |
|---|---|---|
| Supervisor de Turnos | crear_turno, editar_turno, eliminar_turno, asignar_turno, cerrar_turno, reabrir_turno | Reutilizable → **Shift Administrator** (solo renombrar) |
| Supervisor de Reloj | editar_clock, aprobar_clock, cerrar_dia, reabrir_dia, alerta_no_clock, alerta_fuera_geofence | Reutilizable → **Time & Closeout Administrator** (solo renombrar) |
| Gestor de Nómina | crear_nomina, editar_nomina, aprobar_nomina, exportar_nomina, ver_salarios, ver_reportes | Reutilizable → **Payroll Administrator**, quitando `aprobar_nomina` (separación preparar / aprobar) |
| Administrador de Empresa | configurar_empresa, ver_reportes, ver_salarios, exportar_nomina | Se conserva sin cambios como perfil de configuración; el Company Owner no necesita plantilla (su membresía ya concede todo) |

Faltaban realmente dos: **Payroll Approver** y **Service Supervisor**. Nada más.

## FASE 2 — Roles canónicos

Definidos en `src/lib/auth/role-model.ts` (fuente única de nombre, descripción, permisos y alcance).

| Rol técnico | Membresía | Alcance | Concede | No concede |
|---|---|---|---|---|
| `company_owner` | company_owner | COMPANY | Todo (protegidos: `users.manage`, `roles.manage`, `company.settings`) | — |
| `shift_admin` | admin | COMPANY | Servicios (crear/editar/publicar/duplicar/cancelar) + staffing completo | payroll, configuración, permisos |
| `time_closeout_admin` | admin | COMPANY | Asistencia, revisar/ajustar/aprobar horas, cerrar y reabrir día y servicio | crear servicios, payroll final, configuración |
| `payroll_admin` | admin | COMPANY | payroll.view / manage / export, reportes | payroll.approve |
| `payroll_approver` | admin | COMPANY | payroll.view / approve, reportes | ajustar horas históricas |
| `service_supervisor` | manager | ASSIGNED_SERVICE | ver servicios y staffing, asistencia, revisar horas de su equipo | payroll, configuración, permisos, servicios ajenos |
| `worker` | employee | SELF | Portal: sus turnos, disponibilidad, reloj, documentos, perfil, historial | cualquier dato de terceros |

**Service Supervisor**: un único rol técnico. Captain (eventos), Headwaiter (restaurante) y Supervisor (Quality Staff) son **alias visibles** (`aliases`), no roles distintos. `roleFromTemplateName("Captain")` resuelve al mismo `service_supervisor`.

## FASE 3 — Scopes

El sistema ya soporta alcance en la práctica, pero no lo nombraba. **No hizo falta un cambio mayor ni permisos nuevos**: el catálogo mantiene un permiso por capacidad y el alcance se resuelve por rol.

- `SELF` — portal (`worker-visible-shifts`, identity-set, `user_identity_employee_ids`).
- `ASSIGNED_SERVICE` — supervisor: sus servicios asignados.
- `COMPANY` — administración de la empresa activa (ya es la unidad de todos los overrides).
- `PLATFORM` — staff global (`developer` / `owner`), inmune a overrides de compañía.

API: `resolveScope(role, permission)` y `scopeAllows(granted, required)` (jerárquico SELF < ASSIGNED_SERVICE < COMPANY < PLATFORM).

Ejemplo verificado en tests: `attendance.view` es **un solo permiso** con alcance SELF (worker), ASSIGNED_SERVICE (supervisor) y COMPANY (time admin).

## FASE 4 — Mapeo real

| Persona | Quality Staff | MyStaff | Modelo |
|---|---|---|---|
| Jorge Cortes | company_owner | company_owner / admin | Company Owner (protegido) |
| Keury Camilo | company_owner | company_owner | Company Owner (protegido) |
| María Sanabria | admin | admin | Time & Closeout Administrator (plantilla + overrides) |
| Sebastián Villegas | admin | admin | Shift Administrator (plantilla + overrides) |
| Duván Gallego | admin | admin | Time & Closeout Administrator (plantilla + overrides) |

No se modificaron membresías ni permisos de producción: la validación confirma que el modelo los representa. La diferenciación fina (María/Sebastián/Duván son `admin` con acceso total por rol) se aplica en la consola quitando dominios con overrides negativos, que ya funcionan también para `admin`.

## FASE 5 — Consola

`/app/permissions` (única pantalla) ya soporta el flujo completo: Empresa → Usuario → Plantilla de rol → Overrides → Effective preview → Guardar. Se añadió, sin pantallas nuevas:

- Alcance y alias visibles en cada plantilla (pestaña Roles).
- Roles canónicos sugeridos según la membresía de la persona seleccionada.

## FASE 6 — UX

La matriz sigue agrupada por dominios (Servicios, Staffing, Horas y cierre, Equipo, Clientes, Documentos, Comunicación, Payroll, Administración) con contadores por dominio y resumen humano (`summarizeAccess`), p. ej.: *"Puede administrar Servicios, Staffing; no tiene acceso a Payroll, Administración."*

## FASE 7 — Seguridad

Mismo modelo en las cuatro superficies, sin cambios de RLS:

- Frontend: `usePermissions` → `evaluatePermission`.
- Gate de UI/ruta: `PermissionGate` (fail-closed mientras `status = loading`).
- Backend: `public.has_permission`, espejo exacto del resolver.
- Escritura: RPC `admin_set_user_access` (única vía de guardado, auditada).

Una URL directa no salta permisos: la ruta se evalúa con el mismo `can()` y la lectura de datos sigue bajo las RLS existentes.

## QA

`src/test/role-model.test.ts` (11 casos) + `src/test/permission-overrides.test.ts` (9 casos): **20/20 en verde**. Cubren Owner, Shift Admin, Time Admin, Payroll Admin, Payroll Approver, Service Supervisor, Worker, alcance por rol, alias del supervisor, roles distintos por empresa y overrides. Desktop y móvil comparten el mismo hook, y el cambio de empresa reevalúa contra `selectedCompanyId`.

---

## Cierre

1. **Roles reutilizados:** Supervisor de Turnos, Supervisor de Reloj, Gestor de Nómina (renombrados) y Administrador de Empresa (intacto).
2. **Roles realmente creados:** solo dos plantillas — Payroll Approver y Service Supervisor.
3. **Service Supervisor:** un rol técnico único, alcance `ASSIGNED_SERVICE`, con alias visibles Supervisor / Captain / Headwaiter.
4. **Scope:** el sistema lo soportaba implícitamente; el ajuste fue menor y sin permisos nuevos (capa `role-model.ts`).
5. **Personas:** Jorge y Keury como Owner protegido; Sebastián como Shift Administrator; María y Duván como Time & Closeout Administrator. Sin tocar datos.
6. **Multi-empresa:** sí. El rol vive en la membresía por compañía y los overrides son por `(user, company, permiso)`.
7. **Consola:** soporta el modelo completo de extremo a extremo.
8. **Hardcodes:** quedan ~88 comparaciones directas de rol en vistas legacy (`Employees`, `Shifts`, `Dashboard`, `Users`, etc.). No rompen el modelo (son más restrictivas o cosméticas), pero impiden que un override negativo se refleje en esas pantallas concretas.
9. **Escalabilidad:** sí. Una compañía nueva (JKitchen Staff) solo necesita membresías y, si quiere, renombrar el nombre visible de sus plantillas.

**Veredicto: 🟡 LISTO PARA PRODUCCIÓN CON UNA CONDICIÓN.** El modelo canónico de Roles + Scope está cerrado y es la autoridad. Para declararlo cerrado al 100% falta migrar los ~88 hardcodes de rol restantes a `usePermissions` / `PermissionGate`, trabajo mecánico y sin riesgo de datos.
