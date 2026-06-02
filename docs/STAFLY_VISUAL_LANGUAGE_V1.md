# Stafly Visual Language v1

> Documentación oficial del lenguaje visual de Stafly Core.
> **Esta guía NO modifica UI productiva.** Es la referencia para revisar y diseñar futuras pantallas.
> Basada en la `SmartWorkCard` y el diseño limpio del Worker Portal móvil.

---

## 1. Principios de diseño

Stafly debe sentirse como un **sistema operativo humano para staffing**, no como una colección de pantallas técnicas. El público incluye meseros, construcción, limpieza, cocina, eventos y producción — gente que muchas veces no es "ciber".

**Principio raíz:**

> Mostrar solo lo necesario para actuar.
> Una pantalla debe decir **qué está pasando**, **qué falta** y **qué hacer ahora**.
> Lo técnico va a **"Más detalles"**.

Reglas derivadas:

1. **Humano antes que técnico.** Hablar como hablaría un buen supervisor, no como una base de datos.
2. **Una cosa importante por pantalla.** Si todo grita, nada se escucha.
3. **Acción visible.** Siempre debe quedar claro el siguiente paso (Aceptar, Cómo llegar, Marcar entrada, Revisar, Aprobar).
4. **Estado honesto.** Si el pago es estimado, decir estimado. Si falta foto, decir falta foto. Sin eufemismos.
5. **Datos legacy escondidos.** Códigos antiguos (shift code, Connecteam ref) son referencia secundaria — nunca protagonistas.
6. **Mobile-first siempre.** Si no funciona en 390×844, no funciona.

---

## 2. Tipos de componentes visuales

Stafly tiene 6 tipos de cards canónicas. Toda pantalla operativa debe armarse a partir de estas.

| Card | Para quién | Pregunta que responde |
|---|---|---|
| **Worker Work Card** | Worker en /portal | "¿Qué turno tengo, dónde, a qué hora, qué llevo?" |
| **Admin Work Card** | Admin en /app/shifts, /app/shift-ops | "¿Quién está, quién falta, qué necesita atención?" |
| **Payment Story Card** | Worker y Admin | "¿Cuánto estoy ganando / pagando y por qué?" |
| **Attention Card** | Admin | "¿Qué necesita mi intervención ahora?" |
| **Evidence Card** | Admin | "¿Qué prueba existe de lo que pasó?" |
| **Action Card** | Worker y Admin | "¿Qué tengo que hacer en este momento?" |

Cada card debe ser **una sola intención**. No mezclar "pago + alerta + acción + evidencia" en la misma card.

---

## 3. Card anatomy

Una card de Stafly siempre se lee en este orden visual, de arriba hacia abajo:

```
┌─────────────────────────────────────────┐
│ [identidad / título humano]             │  ← qué es
│                                         │
│ [tiempo protagonista]                   │  ← cuándo
│ Termina aprox. ...                      │  ← secundario, muted
│                                         │
│ [lugar accionable]                      │  ← dónde
│   Cómo llegar · Copiar dirección        │
│                                         │
│ [estado / chip]                         │  ← cómo va
│                                         │
│ [alerta / riesgo si aplica]             │  ← qué duele
│                                         │
│ [siguiente acción primaria]             │  ← qué hacer
│                                         │
│ ── Más detalles ▾ ──────────────────    │  ← lo técnico, colapsado
└─────────────────────────────────────────┘
```

**Jerarquía visual obligatoria:**

1. **Identidad** — título humano ("Mesero · Bodas Casa Real", "Jorge Cortés", "Cocina · Catering Norte").
2. **Tiempo** — hora de entrada protagonista; `Termina aprox.` muted; `meeting_time` si existe.
3. **Lugar** — dirección accionable + meeting point.
4. **Estado** — chip único y honesto (Confirmado, Pendiente, En curso, Cerrado, Necesita revisión).
5. **Alerta / riesgo** — solo si aplica (sin foto, sin dirección, sin lead, llegó tarde, sin marcar).
6. **Siguiente acción** — un solo CTA primario; máximo un secundario.
7. **Detalles secundarios** — colapsados en "Más detalles" (shift code legacy, IDs internos, tags, grupos, source flags, manager, notas técnicas).

