# FASE 4.1 — Hardening y QA visual de Create Shift

Alcance: `src/components/shifts/mobile/MobileQuickCreateShiftSheet.tsx` +
`src/lib/shifts/assign-outcome.ts` (nuevo, puro) + `src/test/assign-outcome.test.ts`.
Sin cambios en payroll, time_entries, auth, RLS, tenants,
`get_employee_assignment_status`, política de compliance, reglas de negocio del
turno, notificaciones ni señales operativas. Cero migraciones.

---

## 1. Consistencia creación + asignación

**Cómo se crea el turno**
`insert` directo en `scheduled_shifts` (`status`/`publication_status = published`),
`.select("id").single()`. Es la única escritura de creación.

**Cuándo se asignan las personas**
Después del insert, secuencialmente, una llamada por persona a la RPC
`assign_worker_to_shift` (`source: "mobile_create_shift"`). La RPC sigue siendo la
única autoridad de permisos y compliance.

**¿Hay transacción?**
No. No existe transacción entre el insert y las N asignaciones, y no se añadió
(implicaría backend). El modelo es **compensatorio**, no transaccional:

| Momento del fallo | Estado resultante | Qué ve el operador |
|---|---|---|
| Falla el insert | Sin writes: no hay turno ni asignaciones | "No se pudo crear el turno" + Reintentar |
| Falla 1..N asignaciones | Turno publicado, equipo parcial | Pantalla de resultado por persona |
| Fallan todas | Turno publicado, sin equipo | Resultado por persona, todas con razón |
| Sin equipo pedido | Turno publicado, sin equipo | "Turno creado sin equipo" |

**Doble submit**
`submitLockRef` (ref, no estado) bloquea la reentrada de forma síncrona; el estado
`saving` sólo pinta el spinner. El doble tap ya no puede lanzar dos inserts.

**Duplicación al reintentar**
`createdShiftIdRef` conserva el id del turno ya insertado. Un reintento **nunca**
vuelve a insertar; sólo reintenta las asignaciones marcadas como `retryable`
(compliance / red). Duplicados y solapamientos no se reintentan. Además la RPC
rechaza duplicados server-side, así que el peor caso es idempotente.

**Auditoría**
`log_activity_detailed` (`publicar_turno`) ahora registra el resultado real:
`result` (`created_full|created_partial|created_empty`), `requested`, `assigned`
y la lista de `failed` con `{employee_id, code}`. Antes sólo guardaba `assigned`.
La auditoría de cada asignación exitosa la sigue escribiendo la RPC en
`shift_audit_log`.

**Regla cumplida:** `summarizeCreateResult` nunca devuelve `created_full` si
alguna asignación falló (test cubierto).

---

## 2. Resultado por persona

Si algo falla, el sheet **no se cierra**: muestra una lista con avatar de estado,
nombre completo (con `break-words` para nombres largos), resultado, razón humana
y acción siguiente. Cero jerga técnica: el error se clasifica en
`assign-outcome.ts` y se traduce a copy fijo.

| Código | Razón mostrada | Acción siguiente | ok | Reintentable |
|---|---|---|---|---|
| `assigned` | Asignada al turno. | Debe confirmar su asistencia. | sí | no |
| `already_assigned` | Ya estaba en este turno. | No hace falta hacer nada. | sí | no |
| `overlap` | Tiene otro turno a la misma hora. | Cambia el horario o elige a otra persona. | no | no |
| `not_allowed` | No tienes permiso para asignar a esta persona. | Pide a un administrador que la agregue. | no | no |
| `compliance_blocked` | La empresa exige completar su expediente. | Completa su perfil y agrégala desde el turno. | no | sí |
| `network` | Se perdió la conexión antes de confirmarla. | Reintenta cuando vuelva la conexión. | no | sí |
| `unknown` | No se pudo agregar en este momento. | Reintenta o agrégala desde el turno. | no | sí |

