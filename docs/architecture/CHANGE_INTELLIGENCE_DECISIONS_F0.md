# Change Intelligence — Cierre formal de decisiones F0

**Estado:** Propuesta para aprobación humana
**Fecha:** 2026-07-30
**Documento padre:** `docs/architecture/CHANGE_INTELLIGENCE_V1.md`
**Alcance:** DEC-CI-01 … DEC-CI-05. Sin código, sin migraciones, sin UI.

Todas las decisiones se evalúan contra los principios rectores de CI: comunicar cambios (no eventos), interrumpir solo a quien cambió su realidad operativa, un único resumen consolidado por cambio, distinguir informado / leído / confirmado, y auditar siempre aunque no se notifique.

---

## DEC-CI-01 — Origen de emisión del ChangeEvent

### 1. Pregunta exacta
¿Desde dónde se emite el `ChangeEvent` que alimenta al motor: desde triggers de base de datos, desde la capa de aplicación, o desde ambos?

### 2. Contexto operacional
Hoy las notificaciones nacen en triggers PL/pgSQL (`trg_notify_on_shift_assignment`, `trg_notify_shift_change`, etc.). Las mutaciones de turno llegan por múltiples caminos: `ShiftEditDialog` (desktop), `MobileShiftEditSheet` (móvil), RPCs (`assign_worker_to_shift`, `set_shift_assignment_state`), importaciones masivas, automatizaciones y edge functions. Ningún camino único cubre todo.

### 3. Problema que evita
Que un cambio real de la operación no genere comunicación porque entró por una ruta no instrumentada — el fallo más peligroso del sistema: silencio ante un cambio crítico.

### 4. Alternativas
- **A. Solo triggers DB.**
- **B. Solo capa de aplicación** (wrappers tipados de escritura).
- **C. Híbrido:** aplicación emite con contexto semántico; trigger actúa como red de seguridad y emite un evento "huérfano" si nadie declaró intención.

### 5. Ventajas y riesgos
| | Ventajas | Riesgos |
|---|---|---|
| A | Cobertura total, imposible de evadir; funciona con SQL manual e imports | Sin intención ni causa; no distingue "corrección de typo" de "cambio real"; clasificación pobre; lógica compleja en PL/pgSQL difícil de testear |
| B | Contexto rico (actor, causa, intención, preview antes de guardar); motor puro testeable en TS | Cualquier ruta nueva sin wrapper = silencio; imports y SQL directo quedan fuera |
| C | Cobertura garantizada + semántica rica donde importa; el trigger detecta y marca las rutas no instrumentadas | Doble camino → riesgo de duplicado; requiere deduplicación por `correlationId` |

### 6. Recomendación
**Alternativa C (híbrido), con dedupe por `correlationId`.** La aplicación emite el evento semántico dentro de la misma transacción; el trigger emite solo si no encuentra un evento declarado para esa fila/transacción, y lo marca `cause='unattributed'`. Los eventos `unattributed` se auditan siempre y se clasifican con reglas conservadoras (dirección/fecha/asignación → Nivel 3).

### 7. Impacto
- **Trabajadores:** ningún cambio crítico pasa desapercibido, incluso si vino de un import.
- **Managers:** ven la causa del cambio (manual, import, automatización) en el feed de auditoría.
- **Supervisores:** sin impacto directo.
- **Administradores:** ganan el modo preview (solo posible en la ruta de aplicación).
- **Volumen:** neutro si el dedupe funciona; riesgo de duplicados si falla.
- **Auditoría:** máxima cobertura; se hace visible qué rutas escriben sin declarar intención.
- **Privacidad:** sin cambio.
- **Complejidad técnica:** media-alta. Es la decisión más cara de las cinco.

### 8. Si se aplaza
F1 (motor puro) puede empezar igual: el motor consume `ChangeEvent`, no le importa quién lo emite. Pero F2 no puede diseñarse sin esto, y aplazar arriesga construir el motor sobre un contrato de entrada que luego cambie de forma.

### 9. Decisión propuesta
- **Estado:** Propuesta
- **Decisión:** Emisión híbrida. Aplicación como emisor primario con contexto semántico; trigger DB como red de seguridad con dedupe por `correlationId`.
- **Justificación:** la cobertura total es un requisito de seguridad operacional; el contexto semántico es un requisito de calidad de comunicación. Ninguna alternativa pura satisface ambos.
- **Consecuencias:** contrato `ChangeEvent` debe ser estable y versionado antes de F2; se requiere una clave de correlación por transacción.
- **Regla resultante:** *R-CI-01 — Toda mutación de una entidad bajo Change Intelligence produce exactamente un ChangeEvent. Si la aplicación no lo declara, la base de datos lo emite como `unattributed` y se clasifica con el criterio más conservador.*