---

## 4. Densidades

Tres densidades canónicas. La densidad se elige por contexto, **no por preferencia visual**.

### Compact

- Para listas largas (semana de turnos, roster, queue de revisión).
- Una línea de identidad + hora + chip de estado.
- Sin dirección expandida, sin uniforme, sin pago.
- Tap/click abre el drawer en densidad full.

### Standard (default)

- Para vistas operativas (Today, próximos turnos en /portal, ShiftDetail).
- Identidad + tiempo + lugar accionable + estado + 1 alerta + 1 CTA.
- "Más detalles" colapsado.

### Full

- Para drawers, detalle de turno, perfil del worker, cierre del día.
- Toda la anatomía visible.
- "Más detalles" puede estar abierto.
- Aquí viven evidencia, historial, notas y trace de payroll.

Regla: **nunca mostrar full density en listas**. Listas siempre compact o standard.

---

## 5. Tonos / colores

Stafly usa 5 tonos semánticos. Cada uno tiene un significado fijo. **No usar color por estética.**

| Tono | Significado | Ejemplos |
|---|---|---|
| **Azul** | Informativo / identidad del sistema | Header, links secundarios, chips neutros, badges de marca |
| **Verde** | Confirmado / saludable / cerrado OK | Confirmado, En curso saludable, Cierre completo, Pago aprobado |
| **Ámbar** | Estimado / pendiente / requiere atención no urgente | **Pago estimado siempre ámbar**, Pendiente de confirmar, Falta foto, Sin lead |
| **Rojo** | Bloqueante / riesgo operativo / no-show / falla | No-show, Sin marcar después del límite, Geofence violado, Error de cierre |
| **Gris** | Secundario / muted / inactivo / "Termina aprox." | Detalles técnicos, legacy refs, fechas pasadas, "Más detalles" |

Reglas:

- **Un solo color dominante por card.** Si una card tiene rojo, no debe tener verde celebratorio al lado.
- **Ámbar nunca se confunde con verde.** Estimado no es aprobado.
- **Rojo se reserva.** Si todo es rojo, nada es urgente. Máximo 1 alerta roja por pantalla operativa.
- **Gris no comunica estado.** Solo jerarquía.

---

## 6. Copy rules

### Lenguaje permitido

- Verbos en imperativo claros: **Aceptar**, **Marcar entrada**, **Cómo llegar**, **Copiar dirección**, **Revisar**, **Aprobar**, **Cerrar día**.
- Frases cortas y humanas:
  - "Termina aprox. 11:00 PM"
  - "Llegada esperada 4:45 PM"
  - "Qué llevar: camisa blanca, pantalón negro"
  - "Sin foto aceptada todavía"
  - "Pago estimado — pendiente de aprobación"
- Español neutro, profesional, calmado. Tono de buen supervisor.

### Lenguaje prohibido

- Jerga técnica visible al worker: `shift_id`, `time_entry`, `clock_event`, `payroll_safe`, `geofence_ok`, `assignment_status`.
- Códigos legacy como título: "Shift #4523", "CNT-9921", "Ref:".
- Tecnicismos de payroll en card de worker: "base_total_pay", "period_id", "deductions adjustment".
- Eufemismos: "Hubo un detalle con tu marca" → decir "No marcaste la salida".
- Pago expresado como final cuando no lo es: "Ganaste $180" si todavía es estimado. Debe decir "Estimado: $180 — pendiente de aprobación".
- Spanglish o mezcla: "Tu shift de hoy", "Clock-in pendiente".

### Reglas de microcopy

