# ADDENDUM — William Rodríguez: regresión de búsqueda y visibilidad de portal

Fecha: 2026-08-12 · Alcance: solo resolución/consulta. No se movieron assignments,
payroll, time_entries, identity links ni registros fusionados.

## CASO 1 — Admin search oculta a la persona

### Causa raíz
`/app/shifts` filtraba únicamente por campos del servicio (`title`, `shift_code`,
`shift_ref`, cliente, ubicación). El buscador nunca miró a las **personas
asignadas**. Al escribir "william" ningún servicio contenía ese texto, así que la
grilla quedaba vacía y la persona "desaparecía" pese a estar asignada.

No era un problema de identidad canónica vs sombra: era un buscador que no
indexaba personas.

### Corrección
- Nuevo motor único: `src/lib/shifts/shift-people-search.ts`
  - Normaliza acentos y mayúsculas, tokeniza nombre, apellido, nombre completo y email.
  - Indexa teléfono e identificación por dígitos (mínimo 3).
  - Ignora asignaciones `removed` / `rejected`.
  - Indexa por `employee_id` tal cual aparece en la asignación, así que una
    asignación colgada de una ficha fusionada también entra al índice.
- Integrado en las dos superficies de Servicios:
  - `src/pages/admin/Shifts.tsx` (escritorio)
  - `src/pages/admin/MobileShiftsView.tsx` (móvil)

Resultado: buscar "william", su teléfono o su identificación devuelve sus
servicios, con el mismo dataset que ya alimenta la grilla.

## CASO 2 — Portal "Today" sin turnos

### Lo que se verificó (sin tocar datos)
Identidad de William:
- Una sola ficha con sesión: `28b436c6…` (canónica, activa, Quality Staff).
- Sin fichas duplicadas con `user_id`; el resolver de empleado efectivo no puede
  elegir una ficha equivocada.

Turno de hoy (2026-08-12, inicio 16:00):
- Servicio `eb335368…`: `publication_status = published`, `status = published`,
  no borrado.
- Asignación: ficha **canónica**, `is_draft_reservation = false`,
  `status = pending`, creada el 2026-08-09.

Es decir: el dato cumple todas las condiciones de la consulta del portal y de
Publication Truth. El turno de hoy **debe** aparecer, y las cuatro tabs
(Today, Upcoming, Available, History) comparten exactamente la misma carga y la
misma identidad — se dividen solo por fecha en memoria.

### Hallazgo real: la historia en fichas fusionadas seguía bloqueada
Aunque el código ya expande la identidad (`resolveWorkerAssignmentEmployeeIds`),
las reglas de acceso del portal solo reconocían la ficha con sesión
(`employees.user_id = auth.uid()`). Las fichas fusionadas tienen `user_id` nulo,
así que sus asignaciones se filtraban en el servidor: el portal pedía la
identidad completa y el backend devolvía solo la mitad. Esto afectaba sobre todo
a **History** (y a cualquier turno cuya asignación quedó en una ficha antigua,
p. ej. el servicio del 2026-08-01 de William).

### Corrección
Nueva función interna `public.user_identity_employee_ids(user)` que devuelve la
ficha viva más las fichas fusionadas **en ella y en la misma empresa**. Las
reglas de lectura de `shift_assignments` y `scheduled_shifts` ahora usan ese
conjunto. Es solo lectura: no habilita escrituras sobre fichas fusionadas (el
bloqueo por trigger sigue vigente) y no cruza empresas.

### Sobre "Today" vacío
Con datos y reglas correctas, un "No shifts today" en pantalla solo puede venir
de una vista servida desde caché de sesión previa. Tras esta build, abrir el
portal recarga la agenda contra el backend con la identidad completa. Si tras
recargar el turno de hoy siguiera sin verse, hay que capturar la respuesta de
red de esa sesión concreta: los datos ya no lo explican.

## Invariantes respetadas
- Cero escrituras a datos de producción.
- Ninguna asignación histórica movida de ficha.
- La expansión de identidad solo ocurre por vínculo de fusión confirmado y
  dentro de la misma empresa.