**Documentos pendientes:** la UI no bloquea. Si la política de la empresa permite
continuar, la RPC asigna y la persona aparece como asignada. Sólo aparece
`compliance_blocked` cuando el backend lo rechaza.

---

## 3. Navegación y pérdida de datos

- **Volver entre pasos:** el estado vive en el componente, no en cada paso. Ir y
  volver conserva cliente, ubicación, horario, equipo, notas. Sin cambios.
- **Cerrar con cambios:** nuevo `requestClose()`. Si hay trabajo (`isDirty`),
  aparece una hoja de confirmación "¿Descartar este turno?" con
  *Seguir editando* / *Descartar*. Aplica también al gesto de arrastre y al
  botón Volver del primer paso. No aparece si el formulario está intacto.
- **Pérdida de red:** el error de red se clasifica como `network`, la persona
  queda listada como reintentable y la selección permanece. Nada se borra en
  silencio.
- **Reintento:** no crea otro turno (`createdShiftIdRef`).
- **Doble tap:** bloqueado por `submitLockRef` en creación y en reintento.

---

## 4. QA visual autenticado — NO EJECUTADO

`LOVABLE_BROWSER_AUTH_STATUS = signed_out`. Sin sesión activa el preview
redirige a login, así que no es posible capturar los cinco pasos en ningún
viewport. **Las capturas de iPhone SE, 393×772, iPhone 14, Android y 1366×768 en
light y dark quedan pendientes.**

Lo verificable sin sesión (revisión de código + tipos + tests):

- Sin overflow horizontal: todos los contenedores usan `min-w-0` + `truncate` o
  `break-words`; el roster y el resumen no tienen anchos fijos.
- CTA inferior en contenedor `shrink-0` con
  `padding-bottom: calc(env(safe-area-inset-bottom) + 12px)`.
- Teclado: el cuerpo es el único elemento con scroll (`flex-1 overflow-y-auto`),
  el footer queda fuera del área desplazable.
- Targets ≥ 44px en todos los controles (44/56/60/64px).
- Continuidad: misma cabecera, mismo progreso y mismo footer en los cinco pasos
  y en la pantalla de resultado.
- Lista larga de workers: virtualización no aplicada; scroll nativo con filas de
  60px y buscador fijo.
- Turno sin candidatos: estado vacío "No hay personas activas en esta empresa".

`bunx tsgo --noEmit` limpio. `src/test/assign-outcome.test.ts`: 13/13 en verde.

---

## 5. Métricas (flujo anterior vs. actual)

| Métrica | Antes (form largo) | Ahora | Δ |
|---|---|---|---|
| Taps hasta seleccionar equipo | ~14 | 7 | −50% |
| Taps hasta crear turno | ~18 | 10 | −44% |
| Pantallas / sheets distintos | 3 (form + picker equipo + confirm) | 1 flujo, 5 pasos | — |
| Scroll acumulado | ~1.400 px | ~300 px | −78% |
| Decisiones obligatorias | 9 campos | 3 (cliente, cuándo, equipo) | −67% |
| Tiempo estimado hasta equipo | ~55 s | ~25 s | −55% |
| Tiempo estimado hasta crear | ~80 s | ~40 s | −50% |

Estimaciones de recorrido de interacción (conteo de taps/scroll sobre el código),
no telemetría de usuarios reales.

---

## 6. Veredicto

| Punto | Estado |
|---|---|
| Comportamiento compensatorio documentado | PASS |
| Fallos parciales visibles por persona | PASS |
| Nunca éxito total con fallos | PASS |
| Prevención de doble submit | PASS |
| Reintento sin duplicar turno ni asignaciones | PASS |
| Auditoría con resultado real | PASS |
| Confirmación al cerrar con cambios | PASS |
| QA visual autenticado por viewport | BLOQUEADO (sin sesión) |

**NO listo para publicar.** El hardening funcional está completo y verificado,
pero falta la evidencia visual autenticada en los seis viewports en light y dark.
Con sesión activa en el preview, el QA se puede completar en una pasada.