- Hora protagonista: `4:30 PM`, no `16:30`.
- "Termina aprox." nunca "Fin: 23:00".
- Direcciones siempre en una línea humana + botón secundario `Cómo llegar`.
- "Más detalles" en lugar de "Avanzado", "Debug" o "Info técnica".

---

## 7. Reglas mobile-first

Todo se diseña primero para **390×844**.

1. Una card por fila. Sin grids de 2 columnas en operativo.
2. CTA primario full-width o casi full-width.
3. Tiempo y lugar deben leerse sin hacer zoom.
4. Tap targets ≥ 44px.
5. Bottom nav de 5 tabs máximo en /portal.
6. Drawers ocupan ≥ 85% de alto.
7. Nunca tablas en /portal. Nunca.
8. Iconografía mínima — el copy debe poder leerse sin íconos.

---

## 8. Reglas desktop

1. **Cards en columnas.** Layout principal sigue siendo card-based, no tabla.
2. **Evitar tablas como experiencia principal** en /app/shifts, /app/shift-ops, /app/employees, /portal admin views, daily ops.
3. **Tablas permitidas solo en:**
   - Reportes de payroll (`/app/payroll-reconciliation`, `/app/historical-payroll`).
   - Exports / auditoría avanzada.
   - Centro de Validación cuando se necesita comparar filas.
4. Densidad standard en grid de 2–3 columnas máximo en desktop. No 4.
5. Drawer lateral (no modal pantalla completa) para detalle.
6. Hover no es la única forma de descubrir acciones — acciones primarias siempre visibles.

---

## 9. Referencias internas (códigos legacy)

- **Título nunca es el código.** El título es siempre humano ("Mesero · Bodas Casa Real").
- **"Trabajo #250"** o "Shift #4523" van como **referencia secundaria muted**, debajo del título o dentro de "Más detalles".
- **Connecteam refs** (`shift_code`, `Ref:`) solo aparecen en:
  - Exports CSV a Connecteam.
  - Auditoría.
  - "Más detalles" en admin.
- **UUID interno** nunca se muestra en UI productiva (ni admin ni worker).
- Worker nunca debe ver shift code legacy en card principal.

---

## 10. Pago estimado

Reglas no negociables:

1. **Siempre ámbar.** Pago estimado nunca verde.
2. **Disclaimer visible** junto al monto: "Estimado — pendiente de aprobación de payroll".
3. **Nunca presentar como final** si no está aprobado.
4. **Nunca usar scheduled hours como pago final.** Las horas programadas son referencia operativa; el pago se calcula con fichajes reales o validaciones aprobadas.
5. **Worker portal** muestra histórico de pagos solo cuando hay `final_total_pay` aprobado. Mientras tanto: "Pendiente de cierre".
6. **Payment Story Card** debe explicar el cálculo en lenguaje humano cuando ya está aprobado: "8h × $18 = $144 + extras $20 = **$164**".
7. Pago aprobado: verde. Pago estimado: ámbar. Pago con disputa/falta evidencia: rojo.

---

## 11. Dirección

1. **Dirección accionable.** Una línea humana legible: "Av. Juárez 123, Col. Centro, Brooklyn NY".
2. **Botón "Cómo llegar"** → abre Google/Apple Maps con coords reales.
3. **Botón "Copiar dirección"** → clipboard, con confirmación visible.
4. **Meeting point destacado** si existe, con su propia mini-sección (no mezclar con job site).
5. **`meeting_time`** se muestra solo si está definido, con jerarquía propia: "Punto de encuentro 4:15 PM".
6. **Nunca mostrar lat/lng crudos** en UI productiva.
7. Si falta dirección: chip ámbar "Sin ubicación" + CTA admin "Agregar ubicación".

---

## 12. Uniforme / "Qué llevar"

1. Sección titulada **"Qué llevar"** en worker card (nunca "Uniform requirements" ni "Dress code").
2. **Texto simple y corto**: "Camisa blanca, pantalón negro, zapatos cerrados".
3. **Foto si existe** (referencia visual del uniforme) — máximo 1, no galería.
4. **Detalles secundarios** ("traer credencial", "no perfume", "cabello recogido") van en "Más detalles" si la lista es larga.
5. Si no aplica uniforme: ocultar la sección, no mostrar "N/A".