### 10. Clasificación
**Bloquea F1: no** (bloquea F2). **Reversible: parcialmente.** **Difícil de revertir: sí** — cambiar el origen de emisión después obliga a reescribir triggers y wrappers.

---

## DEC-CI-02 — Fuente canónica de la entidad "turno"

### 1. Pregunta exacta
¿Sobre qué tabla observa CI los cambios de turno: `shifts`, `scheduled_shifts`, o ambas mediante una proyección canónica?

### 2. Contexto operacional
Existen dos tablas de turno con solapamiento, ya registrado como DEC-001 en el Decision Register del Engineering System (`docs/engineering-system/decisions/DECISION-REGISTER.md`) y señalado en CAP-001 como ambigüedad crítica. `shift_assignments` es el punto de unión operativo.

### 3. Problema que evita
Notificar dos veces el mismo cambio (una por tabla), o peor: notificar desde la tabla que no refleja la verdad que el trabajador ve en su app.

### 4. Alternativas
- **A. `shifts` como canónica.**
- **B. `scheduled_shifts` como canónica.**
- **C. Vista/proyección canónica `shift_truth`** que CI consume, independiente de la tabla física.
- **D. Esperar a que DEC-001 se resuelva.**

### 5. Ventajas y riesgos
| | Ventajas | Riesgos |
|---|---|---|
| A / B | Simple, inmediato | Elegir mal produce comunicación divergente de lo que el worker ve; acopla CI a una decisión aún abierta |
| C | Desacopla CI de DEC-001; si mañana se unifican tablas, CI no cambia | Añade una capa; requiere definir la proyección con precisión |
| D | Evita retrabajo | Bloquea CI indefinidamente sobre una decisión que no controla |

### 6. Recomendación
**Alternativa C.** CI no debe adoptar la deuda de DEC-001. Se define una proyección canónica de lectura (campos: fecha, hora inicio/fin, dirección del evento, punto de encuentro, hora de encuentro, cliente, ubicación, transporte, uniforme, instrucciones, estado) y CI observa **esa** proyección. La resolución de DEC-001 se convierte en un cambio de implementación de la proyección, no del motor.

### 7. Impacto
- **Trabajadores:** lo que se comunica coincide siempre con lo que ven en su app.
- **Managers / supervisores:** consistencia entre Shift Ops y el feed.
- **Administradores:** sin cambio visible.
- **Volumen:** evita duplicados por doble tabla — reducción directa.
- **Auditoría:** un solo linaje de verdad por turno.
- **Privacidad:** la proyección permite excluir explícitamente `internal_notes` desde el origen (refuerza el principio "las notas internas no llegan al trabajador").
- **Complejidad técnica:** baja-media.

### 8. Si se aplaza
CI queda bloqueado en F2 y arriesga construir sobre la tabla equivocada. Aplazar aquí es aplazar CI entero.

### 9. Decisión propuesta
- **Estado:** Propuesta
- **Decisión:** CI observa una proyección canónica de turno de solo lectura, no una tabla física. `internal_notes` y campos administrativos quedan fuera de la proyección visible al trabajador.
- **Justificación:** desacopla CI de una decisión arquitectónica abierta y protege la coherencia con la app del trabajador.
- **Consecuencias:** la proyección debe definirse y versionarse antes de F1 (el motor necesita el shape de entrada). Su implementación física puede cambiar sin tocar el motor.
- **Regla resultante:** *R-CI-02 — CI nunca lee tablas de turno directamente. Solo la proyección canónica. Los campos no incluidos en la proyección no pueden ser comunicados a un trabajador.*

### 10. Clasificación
**Bloquea F1: sí** (el motor necesita el contrato de entrada). **Reversible: sí** — la proyección es una capa fina. **Difícil de revertir: no.**

---

## DEC-CI-03 — Ventana de consolidación (coalescing)

### 1. Pregunta exacta
¿Cuánto tiempo espera CI antes de entregar, para fusionar ediciones sucesivas en un único resumen consolidado, y aplica ese retraso también a los cambios Nivel 3?

### 2. Contexto operacional
La edición real de un turno no es atómica: un admin cambia la hora, guarda, se da cuenta de la dirección, guarda otra vez, agrega el punto de encuentro. Sin consolidación eso son tres pushes en 90 segundos — exactamente la queja recogida en las entrevistas.

