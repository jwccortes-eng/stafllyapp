# P1 — CLIENT VISUAL IDENTITY SYSTEM + CLIENT IDENTITY PACK

Fecha: 2026-08-10
Alcance: UI / presentación. Sin cambios de schema, RLS, payroll, Connecteam CSV,
Client Truth, Worker Identity, ELDM ni Smart Intake.

## 1. Principio

La identidad visual pertenece al **Cliente**. Servicios, Venues, calendarios,
selectores y reportes sólo la **heredan**. No se persiste color en
`scheduled_shifts`, `shift_assignments`, `time_entries` ni payroll.

## 2. Origen canónico

`src/lib/clients/client-accent.ts`

- `clientAccentToken(clientId)` → token de la paleta (`emerald`…`sky`, 16 tokens).
- `clientAccentColor(clientId, intensity)` → color CSS listo para pintar.
- `clientAccentSoft(clientId, alpha)` → tinte suave para superficies.
- `venueAccentIntensity(venueId)` → el Venue **no** estrena color: sólo modula
  intensidad del token de su Cliente.

Hash **FNV-1a** sobre `client_id`: estable, reproducible, independiente del
nombre y del orden de creación, tenant-safe. El mismo `client_id` siempre
produce el mismo token.

## 3. Decisión: resolución en read-time (sin migración)

No se agrega columna `accent_color_token` a `clients`. El token se deriva en
lectura desde `client_id`, que ya es inmutable y canónico. Motivos:

- Cero escritura masiva sobre datos de producción.
- Clientes existentes y nuevos se comportan igual, sin backfill.
- Consolidación de duplicados: el cliente canónico conserva su identidad porque
  conserva su `client_id`. El nombre nunca interviene en la resolución.

Si en el futuro se requiere override manual de color por cliente, la superficie
mínima sería una columna opcional leída *antes* del hash, sin cambiar call-sites.

## 4. Paleta

16 tokens definidos como variables CSS en `src/index.css` (`:root` y `.dark`):
`--client-accent-<token>`. Misma saturación/luminosidad en toda la gama: nada
fluorescente, nada oscuro, legible en claro y oscuro.

Uso permitido: borde izquierdo, rail de acento, halo/tinte de avatar, dot,
icono, degradado muy suave de cabecera. **Prohibido**: fondo sólido dominante.

## 5. Superficies migradas

| Superficie | Componente | Uso del acento |
|---|---|---|
| Calendario Mes/Semana/Cliente | `ServiceEventCard` | borde izquierdo heredado (intensidad de venue) |
| Índice de clientes en calendario | `EntityRow` | rail de acento + avatar |
| Tarjeta de servicio legacy | `ShiftCard` | rail fino |
| Semana por trabajador | `WeekByEmployeeView` | borde izquierdo del evento |
| Directorio de Clientes | `ClientDirectoryCard` → `EntityCard accentClientId` | rail + halo del avatar |
| Selector de cliente | `PremiumClientSelector` | icono con tinte + `EntityCard` |
| Detalle / Passport de cliente | `ClientIdentityPack` | rail + degradado suave |
| Drawer de Servicio | `ClientIdentityPack` (compacto) + header | rail + icono |

`getClientColor()` (legacy, dependiente del orden de la lista) fue reescrito
como wrapper del token canónico: el segundo argumento ya no influye. No existe
una segunda paleta.

## 6. Client Identity Pack

`src/components/clients/ClientIdentityPack.tsx` — bloque compacto reutilizable:

avatar/logo · acento · nombre · `CL-XXXXXX` · estado · venue principal o conteo ·
calidad de datos · estado de mapeo Connecteam (cuando aplique).

No es un dashboard. Se usa en detalle/Passport, Client Truth, revisión de
clientes y drawer de Servicio; cualquier vista administrativa nueva lo consume
en lugar de maquetar su propia cabecera de cliente.

## 7. Color de identidad ≠ color de estado

- Identidad: token del Cliente (rail, halo, dot).
- Estado: verde / ámbar / rojo del design system (anillo del avatar, badges,
  chips de cobertura, readiness).

Un cliente violeta con servicio incompleto se ve **violeta + ámbar**. El violeta
nunca comunica estado.

## 8. Accesibilidad

- El cliente nunca se identifica sólo por color: siempre nombre + avatar/iniciales
  + `CL-XXXXXX` cuando aplique.
- El acento se usa en superficies pequeñas y con tinte suave; el texto conserva
  tokens de contraste del tema.
- Estados críticos se comunican con texto/badge, no con color de identidad.

## 9. QA

Desktop (`/app/shifts` Mes · Semana · Cliente, `/app/clients`, detalle de cliente,
drawer de Servicio):

- Imperial, Elum Frank Hall, Luminance, Millennium, Eminence, Shoimy reciben
  acentos distintos y estables entre vistas y recargas.
- Mismo cliente = mismo color en calendario, lista, selector, drawer y Passport.
- Cards no se saturan: el acento ocupa ≤ 4px + tinte < 15% de opacidad.
- Estados (BORRADOR, INFO, cobertura x/y) permanecen legibles.

Mobile: sin superficies coloreadas grandes; sólo rail y halo. Cards compactos y
selectores conservan contraste.

Typecheck: `npx tsgo --noEmit` en verde.