---

## 13. Qué mostrar siempre vs. Más detalles

### Mostrar siempre (worker)

- Identidad del trabajo (rol + cliente/evento).
- Hora de entrada.
- "Termina aprox." (muted).
- Dirección + Cómo llegar.
- Meeting point + meeting_time si existe.
- Qué llevar (corto).
- Estado del turno.
- CTA primario (Aceptar / Marcar entrada / Marcar salida).

### Mostrar siempre (admin)

- Identidad del turno.
- Tiempo.
- Lugar.
- Asignados / capacidad (ej. "5/6 asignados").
- Lead / Shift Admin asignado.
- Estado (Borrador / Publicado / En curso / Cerrado).
- Alertas operativas (sin lead, sin asignar, sin ubicación, retrasos).
- CTA primario contextual.

### Mandar a "Más detalles"

- IDs internos, UUIDs.
- Shift code legacy / Connecteam ref.
- Tags, grupos, source flags.
- Manager importado, added_via, fechas de import.
- Notas administrativas largas.
- Historial de cambios.
- Trace de payroll detallado.

---

## 14. Errores comunes a evitar

- ❌ Card con 4 chips de estado distintos al mismo tiempo.
- ❌ Pago estimado en verde.
- ❌ Hora final con el mismo peso que hora de entrada.
- ❌ Shift code legacy como título.
- ❌ Tabla de turnos en mobile.
- ❌ Tabla de turnos en desktop como experiencia principal.
- ❌ Texto técnico (`time_entry_id`, `assignment_status`) visible al worker.
- ❌ "Cancel" en inglés en flujo español.
- ❌ Mezclar acciones de worker y admin en la misma card.
- ❌ Spanglish en copy operativo.
- ❌ Rojo en más de una alerta simultánea en la misma pantalla.
- ❌ Mostrar lat/lng crudos.
- ❌ Mostrar `scheduled_hours × rate` como si fuera pago real.

---

## 15. Reglas para integración futura

Cuando se construyan nuevas pantallas o se integren módulos nuevos (Parceros, marketplace, evidencia, comunicaciones), aplicar este checklist antes de hacer merge:

1. ¿Cabe en una de las 6 cards canónicas? Si no, reformular.
2. ¿La densidad es la correcta para el contexto (compact/standard/full)?
3. ¿La jerarquía visual sigue el orden: identidad → tiempo → lugar → estado → alerta → acción → detalles?
4. ¿Un solo color dominante? ¿Ámbar para estimado, verde solo para aprobado?
5. ¿Hay un único CTA primario claro?
6. ¿El copy es humano, en español, sin jerga técnica visible?
7. ¿Los códigos legacy están escondidos en "Más detalles"?
8. ¿Funciona en 390×844 sin scroll horizontal?
9. ¿Si menciona pago, dice claramente si es estimado o aprobado?
10. ¿La dirección es accionable (Cómo llegar + Copiar)?

---

## 16. Ejemplos de referencia

### 16.1 Worker Work Card — compact

```
┌─────────────────────────────────────────┐
│ Mesero · Bodas Casa Real                │
│ Hoy 4:30 PM · Brooklyn                  │
│ [Confirmado]                            │
└─────────────────────────────────────────┘
```

### 16.2 Worker Work Card — standard

```
┌─────────────────────────────────────────┐
│ Mesero · Bodas Casa Real                │
│                                         │
│ Entrada 4:30 PM                         │
│ Termina aprox. 11:00 PM                 │
│                                         │
│ Av. Juárez 123, Brooklyn NY             │
│ [Cómo llegar] [Copiar dirección]        │
│                                         │
│ Punto de encuentro · 4:15 PM            │
│ Entrada de servicio (puerta lateral)    │
│                                         │
│ Qué llevar: camisa blanca, pantalón     │
│ negro, zapatos cerrados                 │
│                                         │
│ [Confirmado]                            │
│                                         │
│ [        Marcar entrada        ]        │
│                                         │
│ Más detalles ▾                          │
└─────────────────────────────────────────┘
```

