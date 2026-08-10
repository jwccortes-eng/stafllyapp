# Unified Entity Design System (P1)

Workers · Clientes · Venues · Partners comparten un único ADN visual.

## Regla dura

No se crea ninguna tarjeta nueva para representar personas, clientes, lugares
o partners. Toda superficie consume `EntityCard`
(`src/components/entities/EntityCard.tsx`). Si una entidad nueva entra al
ecosistema (Parceros, Bookings, Comunidad, Campañas, Proveedores), hereda el
mismo lenguaje visual añadiendo un presentador en
`src/lib/entities/entity-presenters.ts`.

## Piezas

| Archivo | Rol |
| --- | --- |
| `src/lib/entities/entity-identity.ts` | Prefijos de pasaporte, `formatEntityRef()`, `getEntityStatusColor()`, jerarquía de badges |
| `src/lib/entities/entity-presenters.ts` | Traduce la verdad de cada dominio a la vista canónica |
| `src/components/entities/EntityCard.tsx` | Componente único de render |
| `src/components/entities/index.ts` | Barrel de consumo |

## Layout invariable

```text
[ avatar ]  Nombre                                    [ acciones ]
            REF • dato principal
            badges (críticos → atención → informativos)
```

- Avatar circular, grande, siempre igual. Nunca se oculta, nunca se convierte
  en tabla. En mobile la tarjeta reduce altura (`density="compact"`) sin perder
  identidad.
- Acciones siempre al extremo derecho, nunca debajo ni mezcladas con datos.
- Correos largos no se muestran por defecto: el dato principal es teléfono,
  contacto o dirección según la entidad.

## Borde del avatar = estado (no decorativo)

`getEntityStatusColor()` es la única fuente de verdad. No hay colores nuevos.

| Tono | Color | Significado |
| --- | --- | --- |
| `operational` | verde (`status-success`) | Operativo |
| `attention` | ámbar (`status-warning`) | Necesita atención |
| `blocked` | rojo (`status-danger`) | Bloqueado |
| `assigned` | azul (`status-progress`) | Asignado hoy |
| `historical` | gris (`status-neutral`) | Histórico |

## Jerarquía de badges

| Tono | Uso |
| --- | --- |
| `critical` (rojo) | Riesgo de identidad, bloqueado, documento vencido, posible duplicado |
| `warning` (ámbar) | Foto requerida, documento pendiente, sin contacto de emergencia |
| `info` (gris) | Portal activo, histórico, driver, supervisor, `+N` |

Máximo visible configurable (`maxBadges`, por defecto 3); el resto colapsa en `+N`.

## Pasaporte del ecosistema

Toda entidad visible muestra su referencia humana. Nunca UUID ni IDs internos.

| Entidad | Prefijo | Ejemplo |
| --- | --- | --- |
| Worker | `ST` | `ST-00124` |
| Cliente | `CL` | `CL-00045` |
| Venue | `VN` | `VN-00016` |
| Partner | `PT` | `PT-00008` |

Cuando existe un código persistido (p. ej. `client_code`) se usa tal cual.
Cuando sólo existe un identificador opaco, `formatEntityRef()` deriva una
referencia estable y legible (hash determinista) — nunca expone el UUID.

## Superficies adoptadas

- Equipo — roster (`src/pages/admin/Employees.tsx`)
- Clientes — directorio (`src/components/clients/ClientDirectoryCard.tsx`)
- Identity Quality — registros de cada grupo (`src/pages/admin/IdentityQuality.tsx`)
- Selector de trabajadores / Quick Assign / Reemplazos (`src/components/shifts/EmployeeCombobox.tsx`)
- Selector de clientes (`src/components/shifts/workspace/PremiumClientSelector.tsx`)

## Fuera de alcance

No se tocó auth, RLS, payroll, `time_entries`, `shift_assignments`,
`scheduled_shifts`, documentos, pagos, chat, tenants, lógica de negocio ni
datos reales. El cambio es exclusivamente de presentación.

## Identidad cromática del Cliente (P1)

Cada Cliente recibe un **accent token** determinista desde `client_id`
(`src/lib/clients/client-accent.ts`, hash FNV-1a → paleta de 16 tokens definidos
como `--client-accent-*` en `src/index.css`). Se resuelve en read-time: no hay
columna nueva ni migración.

Reglas:

- El color pertenece al Cliente. Servicios y Venues lo heredan; el Venue sólo
  modula intensidad (`venueAccentIntensity`), nunca estrena color.
- Helper único: `clientAccentToken` / `clientAccentColor` / `clientAccentSoft`.
  Ningún componente recalcula color por su cuenta.
- Uso como acento (rail izquierdo, halo de avatar, dot, tinte suave), jamás
  como fondo sólido.
- **Identidad ≠ estado**: el anillo del avatar y los badges siguen usando los
  tonos operativos (`operational` / `attention` / `blocked` / `historical`).
- `EntityCard` acepta `accentClientId`; `ClientAvatar` acepta `clientId`.
- Nunca se identifica un cliente sólo por color: siempre nombre + avatar +
  `CL-XXXXXX`.
- Bloque canónico de identidad: `ClientIdentityPack`
  (`src/components/clients/ClientIdentityPack.tsx`) para detalle/Passport,
  Client Truth, revisión y drawer de Servicio.

Detalle y QA: `docs/qa/P1_CLIENT_VISUAL_IDENTITY_SYSTEM.md`.