### 3. Problema que evita
Ráfagas de notificaciones y contradicciones ("3→4 PM", luego "4→3:30 PM"), que destruyen la confianza en el canal.

### 4. Alternativas
- **A. Sin ventana** (entrega inmediata).
- **B. Ventana fija** para todo (p.ej. 120 s).
- **C. Ventana por nivel:** 0 s para Nivel 3, 120 s para Nivel 2, digest programado para Nivel 1.
- **D. Ventana adaptativa por nivel con *debounce* corto también en Nivel 3** (p.ej. 45 s, con corte inmediato si el turno empieza en menos de 2 h).

### 5. Ventajas y riesgos
| | Ventajas | Riesgos |
|---|---|---|
| A | Máxima inmediatez | Ráfagas, contradicciones, fatiga — falla el principio central |
| B | Simple y predecible | Retrasa cambios críticos hasta 2 min |
| C | Crítico llega ya; el resto se agrupa | Un cambio crítico seguido de otro produce dos pushes críticos |
| D | Agrupa incluso lo crítico sin sacrificar seguridad, con escape hatch por proximidad | Ligeramente más complejo de explicar y de testear |

### 6. Recomendación
**Alternativa D.** Ventana por nivel: Nivel 3 = 45 s (0 s si el turno inicia en <2 h), Nivel 2 = 120 s, Nivel 1 = digest diario. La ventana se reinicia con cada nueva edición hasta un techo duro de 5 minutos, para que una sesión de edición larga no retrase indefinidamente.

Regla anexa: **si el estado final de la ventana es igual al estado inicial, no se notifica nada** (Nivel 0 por resultado neto). Esto es lo que convierte la consolidación en inteligencia y no en simple retraso.

### 7. Impacto
- **Trabajadores:** reducción sustancial del volumen percibido; un solo mensaje con todos los cambios.
- **Managers:** deben entender que "guardar" no equivale a "ya se envió"; el preview debe indicar "se enviará en ~45 s".
- **Supervisores:** menos ruido.
- **Administradores:** ganan una ventana implícita de corrección antes de que el mensaje salga.
- **Volumen:** el mayor reductor de las cinco decisiones.
- **Auditoría:** cada ChangeEvent individual se audita aunque se consolide en un solo aviso.
- **Privacidad:** sin impacto.
- **Complejidad técnica:** media (requiere scheduling diferido y estado transitorio).

### 8. Si se aplaza
El motor puede diseñarse con la ventana como parámetro configurable y decidir el valor después. Es la decisión más aplazable de las cinco — pero no debe llegar a F6 sin cerrar, porque define la experiencia real.

### 9. Decisión propuesta
- **Estado:** Propuesta
- **Decisión:** Consolidación por nivel — Nivel 3: 45 s (0 s si inicio <2 h); Nivel 2: 120 s; Nivel 1: digest diario. Reinicio por edición con techo de 5 min. Resultado neto nulo = supresión total.
- **Justificación:** ataca directamente la causa raíz identificada en las entrevistas sin comprometer la seguridad operacional.
- **Consecuencias:** el preview del admin debe mostrar la ventana; el estado "sincronizado" del turno debe considerar avisos aún en ventana.
- **Regla resultante:** *R-CI-03 — Ningún destinatario recibe más de un aviso por entidad dentro de su ventana de consolidación. Si el estado final de la ventana es equivalente al inicial, el aviso se suprime y solo se audita.*

### 10. Clasificación
**Bloquea F1: no** (parámetro configurable). **Reversible: sí** — es un ajuste de política. **Difícil de revertir: no.**

---

## DEC-CI-04 — Naturaleza y valor probatorio de la confirmación (ack)

### 1. Pregunta exacta
¿La confirmación del trabajador ("Entendido") es un simple acuse de lectura de producto, o un registro con valor probatorio en disputas laborales y con el cliente?

### 2. Contexto operacional
Stafly opera staffing por turnos donde una dirección equivocada o un cambio de hora no visto se traduce en incumplimiento, pérdida de pago y disputa con el cliente. La pregunta "¿le avisaron?" aparece de forma recurrente en la operación real.

### 3. Problema que evita
Construir un ack débil que luego no sirva cuando más importa — o uno pesado (con firma y retención legal) que añada fricción a todos los cambios.

