# Stafly Command Center v1 — Sales Deck Outline (Sprint 44)

**Documentation-only.** No cambia código, base de datos, RLS, auth, payroll, `time_entries`, `shift_assignments`, `scheduled_shifts`, edge functions, tenants ni datos reales.

Outline de 8–10 slides para convertir el Command Center en un pitch comercial de 10 minutos. Cada slide tiene título, mensaje central y talking points seguros. **Nunca prometer** automatización de payroll ni reemplazo legal/compliance.

---

## Slide 1 — Título

- **Título:** Stafly Command Center — una pantalla por turno.
- **Subtítulo:** Del caos entre WhatsApp/Excel/Connecteam a evidencia operativa auditable.
- **Visual:** Logo Stafly + screenshot de Shift Ops.

## Slide 2 — El dolor real

- **Mensaje:** El operador pierde el turno en la coordinación, no en el trabajo.
- **Talking points:**
  - Confirmaciones dispersas en WhatsApp.
  - Excel desactualizado al inicio del turno.
  - Fichajes desconectados de la operación.
  - Revisión de horas a mano, una semana después.
  - No-shows detectados tarde.

## Slide 3 — Costo del caos

- **Mensaje:** Cada turno mal coordinado cuesta dinero, confianza y reputación.
- **Talking points:**
  - Workers pagados de más o de menos por falta de evidencia.
  - Clientes que reclaman sin poder rebatir.
  - Admin quemado revisando payroll ciego.
  - Sin auditabilidad ante disputas laborales.

## Slide 4 — Cómo funciona Stafly

- **Mensaje:** Una pantalla por turno que se reordena según la fase del día.
- **Visual:** Diagrama: Antes → Durante → Después → Cerrado.
- **Talking points:**
  - Antes: staffing y confirmación.
  - Durante: asistencia y evidencia.
  - Después: cierre y revisión.
  - Cerrado: estado del Centro de Validación.

## Slide 5 — Flujo demo

- **Mensaje:** El admin pasa de un lado al otro sin cambiar de mundo.
- **Visual:** Screenshots izquierda→derecha: Shift Ops → Time Clock → Evidence → Closeout → PRQ.
- **Talking points:** Deep-links preservan contexto (`?shiftId=<id>`).

## Slide 6 — Protección de payroll

- **Mensaje:** Stafly protege payroll, no lo reemplaza.
- **Talking points:**
  - Payroll se calcula con **horas reales** de `time_entries` o ajustes aprobados.
  - Nunca con horas programadas.
  - Validaciones operativas ≠ payroll.
  - Centro de Validación como último filtro antes de pagar.

## Slide 7 — Evidencia y auditoría

- **Mensaje:** Todo queda trazado, todo tiene razón.
- **Talking points:**
  - Cada validación admin registra motivo.
  - Cierre del capitán con timestamp.
  - Estados del PRQ visibles desde Shift Ops.

## Slide 8 — Vs. WhatsApp/Excel/Connecteam

- **Mensaje:** Stafly no compite con el fichaje, integra la operación.
- **Talking points:**
  - Connecteam registra; Stafly opera.
  - WhatsApp coordina; Stafly documenta.
  - Excel lista; Stafly prioriza.

## Slide 9 — Límites honestos

- **Mensaje:** Lo que Stafly **no** promete.
- **Talking points:**
  - No paga automáticamente.
  - No reemplaza contador, abogado laboral ni compliance oficial.
  - No sustituye políticas internas de la empresa.
  - Todo pago requiere revisión humana.

## Slide 10 — Cierre / Next step

- **Mensaje:** Empieza con un turno demo, no con un contrato.
- **Talking points:**
  - Piloto con 1 operación / 1 semana.
  - Onboarding guiado por Jorge.
  - Métricas de éxito acordadas por adelantado.

---

## Recomendaciones de diseño

- Tipografía: la del brand (ver `docs/BRAND_ARCHITECTURE_V1.md`), sin fuentes genéricas.
- Colores: paleta Stafly, evitar gradientes purple/indigo genéricos.
- Screenshots reales del staging (no mockups genéricos AI).
- Mobile: si se muestra, usar cards + KPIs compactos, nunca charts.

---

## Nota Sprint 46 — Estado de assets visuales

Los screenshots referenciados en el mapping slide↔visual (ver `STAFly_COMMAND_CENTER_SPRINT_45_ASSET_RUNBOOK.md` §5) están **pendientes de captura en tenant demo aislado**. Ver estado en `docs/demo/screenshots/README.md`.

Slides que ya pueden armarse **sin visual bloqueante**: 2, 3, 8, 9 (mensaje puro).
Slides bloqueados hasta tener screenshots demo: 1, 4, 5, 6, 7, 10.

Mientras tanto se puede usar `docs/demo/screenshots/05-command-center-mobile-emptystate.png` como referencia neutra del layout mobile, sin exponer datos de ningún tenant.
