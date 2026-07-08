# Stafly Command Center v1 — Sprint 45 Asset Runbook

**Documentation-only.** No cambia código, base de datos, RLS, auth, payroll, `time_entries`, `shift_assignments`, `scheduled_shifts`, edge functions, tenants, payments, bookings, chat ni datos reales.

Runbook operativo para producir los assets comerciales del Command Center (screenshots + Looms + deck) reutilizando lo entregado en Sprint 44:

- `docs/demo/STAFly_COMMAND_CENTER_DEMO_PACK.md`
- `docs/demo/STAFly_COMMAND_CENTER_LOOM_GUIDE.md`
- `docs/demo/STAFly_COMMAND_CENTER_SALES_DECK_OUTLINE.md`
- `docs/demo/STAFly_COMMAND_CENTER_STAGING_CHECKLIST.md`
- `docs/demo/screenshots/README.md`

Este runbook no reemplaza esos documentos: los orquesta.

---

## 0. Regla de payroll (recordatorio permanente)

Payroll se calcula con **horas reales** de `time_entries` o **ajustes aprobados** en el Centro de Validación. Nunca con horas programadas. Ningún asset (screenshot, Loom, slide) puede sugerir automatización de pago sin revisión humana.

Frases prohibidas en cualquier asset:

- "Paga automáticamente."
- "Payroll listo sin revisión."
- "Reemplaza a tu contador / abogado laboral."
- "Cumple la ley por sí solo."

---

## 1. Preparación de staging

Orden estricto antes de tomar cualquier asset.

1. [ ] Confirmar ambiente **staging/sandbox** — nunca producción.
2. [ ] Confirmar tenant demo aislado, sin datos reales de clientes.
3. [ ] Login con usuario admin demo (no cuentas personales).
4. [ ] Confirmar workers demo (mínimo 3) con nombres genéricos: "Worker Demo 1/2/3", "María Ops".
5. [ ] Confirmar cliente demo genérico: "Cliente Demo Eventos".
6. [ ] Confirmar idioma español, zona horaria consistente.
7. [ ] Navegador limpio: perfil incognito o perfil demo, sin extensiones, sin bookmarks visibles, zoom 100%.
8. [ ] Sin toasts de error abiertos, sin banners de debug ni flags internos.

Referencia detallada: `STAFly_COMMAND_CENTER_STAGING_CHECKLIST.md`.

---

## 2. Escenarios demo requeridos

Cada escenario debe existir en staging antes de capturar assets.

| # | Escenario | Uso | Chip esperado |
|---|---|---|---|
| 1 | Turno **futuro** (>2h) | Staffing / confirmación | Fase: Antes del turno |
| 2 | Turno **inminente** (<30 min) | Transición | Fase: Inminente |
| 3 | Turno **en curso** | Asistencia, evidencia | Fase: En curso |
| 4 | Turno **terminado sin cierre** | Recordatorio de cierre | "Sin cierre enviado" |
| 5 | Turno **con cierre enviado** | Handoff a María | "Cierre enviado · en revisión" |
| 6 | Turno **con corrección** | Loop de calidad | "Requiere corrección" |
| 7 | Turno **pendiente final** | Aprobación operativa hecha | "Pendiente final" |
| 8 | *(Opcional)* Turno **aprobado final** | Cierre completo | "Aprobado · pasa a payroll" |
| 9 | *(Opcional)* Caso **no-show / falta clock-in** | Evidence card | Worker: "Falta clock-in" |

---

## 3. Screenshots — naming y cobertura

**Convención:** `NN-descripcion-{desktop|mobile}.png`, guardado en `docs/demo/screenshots/`.

- Desktop: 1280×800 min, escala 1x.
- Mobile: 390×844 (iPhone 14/15).
- Sin URLs de producción visibles, sin datos reales.

Cobertura mínima (referencia completa en `docs/demo/screenshots/README.md`):

- **Command Center** — desktop (Hoy, Atención, En vivo, Listo para pago) + mobile.
- **Shift Ops por fase** — futuro, en curso, terminado, cerrado + mobile.
- **Attendance Evidence** — "Falta clock-in", diálogo validación admin, banner payroll + mobile.
- **Time Clock** — `/app/timeclock?shiftId=<id>` desktop + mobile.
- **Closeout chips** — 5 estados (sin cierre / in review / needs correction / pending final / ready for payroll).
- **Payroll Review Queue** — `/app/payroll-review-queue?shiftId=<id>` desktop + buckets + mobile.

Checklist por captura:

- [ ] Sin datos personales reales (nombres, teléfonos, emails, direcciones).
- [ ] Sin tokens, IDs de tenant real, URLs de producción.
- [ ] Sin extensiones del navegador visibles.
- [ ] Estado UI coincide con el guion Loom asociado.
- [ ] Nombrado según convención.

---

## 4. Loom readiness

Antes de apretar **Record**:

- [ ] Guion Loom correspondiente abierto en segunda pantalla (ver `STAFly_COMMAND_CENTER_LOOM_GUIDE.md`).
- [ ] URLs staging cargadas y probadas:
  - `/app/command-center`
  - `/app/shift-ops?id=<id>`
  - `/app/timeclock?shiftId=<id>`
  - `/app/payroll-review-queue?shiftId=<id>`
- [ ] Deep-links preservan `shiftId` al navegar entre pantallas.
- [ ] Datos demo cargados según §2.
- [ ] Micrófono probado, audio limpio.
- [ ] Notificaciones del OS silenciadas.
- [ ] Consola del navegador **cerrada**.
- [ ] Sin pestañas con datos personales.
- [ ] Zoom del navegador 100%.

