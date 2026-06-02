# Smart Work Card · Design Spec v1

> Status: **DESIGN ONLY** — sin reemplazo de UI productiva, sin tocar payroll,
> schema, `time_entries`, auth/RLS ni Connecteam. Mobile-first 390×844.
> Companion: `PAYMENT_STORY_AND_WORK_CARD_AUDIT.md`, `SHIFT_OPERATIONAL_FLOW.md`.

---

## 0. Por qué esta card

El público de Stafly (meseros, construcción, limpieza, cocina, eventos,
producción) necesita **claridad extrema**, no jerga técnica. La card móvil
actual del worker portal es la base visual: navy ink + azul Stafly + Sora/Inter
+ pastel tints suaves. Esa misma card debe servir para Worker y para Admin,
en tres densidades (Compact / Standard / Full), y reemplazar la idea de
"módulos técnicos" por un lenguaje humano consistente.

**Una sola CTA principal por card.** Todo lo demás es link o ghost.

---

## 1. Tokens visuales (locked)

| Token | Valor | Uso |
|---|---|---|
| Surface base | `#FAFBFC` | fondo de pantalla |
| Card surface | `#FFFFFF` | fondo de card |
| Ink primary | `hsl(220 39% 11%)` | títulos, hora protagonista |
| Ink muted | `hsl(220 9% 46%)` | labels, "Termina aprox." |
| Hairline | `hsl(220 14% 92%)` | separadores internos |
| Accent | `hsl(207 90% 54%)` (Stafly blue) | CTA primaria, links |
| Tint sky | `bg-sky-50` + `text-sky-700` | chip neutro / info |
| Tint emerald | `bg-emerald-50` + `text-emerald-700` | listo / confirmado |
| Tint amber | `bg-amber-50` + `text-amber-700` | atención / estimado |
| Tint rose | `bg-rose-50` + `text-rose-700` | en riesgo / sin clock |
| Radius card | `rounded-2xl` (16px) | tarjeta exterior |
| Radius inner | `rounded-xl` (12px) | sub-bloques |
| Radius chip | `rounded-full` | chips, pills |
| Shadow card | `0 1px 2px rgba(15,23,42,.04), 0 4px 16px -8px rgba(15,23,42,.08)` | flotante calmo |
| Typography hero | Sora 32–36 / semibold / tabular-nums | hora de entrada |
| Typography title | Sora 18 / semibold | rol · cliente |
| Typography body | Inter 14 / regular | descripciones |
| Typography label | Inter 12 / medium / uppercase tracking-wide | "QUÉ LLEVAR" |
| Numbers | `font-variant-numeric: tabular-nums` + right-aligned | totales, horas |

**Reglas:**
- Estados se comunican con **chip + tint de 10%** del sub-bloque relevante,
  nunca recoloreando la card entera.
- Icons: Lucide, 16–18px, stroke-1.5. Sin emoji.
- One primary CTA. Period.
- Legacy `#0250` siempre como monospace top-right, opacity 50.

---

## 2. Anatomía de la Worker Smart Work Card (Full)

