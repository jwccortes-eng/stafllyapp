# Operations Design Language — Stafly

Lenguaje visual compartido para el **Operations Command Center**: Shifts, Time
Clock, Clients (y futuros módulos operativos). El objetivo es que estas
pantallas se sientan como **un solo sistema premium**, no módulos sueltos.

> Referencia de tono: Stripe Dashboard · Linear · Notion database premium.
> Principio: **utilidad operativa > decoración**.

---

## Estructura canónica de página operativa

Toda pantalla operativa se compone de **3 capas verticales** + un panel lateral
opcional para detalle:

```
┌─────────────────────────────────────────────────────────────┐
│  PageHeader           [right slot: settings · help · ...]   │  ← contexto
├─────────────────────────────────────────────────────────────┤
│  OpsKpiStrip   · 4–6 métricas operativas, una sola fila     │  ← pulse
├─────────────────────────────────────────────────────────────┤
│  OpsToolbar    · view switch · search · acciones · chips    │  ← control
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Vista principal (week view, employee grid, client table)   │  ← work area
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            └──→  Side panel (Sheet) deslizable derecho
                                  con tabs verticales sutiles
```

**Sin excepciones**: ese orden y esa jerarquía. La consistencia espacial es lo
que crea la sensación de sistema premium.

---

## Densidad adaptativa

| Superficie         | Densidad | Espaciado | Tipografía           |
|--------------------|----------|-----------|----------------------|
| KPI strip          | alta     | `gap-2`   | label `text-[10px]`  |
| Toolbar            | alta     | `gap-1.5` | botón `size="sm"`    |
| Tablas / listas    | alta     | `py-2`    | celda `text-xs`      |
| Cards de turno     | media    | `p-3`     | título `text-sm`     |
| Side panel detalle | media    | `p-4`     | header `text-base`   |
| Dashboard cards    | baja     | `p-4`     | hero `text-2xl`      |

> Regla: **listas y toolbars son densas, cards y paneles respiran**.

---

## Primitives operativos

Viven en `src/components/operations/`. Importar siempre desde ahí, no
recrear en cada módulo.

### `<OpsKpiStrip />`
Strip horizontal de 4-6 KPIs en una fila. Reemplaza grids de `<KpiCard />` en
la cabecera de páginas operativas. Tono `tone` (neutral/primary/success/warning/
critical/info) define el color del valor — **no usar accent visual sin
significado operativo**.

### `<OpsToolbar />`
Barra sticky con clusters left/center/right + chips opcionales. Reemplaza
toolbars artesanales en cada página. `backdrop-blur` automático al hacer scroll.

### `<OpsStatusChip />`
Pill de estado con vocabulario `tone` unificado. Sustituye usos sueltos de
`<Badge variant="outline" />` para estados operativos.

### Componentes existentes que mantienen su rol

| Componente            | Cuándo usarlo                                 |
|-----------------------|------------------------------------------------|
| `<PageHeader />`      | Cabecera de página — siempre primero           |
| `<KpiCard />`         | Dashboard, widgets financieros, no operativos  |
| `<Sheet />`           | Side panel de detalle                          |
| `<EmptyState />`      | Estado vacío de cualquier vista                |

---

## Vocabulario de tono

Un solo diccionario en todo el módulo operativo:

| Tono       | Uso operativo                                         |
|------------|-------------------------------------------------------|
| `neutral`  | Estado por defecto, sin valencia                      |
| `primary`  | Acción principal, foco actual, "current"              |
| `success`  | Confirmado · activo · clock-in OK · publicado         |
| `warning`  | Tarde · pendiente · cerca del límite · sin clock-out  |
| `critical` | No-show · falta empleado · excepción bloqueante       |
| `info`     | Programado · en cola · información complementaria     |
| `muted`    | Cancelado · archivado · sin valor                     |

> No introducir tonos nuevos. Si una métrica nueva no encaja, mapearla.

---

## Side panel (detalle de turno / empleado / cliente)

Patrón único basado en `<Sheet side="right" />` con:

1. **Header sticky** (avatar/icon + título + chip de estado + close)
2. **Tabs verticales sutiles** (`border-l` activo, sin background pesado)
3. **Body scrollable** con secciones colapsables
4. **Footer sticky** con acciones principales (no más de 2 botones primary)

Tabs estándar para shift detail:
`Detalles · Equipo · Asistencia · Rides · Notas · Chat`

---

## Roadmap de aplicación

| Fase | Módulo      | Alcance                                         |
|------|-------------|--------------------------------------------------|
| 1    | Shifts      | Header + KPI strip + Toolbar (esta entrega)      |
| 2    | Shifts      | Side panel premium + status chips en cards       |
| 3    | Time Clock  | KPI strip priorizada por excepciones + lista     |
| 4    | Clients     | Tabla enterprise + chips + side panel            |
| 5    | Cleanup     | Eliminar variantes legacy de cards/badges        |

---

## Reglas innegociables

1. **No colores hardcoded** — solo tokens HSL del design system.
2. **No introducir cards "decorativas"** — si no tiene función operativa, fuera.
3. **No mezclar `<Badge>` libre con `<OpsStatusChip>`** en la misma página.
4. **No romper flujos existentes** — el rediseño es visual y de jerarquía;
   los handlers, queries y reglas de negocio quedan intactos.
