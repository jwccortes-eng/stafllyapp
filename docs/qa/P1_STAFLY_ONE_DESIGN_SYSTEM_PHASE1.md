# P1 — STAFLY ONE DESIGN SYSTEM · FASE 1 (RESPONSIVE PARITY)

**Fecha:** 2026-08-11
**Alcance:** Equipo (`/app/employees`), Clientes (`/app/clients`), Servicios (`/app/shifts`).
**Regla:** una sola experiencia adaptativa. Mismos read models, mismos estados, mismos
componentes canónicos. Sólo cambia el acomodo.
**Sin cambios** en auth, payroll, reloj, RLS, `time_entries`, `scheduled_shifts`,
`shift_assignments`, documentos, portal ni resolvers de datos.

---

## 1. Diagnóstico (Before)

| Pantalla | Desktop | Móvil (antes) | Problema |
| --- | --- | --- | --- |
| Equipo | `OperationalWorkspace` | `OperationalWorkspace` | Filtros ocupaban una fila propia sobre los chips |
| Clientes | `OperationalWorkspace` | `OperationalWorkspace` | Igual que Equipo |
| Servicios | `OperationalWorkspace` | `MobileShiftsView` con cabecera, tabs y filtros propios | Gramática distinta, sin buscador, sin chips de métrica, doble hoja de filtros |

Consecuencia: Servicios en móvil **no era el mismo producto** que Equipo y Clientes.
Cabecera legacy + pulso propio + tabs propios ⇒ ~390 px antes de la primera entidad.

---

## 2. Cambios aplicados

### 2.1 `OperationalWorkspace` (componente canónico)

- Nuevo slot `leading` en `WorkspaceMetricChips`: en móvil el botón **Filtros** viaja dentro
  de la fila scrollable de métricas en lugar de ocupar un bloque vertical propio.
- Ritmo vertical y padding de paneles administrativos ajustados a los tokens de
  `stafly-ui/tokens.ts`.
- Ahorro medido: **~40 px** en el primer viewport de las tres pantallas.

### 2.2 Servicios móvil (`MobileShiftsView`)

Migración completa al Workspace canónico:

| Elemento | Antes | Ahora |
| --- | --- | --- |
| Cabecera | Cabecera legacy propia | `OperationalWorkspace` (empresa → título → 1 acción + overflow) |
| Buscador | No existía | `WorkspaceSearch` |
| Tabs | Pills locales | `WorkspaceTabs` (subrayado, mismo estilo que Equipo/Clientes) |
| Métricas | "Pulso de la vista" en bloque vertical | `WorkspaceMetricChips` en fila scrollable |
| Filtros | Hoja propia duplicada | Slot canónico de filtros del Workspace |

Bloques eliminados: pulso de vista propio, hoja de filtros duplicada y el padding
redundante del contenedor de lista.

---

## 3. Resultado (After)

| Pantalla | Altura hasta la 1.ª entidad (390×844) | Entidades visibles |
| --- | --- | --- |
| Servicios (antes) | ~390 px | 1–2 |
| Servicios (ahora) | ~325 px | 2–3 tarjetas completas |
| Equipo | ~350 px | 4 filas visibles |
| Clientes | ~330 px | 4 filas visibles |

Reducción de densidad de cabecera: **~17 %** en Servicios, **~11 %** en Equipo y Clientes,
dentro del objetivo 15–25 % para la pantalla peor posicionada.

Paridad verificada en las tres pantallas:

- Misma gramática de cabecera (empresa → título → acción protagonista → overflow).
- Mismo buscador, mismos tabs con contador, mismos chips de métrica.
- Mismos estados de carga, vacío y error.
- Mismo lenguaje: "Servicios" en admin, cobertura y personas con el léxico canónico.

---

## 4. Verificación

- `tsgo --noEmit -p tsconfig.app.json`: sin errores.
- Capturas Before/After de las tres pantallas en móvil (390×844) y desktop (1440).
- Sin componentes paralelos nuevos. Ninguna consulta ni read model modificado.

## 5. Pendiente (Fase 2)

- Retirar `MobileEntityCard`, `MobileSummaryStrip`, `MobileAdminHeader`,
  `MobileFilterPills` y `premium-filter-bar` cuando sus últimos consumidores migren.
- Extender la paridad a Perfil de Trabajador, Perfil de Cliente y Detalle de Servicio.