```text
┌──────────────────────────────────────────────────┐
│  Sáb 4 Jun                                #0258  │ ← date pill (left) + legacy ref (right, muted)
│                                                  │
│  Entrada                                         │ ← Sora 12 muted
│  5:00 PM                                         │ ← Sora 36 ink, protagonist
│  Termina aprox. 11:30 PM · ~6 h 30 m            │ ← Sora 13 muted
│                                                  │
│  [● Confirmado]                                  │ ← state chip
│  ──────────────────────────────────────────────  │ hairline
│  ◐  Mesero · Eminence Ballroom                   │ ← role + client (avatar 32px)
│  ──────────────────────────────────────────────  │
│  📍 CÓMO LLEGAR                                  │ ← label
│  430 Bedford Ave, Brooklyn NY                    │
│  Punto de encuentro: lobby principal             │
│  ✓ Ubicación guardada                            │ ← chip emerald
│  [ Cómo llegar ]   [ Copiar dirección ]          │ ← 2 ghost buttons
│  ──────────────────────────────────────────────  │
│  👕 QUÉ LLEVAR                                   │
│  ┌────┐  • Camisa blanca                         │ ← uniform thumb 64×64
│  │img │  • Pantalón negro                        │
│  └────┘  • Zapatos cerrados                      │
│  Origen: cliente · Eminence                      │ ← discreet source
│  ──────────────────────────────────────────────  │
│  💵 PAGO ESTIMADO                                │ ← amber tint sub-card
│  $25/h · ~6.5 h                                  │
│  ≈ $162.50 estimado                              │ ← never green, never big
│  Pago final depende del fichaje real             │
│  o ajuste aprobado.                              │
│  ──────────────────────────────────────────────  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │           Aceptar turno          ✓         │  │ ← primary CTA h-12 full
│  └────────────────────────────────────────────┘  │
│            Más detalles  ›                       │ ← quiet text link
└──────────────────────────────────────────────────┘
```

### Datos esenciales (siempre visibles)
1. Hora de **entrada** (protagonista).
2. "Termina aprox." + duración estimada (muted).
3. Rol · Cliente.
4. Dirección / punto de encuentro + "Cómo llegar" + "Copiar dirección".
5. Qué llevar (foto + bullets).
6. Pago estimado **con etiqueta "Estimado" obligatoria**.
7. UNA CTA principal según estado.

### Lo que va a "Más detalles" (oculto por defecto)
- Notas internas del admin.
- Historial de validaciones.
- Versionado del turno (Stafly versioning).
- Ride / transporte (cuando aplique).
- Worker shift admin asignado.
- Legacy shift code expandido.
- Created_by / published_by / timestamps.

---

## 3. Estados de la Worker Card · CTA matrix

| Estado del turno | Chip | CTA primaria | Sub-bloque pago |
|---|---|---|---|
| Borrador (no publicado) | — | (card oculta) | — |
| Publicado, requiere aceptación | `Por confirmar` (sky) | **Aceptar turno** | Estimado |
| Aceptado, falta confirmar día | `Confirmado` (emerald) | **Reconfirmar** | Estimado |
| Hoy, antes de entrada | `Hoy` (sky pulse) | **Marcar entrada** | Estimado |
| En curso (clock-in OK) | `En turno` (emerald pulse) | **Marcar salida** | "Pago en cálculo · termina al cerrar" |
| Falta clock-out después del fin | `Falta hora de salida` (amber) | **Cerrar fichaje** | "Falta hora de salida · pago final pendiente" |
| Validación admin sin clock | `Presente · sin fichaje` (amber) | **Ver detalles** | "Pago requiere ajuste aprobado" |
| Cerrado, payroll review | `En revisión` (sky) | **Ver detalles** | "En revisión antes de pagar" |
| Pagado | `Pagado` (emerald) | **Ver pago** | Statement final |
| Cancelado | `Cancelado` (rose) | **Ver detalles** | — |

**Regla absoluta:** si el pago no está aprobado, **nunca** mostrar monto sin
"Estimado" / "Aprox." / "Pago final pendiente". Nunca verde. Nunca tamaño
hero.

---

## 4. Admin Smart Work Card (Full)

Mismo lenguaje visual. Cambia la priorización del contenido.