Después de grabar:

- [ ] Revisar reproducción completa antes de compartir.
- [ ] Confirmar que no aparecen: tokens, emails reales, teléfonos, IDs sensibles, mensajes de chat interno, datos de otros clientes.
- [ ] Recortar inicios/finales muertos.
- [ ] Nombrar Loom: `stafly-cc-loom-NN-{topic}.mp4` o link Loom con título equivalente.
- [ ] Guardar link/archivo en la carpeta compartida del equipo comercial (no en el repo).
- [ ] Cerrar sesión staging.

---

## 5. Deck readiness — mapping slide ↔ screenshot

Basado en `STAFly_COMMAND_CENTER_SALES_DECK_OUTLINE.md`.

| Slide | Necesita visual | Screenshots sugeridos |
|---|---|---|
| 1 · Título | Sí | `10-shift-ops-futuro-desktop.png` o `01-command-center-hoy-desktop.png` |
| 2 · El dolor real | No (mensaje) | Opcional: collage WhatsApp/Excel/Connecteam genérico (no logos ajenos) |
| 3 · Costo del caos | No (mensaje) | — |
| 4 · Cómo funciona Stafly | Sí | Diagrama fases + `11-shift-ops-encurso-desktop.png` |
| 5 · Flujo demo | Sí | Serie: `10 → 30 → 20 → 40 → 50` |
| 6 · Protección de payroll | Sí | `22-evidence-banner-payroll-desktop.png` + `50-prq-focus-shift-desktop.png` |
| 7 · Evidencia y auditoría | Sí | `21-evidence-dialog-validacion-desktop.png` |
| 8 · Vs. WhatsApp/Excel/Connecteam | No (mensaje) | Opcional: tabla comparativa |
| 9 · Límites honestos | No (mensaje) | — |
| 10 · Cierre / Next step | Sí (light) | `05-command-center-mobile.png` para mostrar accesibilidad |

Diseño:

- Tipografía y colores según `docs/BRAND_ARCHITECTURE_V1.md`. No fuentes genéricas (Inter/Poppins) ni gradientes purple/indigo.
- Screenshots reales de staging, nunca mockups genéricos AI.
- Mobile: cards + KPIs compactos, **sin charts**.

---

## 6. QA desktop

- [ ] El recorrido Shift Ops → Time Clock → Evidence → Closeout → PRQ se entiende de izquierda a derecha.
- [ ] Chips de fase y de cierre visibles sin scroll.
- [ ] Copy en español operativo, sin jerga técnica.
- [ ] CTAs primarios claros: "Ver fichajes", "Registrar validación admin", "Revisar horas".
- [ ] Banner de payroll visible en el bloque de evidencia.
- [ ] Estados del PRQ explicables sin abrir consola ni docs.

## 7. QA mobile (390×844)

- [ ] Command Center: pill tabs scrollables, sin corte.
- [ ] Shift Ops: cards + KPIs compactos, sin charts, sin scroll horizontal.
- [ ] Attendance Evidence: diálogo cabe sin scroll horizontal.
- [ ] Deep-links `/app/timeclock?shiftId=<id>` y `/app/payroll-review-queue?shiftId=<id>` cargan enfocados.
- [ ] CTAs principales visibles: Llamar, Marcar presente, Ver fichajes, Revisar horas.

---

## 8. Estructura final de assets para el deck

```
docs/demo/
├── STAFly_COMMAND_CENTER_DEMO_PACK.md
├── STAFly_COMMAND_CENTER_LOOM_GUIDE.md
├── STAFly_COMMAND_CENTER_SALES_DECK_OUTLINE.md
├── STAFly_COMMAND_CENTER_STAGING_CHECKLIST.md
├── STAFly_COMMAND_CENTER_SPRINT_45_ASSET_RUNBOOK.md   ← este archivo
└── screenshots/
    ├── README.md
    ├── 01-command-center-hoy-desktop.png
    ├── 05-command-center-mobile.png
    ├── 10-shift-ops-futuro-desktop.png
    ├── 20-evidence-falta-clockin-desktop.png
    ├── 30-timeclock-focus-desktop.png
    ├── 40-shift-ops-chip-sin-cierre-desktop.png
    └── 50-prq-focus-shift-desktop.png
```

Los Loom mp4/links **no** viven en el repo — guardarlos en la carpeta compartida del equipo comercial.

---

## 9. Reglas de seguridad (recordatorio)

- Documentation-only. No tocar `src/**`, DB, RLS, auth, payroll, `time_entries`, `shift_assignments`, `scheduled_shifts`, documents, edge functions, tenants, payments, bookings, chat ni producción.
- Nunca usar datos reales de clientes o workers.
- Nunca mostrar tokens, IDs sensibles, URLs de producción, correos personales, teléfonos reales.
- Nunca prometer automatización de payroll o cumplimiento legal.

---

## 10. Reporte final del sprint (plantilla)

Al terminar la producción de assets, adjuntar:

1. Lista de screenshots capturados (con path).
2. Lista de Looms grabados (con link y duración).
3. Deck exportado (link).
4. Confirmación de checklist §6 y §7.
5. Confirmación de que no hay datos reales visibles.
6. Confirmación de que no se tocó `src/**`, DB, RLS, auth, payroll, `time_entries`, edge functions, tenants, payments, bookings, chat ni producción.

**Próximo paso recomendado:** ejecutar §1–§4 en staging, poblar `docs/demo/screenshots/` con los PNG reales, grabar los 5 Looms y construir el deck a partir del mapping de §5.
