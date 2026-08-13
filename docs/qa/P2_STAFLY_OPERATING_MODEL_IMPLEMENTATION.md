# P2 — STAFLY OPERATING MODEL™

Fecha: 2026-08-13
Alcance: capa de EXPERIENCIA sobre el modelo canónico de roles, scope y permisos.
Sin tablas nuevas, sin RLS, sin auth, sin payroll, sin datos de producción.

---

## 1. Qué se construyó

| Pieza | Archivo | Naturaleza |
|---|---|---|
| Modelo operativo canónico | `src/lib/auth/operating-model.ts` | Módulo puro, solo lectura |
| Responsibility Card | `src/components/access/ResponsibilityCard.tsx` | Presentación |
| Company Operating Model | `src/components/access/CompanyOperatingModel.tsx` | Presentación |
| Integración en consola | `src/pages/admin/AccessConsole.tsx` | Nueva pestaña + bloque en el perfil |
| QA | `src/test/operating-model.test.ts` | 9 casos |

Todo se apoya en lo que ya era autoridad:
`role-model.ts` (roles canónicos + scope), `permission-catalog.ts`,
`permission-resolver.ts`, `primary-role.ts`, `usePermissions`, `PermissionGate`
y el RPC `admin_set_user_access`. **No se creó ninguna fuente paralela.**

## 2. Cadena operativa

```text
Cliente → Servicio → Programación → Operación → Control de horas
        → Preparación de payroll → Aprobación final → Pago
```

Cada etapa (`OPERATING_CHAIN`) declara un rol responsable. Cada rol
(`RESPONSIBILITIES`) declara misión, qué controla, qué entrega, de quién recibe,
a quién entrega, qué NO le corresponde y qué ve al iniciar sesión.

| Rol | Recibe de | Entrega | Entrega a |
|---|---|---|---|
| Company Owner | Payroll Administrator | Decisión y autorización de pago | — (cierra) |
| Shift Administrator | Company Owner | Servicio completamente ejecutado | Time & Closeout |
| Service Supervisor | Shift Administrator | Servicio operado y asistencia reportada | Time & Closeout |
| Time & Closeout Administrator | Shift Admin · Service Supervisor | Horas verificadas | Payroll Administrator |
| Payroll Administrator | Time & Closeout | Payroll listo | Payroll Approver |
| Payroll Approver | Payroll Administrator | Pago autorizado | Company Owner |
| Worker | Shift Administrator | Turno trabajado y marcado | Service Supervisor |

No es jerarquía: es flujo de trabajo. Nadie "manda" sobre el siguiente eslabón,
le **entrega**.

## 3. Superficies

**Perfil del usuario (`/app/permissions` → Usuarios).** Debajo del rol principal
aparece la Responsibility Card: rol operativo, alias visibles, lista "Responsable
de", "No responde por", cadena operativa con **nombres reales** de quien le
entrega y a quien entrega, alcance, y acceso efectivo (N permisos · N
excepciones). Los switches técnicos siguen debajo, sin cambios.

**Modelo operativo (`/app/permissions` → nueva pestaña).** Flujo de las 8 etapas
con el responsable actual de cada una, alcance, y aviso de **etapas sin
responsable**. Cada persona es clicable y lleva a su perfil sin perder contexto.

**Dashboard por responsabilidad.** Cada rol declara su `focus` (lo que debe ver
al entrar) y se muestra en la tarjeta. La ejecución real ya la hace el Command
Center, que filtra por `usePermissions`, de modo que hoy Sebastián ve cobertura
y publicaciones, Duván ve horas e inconsistencias, María ve payroll pendiente y
Jorge/Keury ven lotes y excepciones. No se creó un dashboard paralelo.

## 4. QA

- `src/test/operating-model.test.ts` — 9/9 PASS
- `src/test/role-model.test.ts` — 11/11 PASS (sin regresión)
- `src/test/permission-overrides.test.ts` — 9/9 PASS (sin regresión)
- Typecheck completo — PASS
- Navegador, Quality Staff by Keury: pestaña **Modelo operativo** renderiza las
  8 etapas con responsables reales (Jorge Cortes en Cliente/Pago, Sebastian
  Villegas en Servicio/Programación) y detecta *Operación, Preparación de
  payroll, Aprobación final* sin responsable.
- Navegador, perfil de Jorge Cortes: Responsibility Card con "Company Owner",
  alcance *Toda la empresa*, 41 permisos · 0 excepciones.
- Listado con columnas Nombre / Rol principal / Alcance / Estado / Portal
  intacto (53 personas).
- Desktop y móvil: la tarjeta y el flujo usan grid fluido de una columna en
  pantallas pequeñas; no hay vista móvil paralela.
- Cambio de empresa: todo se recalcula desde `selectedCompanyId`; MyStaff usa el
  mismo modelo con sus propias personas.

## 5. Cierre obligatorio

1. **¿Se reutilizó el 100% de la infraestructura actual?** Sí. La capa nueva solo
   lee `role-model.ts` y el catálogo; la autorización sigue en `usePermissions` /
   `has_permission`.
2. **¿Se creó alguna tabla nueva?** No. Cero migraciones, cero SQL.
3. **¿Se modificó el sistema de permisos?** No. Ni catálogo, ni resolver, ni
   overrides, ni RLS, ni el RPC de guardado.
4. **¿Cómo quedó representada la Cadena Operativa?** Como `OPERATING_CHAIN`
   (8 etapas) + `operatingChainFor(role, people)`, pintada en el perfil con
   nombres reales de origen y destino.
5. **¿Cómo quedó el flujo de responsabilidades?** Como `RESPONSIBILITIES`: misión,
   controles, entrega, recibe de, entrega a, no responde por, y foco de inicio.
6. **¿MyStaff y Quality reutilizan el mismo modelo?** Sí, y JKitchen también:
   el modelo es global; lo único que cambia son las personas por etapa.
7. **¿Qué alias visibles soporta Service Supervisor?** Supervisor, Captain y
   Headwaiter — mismo rol técnico, alcance `ASSIGNED_SERVICE`.
8. **¿Qué ve cada rol al iniciar sesión?** Shift Admin: servicios, publicaciones,
   cobertura, reemplazos, incidencias. Time & Closeout: turnos por revisar,
   inconsistencias, clock abiertos, servicios listos para cierre. Payroll Admin:
   payroll pendiente, novedades, lotes, validaciones. Owner/Approver: lotes
   pendientes, indicadores críticos, aprobaciones, excepciones. Supervisor: sus
   servicios y su equipo. Worker: sus turnos, reloj, disponibilidad, documentos.
9. **¿Qué queda pendiente para que sea el estándar del ecosistema Parceros +
   Stafly?**
   - Asignar en Quality Staff y MyStaff las personas de las etapas hoy vacías
     (Operación, Preparación de payroll, Aprobación final) — es configuración,
     no código.
   - Persistir el alias visible por empresa (hoy los alias son constantes del
     rol, no un campo editable por tenant).
   - Reordenar el Command Center para que su encabezado nombre la
     responsabilidad, no el módulo.

**Veredicto: 🟢 GO.** El modelo operativo está implementado, es único para todas
las empresas, no crea ningún sistema paralelo y la interfaz ya habla de
responsabilidades. Lo pendiente es configuración por tenant y pulido de copy.