```text
┌──────────────────────────────────────────────────┐
│  Sáb 4 Jun · 5:00 PM                      #0258  │
│                                                  │
│  Eminence Ballroom · Mesero                      │ ← Sora 20 ink, protagonist
│  430 Bedford Ave, Brooklyn NY                    │ ← muted body
│                                                  │
│  [⚠ En riesgo]   [3 de 4 confirmados]            │ ← chips
│  ──────────────────────────────────────────────  │
│  COBERTURA                                       │
│  (◐)(◐)(◐)( ? )   3 / 4                          │ ← avatar stack + ratio
│  Falta 1 mesero · 4 candidatos sugeridos         │
│  ──────────────────────────────────────────────  │
│  ALERTAS                                         │
│  • 1 sin clock-in                                │ ← rose dot
│  • Falta foto de uniforme                        │ ← amber dot
│  ──────────────────────────────────────────────  │
│  EVIDENCIA                                       │
│  ▓▓▓▓▓▓▓░░░  70 %  · 2 clock real · 1 validación │
│  ──────────────────────────────────────────────  │
│  SIGUIENTE ACCIÓN                                │
│  Asignar 1 mesero antes de las 4:30 PM           │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │              Operar turno          →       │  │ ← primary CTA
│  └────────────────────────────────────────────┘  │
│  Asignar  ·  Auditar  ·  Revisar pago            │ ← quiet text links
└──────────────────────────────────────────────────┘
```

### CTA matrix · Admin

| Estado operativo | CTA primaria | Links secundarios |
|---|---|---|
| Borrador | **Publicar** | Editar · Eliminar |
| Necesita personal | **Asignar** | Ver candidatos · Operar |
| Listo | **Operar turno** | Ver evidencia · Editar |
| En vivo | **Operar turno** | Ver clocks · Contactar |
| Cerrado, pendiente review | **Auditar** | Ver evidencia |
| Listo para pago | **Revisar pago** | Auditar |
| Pagado | **Ver pago** | Auditar |

---

## 5. Variantes de densidad

### 5.1 Compact (calendario · 88 px alto)

```text
┌─────────────────────────────┐
│ 5:00 PM   ● Confirmado #0258│
│ Mesero · Eminence  3/4 (◐◐◐)│
└─────────────────────────────┘
```

- Sin sub-bloques.
- Sin CTA.
- Toque → abre Full.
- Versión admin: agrega chip de estado operativo.
- Versión worker: muestra chip de aceptación.

### 5.2 Standard (Daily Ops · 180 px alto)

```text
┌──────────────────────────────────────────────────┐
│ Sáb 4 · 5:00 PM                          #0258   │
│ Eminence · Mesero                                │
│ [En riesgo] [3/4]                                │
│ ⚠ 1 sin clock-in                                 │
│ [ Operar turno → ]   Más detalles ›              │
└──────────────────────────────────────────────────┘
```

- Hero compacto, sin time hero gigante.
- Una alerta visible (la más crítica).
- CTA ghost.
- Sin "Qué llevar" ni "Pago estimado" inline.

### 5.3 Full (Worker Portal / Shift Operations · ~480 px)

Anatomía descrita en §2 (worker) y §4 (admin).

---

## 6. Bloque "Cómo llegar" · spec

```text
📍 CÓMO LLEGAR
{formatted_address}                       ← StructuredAddress
Punto de encuentro: {meeting_point}       ← solo si existe
✓ Ubicación guardada                      ← chip de estado
[ Cómo llegar ]  [ Copiar dirección ]     ← 2 ghost buttons
📞 Contacto en sitio: María (555-0142)    ← solo si existe
```

### Estados de ubicación

| Fuente | Chip | Color |
|---|---|---|
| `scheduled_shifts.job_site_location_id` resuelto | `Ubicación guardada` | emerald |
| `scheduled_shifts.meeting_point` texto libre | `Dirección manual` | sky |
| Ninguno | `Falta dirección` | rose |

- "Cómo llegar" → `buildMapsUrl()` (helper ya existe en `src/lib/address`).
- "Copiar dirección" → `navigator.clipboard.writeText(formatted_address)`
  con toast "Dirección copiada".
- Punto de encuentro siempre **destacado** (Work Route standard ya activo).
- Hora de salida sugerida: **fuera de scope v1** (requiere mapas/distancia).

---

## 7. Bloque "Qué llevar" · spec

```text
👕 QUÉ LLEVAR
┌────┐  • Camisa blanca
│img │  • Pantalón negro
└────┘  • Zapatos cerrados
Origen: cliente · Eminence
```

### Prioridad de fuente (de mayor a menor)

1. **Override del turno específico** → `scheduled_shifts.uniform_override`
   *(propuesta, no crear ahora)*.