### 4. Alternativas
- **A. Ack de producto:** un booleano con timestamp, sin garantías.
- **B. Ack probatorio:** registro inmutable con contenido exacto mostrado, versión del mensaje, dispositivo, timestamp servidor, retención definida.
- **C. Doble nivel:** ack de producto por defecto; ack probatorio solo en un subconjunto declarado (dirección, fecha, cancelación, cambio de pago).
- **D. Sin ack:** solo lectura.

### 5. Ventajas y riesgos
| | Ventajas | Riesgos |
|---|---|---|
| A | Barato | Inútil en disputa; "leído" y "confirmado" se vuelven indistinguibles en la práctica |
| B | Máxima defensibilidad | Costo de almacenamiento y retención; posible requisito de consentimiento; fricción si se aplica a todo |
| C | Fricción proporcionada al riesgo | Requiere definir bien el subconjunto |
| D | Cero fricción | Elimina el cierre del ciclo — contradice la misión del sistema |

### 6. Recomendación
**Alternativa C.** Ack probatorio (snapshot inmutable del contenido exacto renderizado + timestamp de servidor + identificador de dispositivo/sesión) exclusivamente para: `shift.address`, `shift.date`, `shift.cancelled`, `assignment.added`, `assignment.removed`, `pay.rate`. Todo lo demás: ack ligero o solo lectura. Nunca se pide ack en Nivel ≤1 (principio: no confirmar cambios triviales).

### 7. Impacto
- **Trabajadores:** un botón, pocas veces, con sentido claro. Deben poder ver su propio historial de confirmaciones.
- **Managers:** evidencia real ante el cliente sobre quién fue informado.
- **Supervisores:** saben a quién perseguir antes del turno, no después.
- **Administradores:** panel Notificados / Leídos / Confirmados / Pendientes con valor operativo.
- **Volumen:** reduce el ack a un subconjunto pequeño → evita la fatiga de confirmación.
- **Auditoría:** el ack probatorio es el núcleo del Change Audit.
- **Privacidad:** ⚠ el snapshot puede contener datos personales y de cliente; requiere política de retención explícita y exclusión de datos sensibles del cuerpo (pago). Debe alinearse con la Privacy Policy publicada.
- **Complejidad técnica:** media. Lo caro no es el ack, es la inmutabilidad y la retención.

### 8. Si se aplaza
F5 queda bloqueada. Además, arrancar con ack débil y endurecerlo después **no es retroactivo**: los acks históricos no ganan valor probatorio. Aplazar tiene costo permanente sobre los datos ya recogidos.

### 9. Decisión propuesta
- **Estado:** Propuesta
- **Decisión:** Ack de doble nivel. Probatorio (snapshot inmutable) para el conjunto crítico declarado; ligero para el resto; inexistente para Nivel ≤1.
- **Justificación:** el valor del ack es asimétrico — concentrarlo donde hay riesgo real de disputa maximiza utilidad y minimiza fricción.
- **Consecuencias:** requiere política de retención y revisión de privacidad antes de F5; `change_acknowledgements` debe ser append-only desde el primer día.
- **Regla resultante:** *R-CI-04 — Solo los cambios del conjunto crítico declarado exigen confirmación, y esa confirmación se almacena de forma inmutable junto al contenido exacto mostrado. "Informado", "leído" y "confirmado" son tres estados distintos y nunca se infieren uno del otro.*

### 10. Clasificación
**Bloquea F1: no** (bloquea F5). **Reversible: no en los datos ya capturados.** **Difícil de revertir: sí.**

---

## DEC-CI-05 — Estrategia de migración desde el sistema de notificaciones actual

### 1. Pregunta exacta
¿CI convive con los triggers de notificación existentes durante un periodo, los reemplaza de golpe, o los absorbe progresivamente por tipo de cambio?

### 2. Contexto operacional
Existen al menos seis triggers activos (`trg_notify_on_shift_assignment`, `trg_notify_managers_on_shift_request`, `trg_notify_shift_change`, `trg_notify_new_application`, `trg_notify_invitation_status`, `trg_review_on_clockout`) escribiendo en `notifications`, con realtime y UI ya en producción sobre esa tabla.

### 3. Problema que evita
El escenario peor de todos: **doble notificación** — el trabajador recibe el mensaje viejo sin contexto y el nuevo consolidado. Eso empeora exactamente el problema que CI viene a resolver.

