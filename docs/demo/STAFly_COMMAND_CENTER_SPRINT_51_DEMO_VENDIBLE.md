# STAFly Command Center — Sprint 51: Demo Vendible Controlada

**Fecha:** 2026-07-09
**Tipo:** Documentation-only. Cero cambios en `src/**` de negocio, cero writes a DB, cero cambios a payroll, auth, RLS, edge functions, payments, bookings, chat, tenants reales, `time_entries`, `shift_assignments`, `scheduled_shifts` ni `documents`.
**Depende de:** Sprint 49 (segundo proyecto Supabase staging/demo) + Sprint 50 (badge `<EnvBadge/>` global).

Este documento convierte el ambiente staging/demo en una **demo comercial vendible** en 3 minutos. Define los 9 escenarios operativos, la pantalla que los muestra, el objetivo comercial, el problema que demuestran y el pre-flight de captura.

---

## 1. Pre-flight de ambiente (obligatorio antes de cada sesión)

Sin estos 5 checks, **no se captura**.

- [ ] Badge amarillo **"STAGING / DEMO · Synthetic data only. No production data."** visible en la esquina inferior centrada (desktop y mobile).
- [ ] Consola del navegador → log `[stafly-build]` muestra `supabaseUrl` del **segundo proyecto Supabase staging/demo** (NO el ref productivo `jplhtputzixwqarqlrth`).
- [ ] `VITE_APP_ENV=staging` o `demo` en el deploy usado.
- [ ] Sidebar/tenant switcher muestra **solo** `STAFly Demo Hospitality Ops`. Cero tenants productivos accesibles.
- [ ] Sesión iniciada con `admin.demo@example.com` (no cuenta personal, no cuenta de admin real).

Regla de rechazo: cualquier PNG o frame de Loom **sin** el badge visible se borra inmediatamente.

---

## 2. Convenciones de datos sintéticos

Todo dato visible en la demo debe cumplir:

| Campo | Formato demo | Ejemplo |
|---|---|---|
| Nombre worker | "Demo <rol> <n>" | "Demo Bartender 1" |
| Nombre cliente | "Cliente Demo <sector>" | "Cliente Demo Eventos" |
| Email | `*@example.com` | `demo.bartender1@example.com` |
| Teléfono | `+1 555-01XX` | `+1 555-0142` |
| Dirección | Genérica sin geocode real | "Demo Venue 1 · 123 Demo St" |
| IDs en URL | Placeholders del plan Sprint 47 | `SHIFT_DEMO_INPROGRESS` |

Cualquier nombre, teléfono, email o dirección que no encaje en esta tabla = **rechazar captura**.

---

## 3. Los 9 escenarios operativos — mapa comercial

Cada fila = una historia vendible que un AE puede contar en <20 segundos apuntando al screenshot.

