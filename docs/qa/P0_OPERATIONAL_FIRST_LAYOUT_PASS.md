# P0 — OPERATIONAL FIRST LAYOUT PASS

Stafly es un sistema operativo de staffing, no un panel de analítica. Esta
entrega reordena la jerarquía visual de las pantallas operativas para que el
contenido de trabajo aparezca dentro del primer viewport.

**Alcance: sólo presentación.** No se tocaron consultas, permisos, payroll,
RLS, escritura VWC ni reglas de negocio.

## Jerarquía canónica

Implementada una sola vez en `src/components/stafly-ui/OperationalWorkspace.tsx`:

```text
1. Cabecera compacta (sticky)  empresa · título · buscador · 1–2 acciones
2. Pestañas (sticky)           nunca desaparecen al hacer scroll
3. Filtros (sticky opcional)
4. Chips de métricas           una sola línea, sustituyen las cards de KPI
5. Panel administrativo        colapsable (calidad, duplicados, diagnóstico)
6. Contenido operativo         empieza dentro del primer viewport
```

Piezas exportadas: `OperationalWorkspace`, `WorkspaceMetricChips`,
`AdminSummaryPanel`, `useWorkspaceMode`.

## Pantallas migradas

| Pantalla | Antes | Ahora |
|---|---|---|
| Clientes (`/app/clients`) | `PageHeader` + grid de `KpiCard` | Cabecera compacta, 4 chips, exportación y calidad en panel colapsable. Contenido a ~330 px |
| Equipo (`/app/employees`) | `PremiumPageHeader` + KPIs grandes | Chips de estado clicables, pestañas sticky, `DataQualityRiskPanel` y duplicados en panel colapsable. Contenido a ~412 px |
| Calidad de identidad (`/app/identity-quality`) | 8 KPIs en cards | 8 chips en una línea, aviso de alcance en el panel colapsable. Contenido a ~300 px |
| Servicios (`/app/shifts`) | `PageHeader` alto + `OpsKpiStrip` | Cabecera compacta con `Nuevo servicio` + overflow, KPIs como chips. Calendario visible a ~480 px |

## Correcciones detectadas en verificación (Playwright, 1280×1800)

1. **Desbordamiento de acciones en Equipo.** Con 7 botones la fila se recortaba
   y expulsaba el título. La cabecera pasa a `flex-wrap` con el bloque de
   identidad en `mr-auto`; las acciones se envuelven en vez de cortarse.
2. **Hueco fantasma de 64 px sobre la cabecera.** El contenedor raíz de Equipo
   usaba `overflow-x-hidden`, que convierte el eje Y en `auto` y crea un
   contenedor de scroll propio: el `sticky top-16` se anclaba dentro de él.
   Sustituido por `overflow-x-clip`, que recorta sin crear scroll.

## Garantías

- Ninguna acción, filtro, pestaña o handler fue eliminado; sólo reubicados.
- Los chips conservan la acción original de los KPIs (cambiar de pestaña).
- Sin migraciones, sin cambios en consultas ni en permisos.
- `tsgo --noEmit` sin errores.
