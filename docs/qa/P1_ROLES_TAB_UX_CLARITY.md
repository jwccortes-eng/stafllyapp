# P1 — Roles Tab UX Clarity

## Problema
La tarjeta de rol mostraba un botón deshabilitado con la etiqueta
"Selecciona una persona": falsa affordance, parecía un control roto.

## Cambio
En `src/pages/admin/AccessConsole.tsx`, cada tarjeta de rol expone dos
acciones explícitas, ambas habilitadas:

- **Aplicar a persona** → guarda la plantilla pendiente y lleva a la pestaña
  **Usuarios** (superficie canónica). No se creó un segundo selector.
- **Ver personas con este rol (N)** → despliega, dentro de la tarjeta, los
  miembros de la **empresa activa** con ese nivel de membresía. Al pulsar un
  nombre se selecciona esa persona en Usuarios.

En Usuarios aparece una banda de contexto mientras hay plantilla pendiente:

```
APLICAR PLANTILLA
Shift Administrator
A: Jorge Cortes · Empresa: Quality Staff by Keury · Alcance: Toda la empresa
6 permisos · se cargan como excepciones de esta empresa
[Ver permisos efectivos] [Confirmar] [Cancelar]
```

Confirmar reutiliza el flujo existente `applyTemplateToDraft` → draft →
**Guardar cambios** → RPC `admin_set_user_access`. Cero lógica de persistencia
nueva, cero RPC nueva.

## Preguntas que responde ahora la pestaña Roles
1. **¿Qué hace?** descripción de la plantilla y nº de permisos.
2. **¿Qué alcance tiene?** `SCOPE_LABELS` del rol canónico + alias visibles.
3. **¿Quién lo tiene?** listado de miembros de la empresa activa.
4. **¿Cómo se lo asigno?** botón "Aplicar a persona" que conduce al flujo único.

## Aislamiento de tenant
Miembros y plantillas se leen con `.eq("company_id", selectedCompanyId)`; el
guardado es company-scoped. Aplicar en Quality Staff no altera MyStaff.

## Intacto
auth, RLS, catálogo de permisos, overrides, memberships, payroll y datos de
producción. Solo cambió la capa de presentación.

## QA
- Typecheck limpio.
- Navegador (1280px, Quality Staff by Keury): las 6 tarjetas —Administrador de
  Empresa, Shift Administrator, Time & Closeout Administrator, Payroll
  Administrator, Payroll Approver, Service Supervisor— muestran alcance, alias,
  contador de personas y ambas acciones activas.
- Flujo verificado: Roles → Aplicar a persona → Usuarios con banda de contexto
  → seleccionar persona → preview de permisos efectivos → Confirmar → draft con
  cambios sin guardar → Guardar cambios.
- Sin control deshabilitado sin explicación: los únicos botones inhabilitados
  (Ver permisos / Confirmar) llevan el texto "Elige a la persona en la lista".

## Resultado
Roles = descubrir y aplicar plantillas. Usuarios = administrar acceso
individual. Permisos = entender el catálogo. Un solo flujo de escritura.