2. **Default por cliente / location / rol** → `locations_v2.uniform_default`
   o `clients.uniform_default` *(propuesta)*.
3. **Default por compañía** → `company_settings.uniform_default`
   *(propuesta)*.
4. **Texto manual** → `scheduled_shifts.notes` (legacy, fallback inmediato
   sin schema).

### Estados

| Origen | Foto | Bullets | Chip |
|---|---|---|---|
| Turno con override + foto | ✅ | ✅ | `Específico del turno` |
| Cliente/rol con foto | ✅ | ✅ | `Estándar del cliente` |
| Compañía con default | ⚠ placeholder | ✅ texto | `Estándar de compañía` |
| Sólo texto manual | ⚠ placeholder dashed | ✅ texto | `Manual` |
| Nada | placeholder muted | "Sin instrucciones" | `Falta uniforme` (admin only) |

**Worker view:** "Qué llevar" o nada.
**Admin view:** además chip "Uniforme: completo / incompleto / falta".

---

## 8. Bloque "Pago estimado" · spec

> **Crítico:** este bloque jamás reemplaza payroll. Sólo prepara la
> expectativa del worker. Ver `PAYMENT_STORY_AND_WORK_CARD_AUDIT.md`.

```text
💵 PAGO ESTIMADO                          ← label amber-700
$25 / h  ·  ~6.5 h
≈ $162.50 estimado
Pago final depende del fichaje real
o ajuste aprobado.
```

### Reglas

1. **Etiqueta "Estimado" o "Aprox." es obligatoria.**
2. Color base: **amber-50 tint**, jamás verde (verde = pagado/final).
3. Tamaño: igual al body, **nunca** hero.
4. Si `pay_type=hourly`: `rate × duración_programada_estimada`.
5. Si `pay_type=daily`: monto del día (full o half).
6. Si falta clock-out después del fin: **"Falta hora de salida · pago final
   pendiente"** (sin monto).
7. Si hay validación admin sin clock: **"Pago requiere ajuste aprobado"**
   (sin monto).
8. Si el período ya está `paid`: cambia a "Pago final" + verde + monto real
   desde `period_base_pay`. Ya no es "estimado".
9. **Nunca usar `scheduled_shifts.start_time/end_time` como horas pagadas
   en payroll.** El estimado es presentación, no cálculo.
10. Helper futuro (no crear ahora): `estimateShiftPay({shift, rate_snapshot,
    time_entry?, validation?})`.

---

## 9. Mapa de variantes × consumidores

| Consumidor | Variante | Quién la ve |
|---|---|---|
| `/portal/shifts` (lista) | Standard | Worker |
| `/portal/shifts/:id` detalle | Full | Worker |
| `/portal/clock` (turno activo) | Full · "En turno" | Worker |
| Calendar `/app/shifts?view=week` celdas | Compact | Admin |
| `/app/daily-ops` feed | Standard | Admin |
| `/app/shift-ops?id=…` cabecera | Full | Admin |
| `/portal` dashboard "Próximo turno" | Full | Worker |

---

## 10. Lenguaje · diccionario obligatorio

| ✅ Usar | ❌ Evitar |
|---|---|
| Trabajo | Assignment |
| Cómo llegar | Directions / route |
| Qué llevar | Uniform / dress code |
| Confirmación de llegada | Clock-in evidence |
| No marcó entrada | Missing clock-in |
| Revisar antes de pagar | Pending payroll review |
| Termina aprox. | Scheduled end |
| Estimado / Aprox. | Total pay / Wage |
| Falta hora de salida | Open clock entry |
| Pago final pendiente | Payroll not finalized |
| Ref #0258 | Shift code 0258 |
| En riesgo | At risk |
| En turno | Clocked in |

---

## 11. Riesgos & mitigaciones