### 16.3 Worker Work Card — full

Mismo que standard + sección abierta:

```
│ Más detalles ▴                          │
│   Trabajo #250                          │
│   Cliente: Casa Real Eventos            │
│   Lead: María Pérez                     │
│   Notas: traer credencial               │
│   Cancelaciones: hasta 24h antes        │
```

### 16.4 Admin Work Card — compact

```
┌─────────────────────────────────────────┐
│ Mesero · Bodas Casa Real · 4:30 PM      │
│ 5/6 asignados · Lead: María P.          │
│ [Publicado] [Falta 1]                   │
└─────────────────────────────────────────┘
```

### 16.5 Admin Work Card — standard

```
┌─────────────────────────────────────────┐
│ Mesero · Bodas Casa Real                │
│                                         │
│ Hoy 4:30 PM – 11:00 PM                  │
│ Av. Juárez 123, Brooklyn NY             │
│                                         │
│ 5/6 asignados                           │
│ Lead: María Pérez                       │
│                                         │
│ [Publicado] · Falta 1 worker            │
│                                         │
│ [   Asignar worker   ] [ Abrir turno ]  │
│                                         │
│ Más detalles ▾                          │
└─────────────────────────────────────────┘
```

### 16.6 Admin Work Card — full

Mismo que standard + lista de asignados con foto/estado, evidencia disponible, historial de cambios, shift code legacy, trace de payroll, opciones avanzadas.

### 16.7 Payment Story Card — estimado (ámbar)

```
┌─────────────────────────────────────────┐
│ Pago del turno · Bodas Casa Real        │
│                                         │
│ Estimado: $144.00                       │
│ Pendiente de aprobación de payroll      │
│                                         │
│ 8h × $18/hr = $144                      │
│                                         │
│ Te notificaremos cuando esté aprobado.  │
└─────────────────────────────────────────┘
```

### 16.8 Payment Story Card — aprobado (verde)

```
┌─────────────────────────────────────────┐
│ Pago aprobado · Bodas Casa Real         │
│                                         │
│ $164.00                                 │
│                                         │
│ 8h × $18 = $144                         │
│ + Propina compartida: $20               │
│                                         │
│ Aprobado el 30 may                      │
└─────────────────────────────────────────┘
```

### 16.9 Attention Card — admin

```
┌─────────────────────────────────────────┐
│ Necesita atención                       │
│                                         │
│ Bodas Casa Real · 4:30 PM               │
│ Falta 1 worker y no hay Lead asignado   │
│                                         │
│ [   Asignar Lead   ] [ Ver turno ]      │
└─────────────────────────────────────────┘
```

### 16.10 Evidence Card — admin

```
┌─────────────────────────────────────────┐
│ Evidencia del turno                     │
│                                         │
│ Entrada: 4:32 PM (foto + GPS OK)        │
│ Salida: 11:08 PM (foto OK, sin GPS)     │
│ Validación admin: María P. · 11:15 PM   │
│                                         │
│ [ Ver fotos ] [ Ver mapa ]              │
│                                         │
│ Más detalles ▾                          │
└─────────────────────────────────────────┘
```

---

## 17. Confirmación de no-tocados

Esta guía es **documentación únicamente**. No se modifica:

- payroll · payroll calculations
- `time_entries` · attendance writes · clock-in/out writes
- closeout
- worker portal productivo
- auth · RLS · schema · production data
- Connecteam
- rutas productivas

Cualquier cambio futuro de UI inspirado en esta guía debe pasar por su propio ciclo de revisión y QA, respetando las reglas de seguridad y memorias del proyecto.