| # | Escenario | Pantalla principal | Objetivo comercial | Problema que demuestra | Screenshot(s) |
|---|---|---|---|---|---|
| 1 | **Fully staffed shift** | Command Center → Hoy · card de turno verde | "Cuando todo está bien, Stafly no te molesta." | Reduce ruido: el operador solo ve lo que necesita acción. | `10-shift-ops-futuro-desktop.png` |
| 2 | **Understaffed shift** | Command Center → Hoy · card con gauge staffing rojo/amber | "Detectamos huecos de staffing antes de que el cliente los note." | Evita no-show del turno entero y penalizaciones del cliente. | `02-command-center-attention-desktop.png`, `understaffed-card-desktop.png` |
| 3 | **Pending worker responses** | Shift Ops → panel de respuestas · workers en "invitado / esperando" | "Ves quién no ha respondido y a quién perseguir." | Corta el limbo de "mandé WhatsApp y nadie contesta". | `pending-responses-desktop.png` |
| 4 | **Rejected assignment** | Shift Ops → chip "rechazó" + CTA "reasignar" | "Un rechazo no rompe el turno, dispara la siguiente acción." | Elimina el pánico del rechazo de última hora. | `rejected-assignment-desktop.png` |
| 5 | **Replacement needed** | Shift Ops → banner "Buscar reemplazo" con sugerencias | "Sugerimos reemplazos elegibles en segundos, no en horas." | Reemplaza el hilo de WhatsApp del supervisor. | `replacement-suggest-desktop.png` |
| 6 | **No-show** | Shift Ops → chip rojo "No-show" + registro de intento de contacto | "Queda evidencia auditable de cada no-show." | Protege payroll y disputas con cliente. | `no-show-evidence-desktop.png`, `23-evidence-mobile.png` |
| 7 | **Missing meeting point / location** | Shift Detail → warning amber "Falta punto de encuentro" | "El turno no arranca sin la info que el worker necesita." | Reduce llamadas "¿a dónde voy?" 15 min antes. | `missing-meeting-point-desktop.png` |
| 8 | **Shift ready for closeout** | Command Center → Payroll tab · chip "Cierre enviado · en revisión" | "El supervisor cierra en el sitio; el admin revisa en 1 clic." | Acorta el ciclo cierre→payroll de días a horas. | `43-shift-ops-chip-pending-final-desktop.png`, `08-command-center-payroll-desktop.png` |
| 9 | **Shift ready for payroll review** | Payroll Review Queue con `?shiftId=SHIFT_DEMO_APPROVED` | "Payroll ve horas reales de fichaje, no promesas del schedule." | Cero pago por horas fantasma; auditable. | `50-prq-focus-shift-desktop.png`, `51-prq-buckets-desktop.png` |

Los IDs sintéticos por escenario (`SHIFT_DEMO_FUTURE`, `SHIFT_DEMO_INPROGRESS`, `SHIFT_DEMO_ENDED`, `SHIFT_DEMO_SUBMITTED`, `SHIFT_DEMO_NEEDS_CORR`, `SHIFT_DEMO_PENDING_FINAL`, `SHIFT_DEMO_APPROVED`, `SHIFT_DEMO_NO_SHOW`, `SHIFT_DEMO_MISSING_INFO`) están definidos en `STAFly_COMMAND_CENTER_DEMO_TENANT_PLAN.md` y se resuelven cuando se ejecute el seed en el segundo proyecto Supabase.

---

## 4. Screenshots comerciales permitidos — checklist

Solo estos 10 PNGs son "core" del deck. Cualquier extra debe justificarse por escenario.

### Desktop (1280×800, viewport limpio, sin extensiones)

- [ ] `01-command-center-hoy-desktop.png` — overview con Today risk
- [ ] `02-command-center-attention-desktop.png` — understaffed + attention list
- [ ] `pending-responses-desktop.png` — escenario 3
- [ ] `rejected-assignment-desktop.png` — escenario 4
- [ ] `replacement-suggest-desktop.png` — escenario 5
- [ ] `no-show-evidence-desktop.png` — escenario 6
- [ ] `missing-meeting-point-desktop.png` — escenario 7
- [ ] `43-shift-ops-chip-pending-final-desktop.png` — closeout ready
- [ ] `50-prq-focus-shift-desktop.png` — payroll review focused

### Mobile (390×844, safe area respetada)

- [ ] `05-command-center-mobile.png` — overview con contenido demo (reemplaza el emptystate actual)
- [ ] `14-shift-ops-mobile.png` — shift detail con CTA principal visible

---

## 5. Pre-flight por captura (aplicar a cada PNG)

Antes de disparar la captura:

- [ ] Badge amarillo visible en el frame.
- [ ] Todos los nombres/teléfonos/emails/direcciones cumplen §2.
- [ ] No hay consola abierta, network tab, ni Supabase dashboard.
- [ ] Zoom del navegador = 100%.
- [ ] Viewport correcto (1280×800 desktop, 390×844 mobile).
- [ ] Estado de UI alineado con el guion del Loom asociado (`STAFly_COMMAND_CENTER_LOOM_GUIDE.md`).
- [ ] Nombre del archivo sigue convención `NN-descripcion-{desktop|mobile}.png`.
- [ ] Ningún dato en pantalla podría identificar a un cliente, worker o empresa real.