| Riesgo | Mitigación |
|---|---|
| Worker interpreta "Estimado" como pago final. | Amber tint + texto disclaimer obligatorio + nunca usar verde ni tamaño hero. |
| Admin pierde info técnica (legacy ref, IDs). | Todo a "Más detalles"; legacy ref siempre top-right monospace muted. |
| Duplicación de lenguaje entre worker/admin. | Diccionario §10 enforced en code review. |
| Compact se llena de chips ilegibles. | Máx 1 chip estado + 1 ratio cobertura. |
| Punto de encuentro se pierde. | Siempre línea propia destacada, no merge con dirección. |
| "Qué llevar" sin foto se ve roto. | Placeholder dashed amable, no "missing image" error. |
| Pago estimado se calcula con horas programadas y eso erosiona la regla "scheduled ≠ payroll". | El cálculo vive en el helper y el texto lo etiqueta explícitamente como referencia; payroll real sigue siendo `time_entries` o ajuste aprobado. |
| Cards mobile-first se ven pobres en desktop. | Desktop usa grid 2-3 cols con misma card; sin variantes nuevas. |
| Reemplazo masivo rompe `/portal` y `/app`. | Esta fase es **spec**; rollout por consumidor con feature flag. |

---

## 12. Plan de rollout sugerido (requiere aprobación)

1. **Fase A · Tokens & primitives** (frontend-only)
   `src/components/cards/smart-work-card/` con:
   - `SmartWorkCardShell.tsx` (wrapper, tokens).
   - `HowToGetThereBlock.tsx`.
   - `WhatToBringBlock.tsx`.
   - `PayEstimateBlock.tsx`.
   - `WorkerCardFull.tsx` / `AdminCardFull.tsx`.
   - `WorkerCardStandard.tsx` / `AdminCardStandard.tsx`.
   - `WorkerCardCompact.tsx` / `AdminCardCompact.tsx`.
   - Helpers puros en `src/lib/cards/smart-work-card.ts`
     (`getCardState`, `getPrimaryCta`, `estimateShiftPay`).
2. **Fase B · Showcase interno** en `/app/_design/smart-work-card` (sólo
   developer/owner) con todas las variantes y estados con data mock.
3. **Fase C · Pilot worker** en `/portal/shifts` lista (Standard) detrás
   de feature flag `smart_work_card_v1`.
4. **Fase D · Pilot admin** en `/app/daily-ops` (Standard).
5. **Fase E · Full** en `/portal/shifts/:id` y `/app/shift-ops`.
6. **Fase F · Compact** en calendar cells.

Cada fase: typecheck + tests Vitest + live QA en Stafly Demo Company antes
de tocar Quality Staff.

---

## 13. Criterios de aceptación (spec)

1. ✅ La card se entiende en < 5 s (test: enseñar a un no-tech 5 segundos
   y preguntar "¿cuándo entras?").
2. ✅ Worker sabe **cuándo, dónde, qué hacer, qué botón tocar**.
3. ✅ Admin sabe **estado, riesgo, siguiente acción** sin abrir nada.
4. ✅ Dirección es accionable (Maps + Copiar).
5. ✅ Pago estimado nunca se confunde con final (amber + disclaimer +
   nunca verde).
6. ✅ Legacy `#0250` siempre top-right muted, nunca título.
7. ✅ Una sola CTA primaria visible.
8. ✅ Todo lo técnico vive en "Más detalles".

---

## 14. Confirmación de no-tocados críticos

Este documento **NO toca**:

- `time_entries` (lectura conceptual; cero write).
- `period_base_pay`, `pay_periods`, `payroll_adjustments`,
  `payroll_rate_snapshots` — sólo lectura propuesta para el helper de
  estimado.
- Cálculos de payroll, closeout, reconciliación.
- Worker portal productivo, admin productivo (sólo se proponen consumidores
  para fases futuras detrás de flag).
- Schema (cero migrations).
- RLS, auth, edge functions.
- Connecteam export/import.
- Tenants (no se mezclan).
- Notifications, chat, documents, payments, bookings.

**Cero cambios productivos hasta que las fases A–F se aprueben una por
una.** Este doc es la única huella de la propuesta.