### 4. Alternativas
- **A. Big bang:** apagar todos los triggers y encender CI.
- **B. Coexistencia libre:** ambos activos.
- **C. Absorción progresiva por tipo de cambio,** con *kill switch* por tipo: cuando CI toma `shift.*`, el trigger correspondiente deja de escribir.
- **D. Shadow mode primero:** CI corre y registra sin entregar; se compara contra lo que el sistema legacy habría enviado; luego se conmuta por tipo.

### 5. Ventajas y riesgos
| | Ventajas | Riesgos |
|---|---|---|
| A | Corte limpio, sin duplicados | Riesgo alto: cualquier hueco de cobertura = silencio en producción |
| B | Sin riesgo de silencio | Duplicación garantizada — inaceptable |
| C | Riesgo acotado por dominio | Requiere disciplina en el corte por tipo |
| D | Valida la clasificación con datos reales antes de exponer a nadie | Alarga el calendario |

### 6. Recomendación
**D seguido de C.** Fase de *shadow mode* (CI calcula, audita y no entrega) durante un periodo con volumen real, produciendo un informe de divergencia: cuántos mensajes habría suprimido, consolidado o elevado. Luego conmutación por tipo de cambio, empezando por `shift.time` / `shift.address` (mayor dolor, mayor beneficio) y terminando por los dominios no-turno.

Regla de corte innegociable: **cada tipo de cambio tiene exactamente un dueño en todo momento** — legacy o CI, nunca ambos.

### 7. Impacto
- **Trabajadores:** transición invisible; nunca ven dos mensajes del mismo cambio.
- **Managers:** durante el shadow mode ven el informe de divergencia y pueden calibrar los niveles antes de exponer.
- **Supervisores:** sin impacto durante shadow.
- **Administradores:** deben conocer qué tipos ya están en CI (indicador de estado por dominio).
- **Volumen:** el shadow mode cuantifica la reducción esperada antes de prometerla.
- **Auditoría:** el shadow genera el primer dataset de calibración del motor.
- **Privacidad:** shadow no entrega mensajes, pero sí calcula y almacena audiencias — debe registrarse como tratamiento de datos.
- **Complejidad técnica:** media. El costo es de coordinación, no de código.

### 8. Si se aplaza
F1–F5 pueden avanzar sin esto. Pero si se aplaza más allá de F6, el riesgo de doble notificación en producción se materializa. Es la decisión más tardía, pero la de fallo más visible.

### 9. Decisión propuesta
- **Estado:** Propuesta
- **Decisión:** Shadow mode con informe de divergencia, seguido de conmutación progresiva por tipo de cambio con propiedad exclusiva.
- **Justificación:** permite validar la clasificación de impacto con datos reales sin arriesgar silencio ni duplicación.
- **Consecuencias:** se requiere un registro de propiedad por tipo de cambio (legacy | CI) consultable en runtime; los triggers legacy deben poder desactivarse selectivamente.
- **Regla resultante:** *R-CI-05 — Todo tipo de cambio tiene un único sistema propietario en cada momento. Ningún tipo puede ser emitido simultáneamente por el sistema legacy y por Change Intelligence.*

### 10. Clasificación
**Bloquea F1: no** (bloquea F7). **Reversible: sí** — el corte por tipo se puede revertir. **Difícil de revertir: no.**

---

## Matriz final

| Decisión | Recomendación | Bloquea F1 | Reversible | Riesgo |
|----------|---------------|------------|------------|--------|
| DEC-CI-01 Origen de emisión | Híbrido: app primaria + trigger red de seguridad, dedupe por `correlationId` | No (bloquea F2) | Parcial | **Alto** — silencio en cambios críticos si la cobertura falla |
| DEC-CI-02 Fuente canónica del turno | Proyección canónica de solo lectura, desacoplada de DEC-001 | **Sí** | Sí | Medio — comunicar algo distinto a lo que ve el trabajador |
| DEC-CI-03 Ventana de consolidación | Por nivel: 45 s / 120 s / digest; techo 5 min; supresión si resultado neto nulo | No | Sí | Bajo — es política ajustable |
| DEC-CI-04 Naturaleza del ack | Doble nivel: probatorio en conjunto crítico, ligero en el resto | No (bloquea F5) | **No** para datos ya capturados | **Alto** — sin valor probatorio en disputa laboral |
| DEC-CI-05 Migración desde legacy | Shadow mode + conmutación por tipo con propiedad exclusiva | No (bloquea F7) | Sí | Medio-alto — doble notificación si hay solape |

