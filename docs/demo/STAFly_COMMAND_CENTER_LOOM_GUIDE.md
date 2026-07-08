# Stafly Command Center v1 — Loom Guide (Sprint 44)

**Documentation-only.** No cambia código, base de datos, RLS, auth, payroll, `time_entries`, `shift_assignments`, `scheduled_shifts`, edge functions, tenants ni datos reales.

Guiones cortos (2–4 min cada uno) para grabar 5 Looms secuenciales que expliquen el Command Center a un cliente/operador sin lenguaje técnico. Grabar siempre en **staging o sandbox** con datos demo — nunca producción.

---

## Reglas comunes para todos los Looms

- Grabar en 1280×800 mínimo. Zoom del navegador 100%.
- Cursor visible, movimientos lentos.
- Ocultar bookmarks, extensiones y datos personales.
- Nunca mostrar datos reales de clientes ni de workers.
- Nunca decir: "esto paga automáticamente", "payroll listo", "sin revisión", "reemplaza a tu contador", "cumple con la ley por sí solo".
- Siempre decir: "esto es evidencia operativa", "payroll se calcula con horas reales de fichaje", "todo pasa por revisión antes de pagar".

---

## Loom 1 — Command Center Overview (≈2 min)

**Objetivo:** Mostrar la idea general: una pantalla por turno que prioriza según fase.

**Guion:**
1. "Hoy vamos a ver cómo Stafly reemplaza el caos de WhatsApp + Excel + Connecteam con una sola vista operativa."
2. Abrir `/app/command-center` y mostrar tabs (Hoy, Atención, En vivo, Cierre, Listo para pago).
3. "Cada tab responde una pregunta operativa distinta. No es un dashboard bonito, es una lista de decisiones."
4. Click en un turno → abre `/app/shift-ops?id=<id>`.
5. "Esta pantalla es el corazón. Se reordena sola según en qué momento del turno estemos."
6. Cerrar mostrando el chip de fase y el chip de estado de cierre.

---

## Loom 2 — Shift Ops → Time Clock (≈3 min)

**Objetivo:** Mostrar cómo Shift Ops entrega evidencia real de fichaje.

**Guion:**
1. Abrir un turno en curso en `/app/shift-ops?id=<id>`.
2. Señalar el bloque "Asistencia y evidencia".
3. "Aquí vemos quién fichó, quién no, y quién está en riesgo de no-show."
4. Click en "Ver fichajes" → abre `/app/timeclock?shiftId=<id>` con foco en ese turno.
5. "Time Clock es la fuente de verdad. Payroll se calcula con estas horas reales, no con las horas programadas."
6. Volver a Shift Ops y mostrar cómo el estado se refleja en el chip.

---

## Loom 3 — Attendance Evidence / Closeout (≈3 min)

**Objetivo:** Mostrar el caso "llegó pero no marcó" + cierre operativo.

**Guion:**
1. En Shift Ops mostrar un worker con estado "Falta clock-in".
2. Abrir el diálogo de validación admin → seleccionar "Lo vi en sitio".
3. "Esto es evidencia operativa. No modifica payroll. Solo deja constancia para revisión."
4. Mostrar el banner: *"Payroll se calcula con fichajes reales o ajustes aprobados."*
5. Mostrar cierre del capitán (si aplica) y cómo el chip cambia a "Cierre enviado · en revisión".

---

## Loom 4 — Payroll Review Queue payroll-safe (≈3 min)

**Objetivo:** Mostrar el Centro de Validación como paso seguro previo a payroll.

**Guion:**
1. Desde Shift Ops click en el chip de estado → `/app/payroll-review-queue?shiftId=<id>`.
2. "Aquí María, ops manager, revisa las horas antes de que lleguen a payroll."
3. Recorrer buckets: Requiere corrección, En revisión, Pendiente final, Listo para pago.
4. Aprobar un ajuste demo → mostrar cómo el chip vuelve a Shift Ops como "Aprobado · pasa a payroll".
5. "Stafly no paga automáticamente. Stafly deja el turno listo, auditado y con evidencia, para que payroll se ejecute con confianza."

---

## Loom 5 — Comparación comercial vs WhatsApp/Excel/Connecteam (≈4 min)

**Objetivo:** Cerrar la venta con contraste honesto.

**Guion:**
1. "Sin Stafly: WhatsApp confirma workers, Excel guarda asignaciones, Connecteam registra fichajes, y la revisión de horas es a mano una semana después."
2. "El resultado: no-shows tarde, workers sin evidencia, turnos sin cerrar, admin sin contexto."
3. "Con Stafly: una pantalla por turno, evidencia unificada, cierre operativo trazable, y un Centro de Validación que protege payroll."
4. Recorrer rápidamente Command Center → Shift Ops → Time Clock → PRQ.
5. Cierre: "Stafly no reemplaza a tu contador ni a tu abogado laboral. Reemplaza el caos operativo entre el turno y payroll."

---

## Checklist previo a grabar

- [ ] Sesión admin en staging.
- [ ] Datos demo cargados (ver checklist de staging en el Demo Pack).
- [ ] Navegador limpio, zoom 100%, 1280×800 mínimo.
- [ ] Micrófono probado.
- [ ] Guion abierto en segunda pantalla.
- [ ] Ningún dato real de cliente/worker visible.
