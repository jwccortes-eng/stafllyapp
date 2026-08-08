# SMART SERVICE INTAKE — AUDITORÍA DE ENTRADA EN LA UI

**Tipo:** auditoría de solo lectura. No se modificó código, rutas ni producción.
**Fecha:** 2026-08-08

---

## 1. ¿Dónde está hoy la entrada en la UI?

**Sí existe una entrada, pero está escondida.** Toda la funcionalidad vive en una sola
pantalla:

**Ruta:** `/app/import-schedule`
**Archivo:** `src/pages/admin/ImportSchedule.tsx`
**Título visible:** "Importar Turnos Programados" — subtítulo "Schedule Export de
Connecteam → Turnos y asignaciones"

Dentro de esa pantalla, en este orden, aparecen los tres canales nuevos como tarjetas
sueltas, antes de las instrucciones y del cargador de Excel:

| Canal | Componente | Título visible |
| --- | --- | --- |
| Texto / WhatsApp pegado | `PastedTextIntakePanel` | "Pegar texto" |
| Imagen, captura, foto, PDF | `VisualIntakePanel` | "Subir imagen o PDF" |
| Nota de voz / audio | `AudioIntakePanel` | "Nota de voz" |
| Excel / CSV | flujo original de la página | Wizard de 4 pasos (`.xls, .xlsx, .csv`) |

### Cómo se llega hoy a esa ruta

**No hay ningún ítem en el menú lateral.** `/app/import-schedule` no está en
`NAV_ITEMS` de `src/components/AdminSidebar.tsx`. Sólo se llega por cuatro atajos
enterrados:

1. **Servicios** (`/app/shifts`) → menú `...` de la cabecera → **"Importar horarios"**
   (`src/pages/admin/Shifts.tsx:2122`) — sólo si el usuario tiene permiso de edición.
2. **Time Clock** (`/app/timeclock`) → menú `...` → "Importar horarios"
   (`TimeClock.tsx:115`, y `MobileTimeClockView.tsx:101` en móvil).
3. **Command Center** (`/app/command-center`) → tile "Import Schedule" / "Importa tu
   primer schedule" (`CommandCenter.tsx:744` y `:1015`).
4. URL directa.

El **diccionario de la empresa** (Fase 5) está aún más escondido:
`/app/company-dictionary` existe como ruta (`src/App.tsx:359`) pero **no tiene ningún
enlace en toda la aplicación**. Sólo se abre escribiendo la URL.

### Por qué el usuario "no la encuentra"

- El nombre del menú dice **"Importar horarios"**, no "Importar trabajos" ni "Smart
  Service Intake". El usuario que busca importar por texto, foto o voz no reconoce ese
  ítem como el lugar correcto.
- El único punto de entrada relevante está dentro de un menú `...` de una pantalla
  distinta, no en la navegación.
- La cabecera de la pantalla sigue diciendo "Schedule Export de Connecteam", lo que
  refuerza la idea de que sólo acepta Excel.
- Las tres tarjetas nuevas están apiladas verticalmente sin un contenedor común: no se
  leen como "las fuentes de una misma función", se leen como tres bloques sueltos.

---

## 2. ¿Por qué el backend está implementado y la UX no?

Porque las Fases 1 a 5 se construyeron como **infraestructura del carril canónico**, no
como pantalla de producto. El objetivo explícito de cada fase fue no crear un pipeline
nuevo ni una bandeja nueva; cada fuente se enchufó al mismo carril existente y se
montó su panel en la pantalla de importación que ya existía. Eso es correcto a nivel
arquitectura y es exactamente lo que evitó la fragmentación, pero tuvo una
consecuencia: **nunca se rediseñó la entrada**.

Concretamente, lo que quedó pendiente por diseño (no por fallo):

- No se creó una pantalla "Importar trabajos" con selector de fuente.
- No se renombró la pantalla existente ni su cabecera.
- No se añadió el ítem a `AdminSidebar` ni a la navegación móvil.
- No se enlazó el diccionario desde ninguna parte.
- La cabecera de la página usa `PageHeader variant="3"`, no la cabecera canónica
  `OperationalScreenHeader`, así que tampoco entra en el ritmo de continuidad OX-8.

El backend, en cambio, está completo y verificado: buckets, edge functions, RPCs, VWC,
RLS por `company_id` y 108 pruebas en verde.

---

## 3. ¿Qué partes están disponibles sólo para desarrolladores?

**Ninguna está bloqueada por rol de desarrollador.** No hay banderas `isDeveloper`,
`useDebugMode` ni `import.meta.env.DEV` en los paneles de intake ni en el diccionario.

Lo que sí restringe el acceso hoy:

| Restricción | Efecto real |
| --- | --- |
| `CompanyRequiredGuard` | Sin empresa seleccionada, la ruta redirige al selector. |
| `ModuleGate moduleKey="import"` | El módulo `import` es `paid_manual` (`useSubscription.tsx:63`): una empresa sin ese módulo ve la pantalla de "actualiza tu plan" en vez del intake. Modo global (developer/owner sin empresa) lo saltea. |
| Permiso de edición en Servicios | El atajo "Importar horarios" del menú `...` sólo aparece con `canEdit`. |
| Escritura en el diccionario | RPC exige rol owner/admin/manager de la empresa. |
| `LOVABLE_API_KEY` | Existe y está configurada: imagen, PDF y audio funcionan. |

Es decir: **es un problema de descubribilidad y de plan, no de permisos de
desarrollador**. Un admin con módulo `import` ya puede usar las cinco fuentes hoy
mismo, si conoce el camino.

---

## 4. ¿Qué falta exactamente para el recorrido Servicios → Importar trabajos → Texto / Imagen / Audio / PDF / Excel?

Nada de motor. Falta **capa de entrada**. Lista exacta:

1. **Ítem de navegación.** Añadir a `NAV_ITEMS` en `AdminSidebar.tsx`, sección
   "Daily Operations", justo debajo de `Shifts`, con etiqueta del léxico admin
   ("Importar servicios" / "Import services", vía `src/lib/ox/lexicon.ts`).
2. **Renombrar la pantalla.** "Importar Turnos Programados / Schedule Export de
   Connecteam" ya no describe lo que hace. Debe pasar a lenguaje de fuente múltiple y
   usar `OperationalScreenHeader` (empresa → título → contexto → 1 acción), como manda
   la regla de cabecera única.
3. **Selector de fuente único.** Hoy hay tres tarjetas apiladas + un wizard debajo.
   Falta un contenedor de pestañas o tarjetas de fuente: Texto · Imagen · PDF · Audio ·
   Excel. Hoy PDF ni siquiera se anuncia como opción propia: vive dentro de "Subir
   imagen o PDF".
4. **Bandeja de revisión visible.** `ServiceIntakeReviewInbox` sólo se renderiza dentro
   del panel que acaba de ejecutar la extracción. Si el usuario recarga la página o
   cambia de fuente, pierde de vista los candidatos. Falta una bandeja persistente por
   lote (`import_batches`), con enlace directo.
5. **Entrada desde Servicios.** El menú `...` de `/app/shifts` debe apuntar al nombre
   nuevo, y conviene un estado vacío en Servicios que ofrezca "Importar trabajos" como
   acción principal cuando no hay servicios en el rango.
6. **Navegación móvil.** No hay ninguna entrada de importación en la navegación móvil
   (sólo el menú `...` de Time Clock). Audio y cámara son justamente los canales más
   móviles: hoy son los más difíciles de alcanzar en móvil.
7. **Enlace al diccionario.** `/app/company-dictionary` necesita al menos un acceso
   desde la pantalla de importación y desde la bandeja ("Términos aprendidos").
8. **Módulo/plan.** Decidir si `import` sigue siendo `paid_manual`. Con el gate actual,
   la mayoría de empresas ve un muro de plan en vez de la función.

---

## 5. Ubicación propuesta (propuesta, no implementada)

**Una sola pantalla, un solo carril, cinco fuentes.**

```
Menú lateral · Daily Operations
  Home
  Command Center
  Servicios            /app/shifts
> Importar servicios   /app/import-schedule      ← nuevo ítem, ruta EXISTENTE
  Asistencia
  Time Clock
```

Recomendación clave: **no crear una ruta nueva**. `/app/import-schedule` ya contiene
las cinco fuentes; crear `/app/service-intake` duplicaría entrada y violaría la regla
de carril único. Basta con exponerla y renombrarla.

Estructura interna propuesta para esa pantalla:

```
OperationalScreenHeader
  empresa → "Importar servicios" → "5 fuentes · nada se publica sin tu revisión"
  acción única: "Ver términos aprendidos" → /app/company-dictionary

[ Texto ] [ Imagen ] [ PDF ] [ Audio ] [ Excel ]   ← selector de fuente
  ↓
panel de la fuente elegida
  ↓
Bandeja de revisión compartida (candidatos, confianza, duplicados, no resueltos)
  ↓
"Crear borradores"  → scheduled_shifts (publication_status = 'draft')
```

Entradas secundarias sugeridas, todas hacia la misma ruta:

- `/app/shifts` → menú `...` → "Importar servicios" (renombrar el ítem existente).
- `/app/shifts` → estado vacío del rango → botón "Importar servicios".
- Navegación móvil → acción rápida "Importar" junto a "Crear servicio", con foco en
  cámara y nota de voz.
- Command Center → renombrar el tile "Import Schedule".

---

## Resumen en una línea

El Smart Service Intake **está completo y funcionando en `/app/import-schedule`**, con
texto, imagen, PDF, audio y Excel; lo que no existe es una entrada reconocible: no está
en el menú, la pantalla todavía se llama "Importar Turnos Programados de Connecteam" y
el diccionario aprendido no tiene ningún enlace en la aplicación.