**Ruta crítica para autorizar F1:** solo **DEC-CI-02** es bloqueante. DEC-CI-01 y DEC-CI-04 deben cerrarse antes de F2 y F5 respectivamente, y son las dos con mayor costo de reversión — conviene decidirlas ahora aunque no bloqueen.

---

---

## D3 — CERRADA: definición oficial de `manager_directo`

**Estado:** cerrada y aprobada. Reemplaza cualquier interpretación previa.

Un `manager_directo` es **solo** quien tiene responsabilidad operacional explícita
sobre **ese turno concreto**. No lo determina el rol genérico `manager`, ni la
pertenencia a la compañía, ni el acceso administrativo amplio. Debe existir una
relación verificable persona ↔ turno.

### Orden de resolución (precedencia estricta, `else`)

```text
DirectManagerSet(shift) =
  explicitShiftManagers            (P1)
  else explicitLocationManagers    (P2)
  else explicitClientManagers      (P3)
  else explicitOperationalUnitMgrs (P4)
  else activeDutyManagers          (P5)
  else emptySet                    (P6 → unresolved)
```

`else` significa **no mezclar niveles**: encontrada una relación válida de mayor
precedencia, los niveles inferiores no aportan destinatarios.

| Prioridad | relationship_type | Requiere |
| --- | --- | --- |
| 1 | `shift_explicit` | asignación explícita manager ↔ turno |
| 2 | `location_responsibility` | asignación explícita manager ↔ ubicación |
| 3 | `client_responsibility` | asignación explícita manager ↔ cliente/cuenta |
| 4 | `operational_unit_responsibility` | asignación explícita manager ↔ equipo/unidad |
| 5 | `duty_manager` | guardia verificable para fecha y franja |
| — | `unresolved` | ninguna de las anteriores |

### Reglas de precedencia

- Varios managers explícitos en el mismo turno → **todos** son `manager_directo`.
- Con manager de turno explícito, **no** se agregan managers de ubicación, cliente ni unidad.
- La audiencia **nunca** se amplía por jerarquía organizacional.
- Mayor nivel jerárquico no convierte a nadie en afectado.

### Escalamiento controlado (nivel 6)

Sin manager resoluble: no notificar a todos los managers; registrar
`manager_resolution_status = unresolved`; emitir alerta interna de configuración a
administradores autorizados; mantener el cambio en auditoría; **continuar** notificando
a trabajadores y supervisores claramente afectados.

### Supervisor ≠ Manager directo

- **Supervisor:** coordina la ejecución inmediata; recibe cambios de personal, hora,
  dirección, transporte, punto de encuentro y cancelación.
- **Manager directo:** responsabilidad operacional o decisoria; recibe solo lo relevante
  a esa responsabilidad.
- Misma persona en ambos roles → **una sola comunicación consolidada** (dedupe).

### Requisitos de evidencia (por resolución)

`manager_id`, `relationship_type`, `source_object_id`, `resolution_priority`,
`resolved_at`, `reason`, `whether_notification_was_required`, `deduplication_key`.

### Reglas de seguridad

1. Nunca resolver audiencia solo por el rol `manager`.
2. Nunca notificar a todos los managers del tenant.
3. Nunca inferir responsabilidad por haber creado o editado el turno.
4. El autor del cambio no es destinatario automático.
5. Auditar no implica notificar.
6. La ausencia de manager no bloquea comunicaciones críticas a trabajadores.
7. Las relaciones ambiguas se registran, no se adivinan.
8. Duplicados por múltiples roles → una sola comunicación.

### Casos de aceptación

| Caso | Escenario | Resultado esperado |
| --- | --- | --- |
| CA-D3-01 | Turno con manager explícito | solo ese manager |
| CA-D3-02 | Sin manager de turno, con manager de ubicación | manager de ubicación |
| CA-D3-03 | Manager de turno + de ubicación | solo el de turno |
| CA-D3-04 | Dos managers explícitos del turno | ambos |
| CA-D3-05 | 5 managers en la compañía, ninguno con relación | ninguno; `unresolved` |
| CA-D3-06 | Autor = admin global sin relación | no es manager directo |
| CA-D3-07 | Supervisor y manager son la misma persona | una comunicación consolidada |
| CA-D3-08 | Reemplazo de trabajador | saliente, entrante, supervisor y manager aplicables |
| CA-D3-09 | Nota interna sin impacto operacional | ningún trabajador recibe nada |
| CA-D3-10 | Sin manager resoluble y cambia la dirección | trabajadores notificados; manager `unresolved` |

---

*Fin del dossier de decisiones. D3 cerrada. No existe código asociado.*