---

## 6. Guion vendible de 3 minutos (para AE / founder)

```
0:00–0:20 · Escenario 1 (fully staffed)
  "Cuando todo funciona, Stafly desaparece. Sin ruido."
0:20–0:50 · Escenario 2 + 3 (understaffed + pending)
  "Cuando algo se mueve, ves el hueco y a quién perseguir, sin abrir WhatsApp."
0:50–1:20 · Escenario 4 + 5 (rejected + replacement)
  "Un rechazo dispara sugerencias elegibles; el supervisor decide en un tap."
1:20–1:50 · Escenario 6 + 7 (no-show + missing info)
  "Cada no-show queda con evidencia; cada turno sale con la info completa."
1:50–2:30 · Escenario 8 (closeout ready)
  "El supervisor cierra en el sitio; el admin aprueba en un clic."
2:30–3:00 · Escenario 9 (payroll ready)
  "Payroll paga horas reales de fichaje, no promesas del schedule."
```

Talking points prohibidos: "paga solo", "payroll automático", "reemplaza al contador", "cumple la ley por sí solo".

---

## 7. Estado actual (2026-07-09)

- ✅ `<EnvBadge/>` global desplegado (Sprint 50).
- ✅ Fallback por hostname protege previews Lovable aunque falte `VITE_APP_ENV`.
- ✅ Documentación, escenarios, IDs sintéticos y guion listos.
- ⏳ **Bloqueado por infraestructura:** el segundo proyecto Supabase (Sprint 49, Opción A) todavía no existe. Hasta que exista y pase el checklist §10 del plan Sprint 49, **no se puede** correr el seed ni capturar screenshots reales.
- ⏳ Los 10 PNGs listados en §4 quedan como checklist a ejecutar en Sprint 46B una vez desbloqueado el ambiente.

---

## 8. Confirmaciones de seguridad de este sprint

- Cero writes a cualquier DB (producción o staging).
- Cero cambios a `src/**` de negocio; no se modificó `EnvBadge.tsx` ni `env-banner.ts` (pasaron QA visual en Sprint 50).
- Cero cambios a payroll, `time_entries`, `shift_assignments`, `scheduled_shifts`, `documents`, auth, RLS, edge functions, payments, bookings, chat, tenants reales.
- Cero lectura de PII real; cero secrets en repo; cero uso de service role en frontend.
- Cero mezcla de tenants; cero contaminación de campañas/partner logic.

---

## 9. Próximo paso recomendado

1. **Infra:** crear el segundo proyecto Supabase (Sprint 49 Opción A) y aplicar schema sync sin datos.
2. **Seed:** ejecutar el runbook Sprint 47 exclusivamente contra ese proyecto para generar los 9 turnos demo con los IDs sintéticos.
3. **Sprint 46B:** con el badge visible y el tenant demo aislado, capturar los 10 PNGs de §4 siguiendo el pre-flight de §5.
4. **Deck:** ensamblar el deck con las 10 capturas mapeadas al guion de §6.

---

## Nota Sprint 52 — Provisioning sigue bloqueado (acción humana requerida)

Sprint 52 verificó que el segundo proyecto Supabase staging/demo **no puede ser creado desde el agente** (no existe tool para crear proyectos Supabase, y ejecutar migraciones desde este proyecto Lovable escribiría en producción). Se documentó el runbook completo out-of-band en `STAFly_COMMAND_CENTER_SPRINT_52_PROVISIONING_REPORT.md` §2 (Pasos 1–7).

Hasta que el owner ejecute Pasos 1–6 de ese runbook, **prohibido**:
- correr migraciones "solo para verificar" contra el proyecto actual,
- correr el seed Sprint 47 contra la DB actual,
- capturar screenshots que no muestren el badge amarillo STAGING/DEMO.
