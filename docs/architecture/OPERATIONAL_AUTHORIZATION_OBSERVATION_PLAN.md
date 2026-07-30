# OAI — PLAN DE OBSERVATION MODE (F1)

**Versión:** 1.0
**Fecha:** 2026-07-30
**Estado:** 🟡 Plan. No autorizado para implementación.
**Precedente:** `CHANGE_INTELLIGENCE_F1_OBSERVATION_MODE` — mismo patrón, mismo rigor.

---

## 1. Objetivo

> Comparar la decisión que el sistema **habría tomado** con la decisión que el
> coordinador **realmente tomó**, sin bloquear, sin modificar y sin comunicar
> nada.

Observation Mode no valida software. Valida **el modelo conceptual** antes de
construirlo. Su producto no es código: son hipótesis calibradas.

**Premisa de diseño:** hoy la operación ya toma la decisión correcta fuera del
sistema. Observation Mode existe para aprender esa decisión, no para corregirla.

---

## 2. Prohibiciones absolutas

Deben ser imposibles **por arquitectura**, no por disciplina.

Observation Mode **no podrá**:

1. Bloquear ni permitir una asignación.
2. Aprobar, rechazar o modificar un documento.
3. Cambiar el readiness de ninguna persona.
4. Crear compromisos reales.
5. Enviar notificaciones por ningún canal.
6. Tocar payroll de ninguna forma.
7. Interpretar requisitos legales automáticamente.
8. Escribir en ninguna tabla operacional.
9. Ser visible para coordinadores o trabajadores (evitaría contaminar la
   decisión humana observada).

**Invariante de aislamiento:** `observation_only = true`, sin excepción y sin
ruta de configuración que lo desactive parcialmente.

**Riesgo de contaminación:** si el observado sabe que se le observa, el dato
pierde valor. La visibilidad se restringe a staff de plataforma autorizado.

---

## 3. Escenarios a observar

| # | Escenario | Qué revela | Prioridad |
|---|---|---|---|
| S1 | Sistema habría bloqueado; el coordinador asignó | **Falso bloqueo.** El dato más valioso del ejercicio | 🔴 P0 |
| S2 | Sistema no habría bloqueado; el humano rechazó | Requisito real no modelado | 🔴 P0 |
| S3 | Asignación con evidencia pendiente | Frecuencia del caso condicional | 🔴 P0 |
| S4 | Excepción verbal | Existencia y peso de la evidencia declarativa | 🟠 P1 |
| S5 | Documento cargado después del turno | Confirma la separación de tiempos (OA-P8) | 🔴 P0 |
| S6 | Brecha nunca cerrada | Tasa real de incumplimiento → calibra consecuencias | 🔴 P0 |
| S7 | Autorización revocada de facto (asignación cancelada por criterio) | Disparadores reales de revocación | 🟠 P1 |
| S8 | Hard stop respetado | Confirma que la clasificación L0/L1 es correcta | 🔴 P0 |
| S9 | Hard stop potencialmente atravesado | **Riesgo real.** Puede indicar mala clasificación o riesgo genuino | 🔴 P0 |
| S10 | Diferencias entre compañías ante la misma brecha | Valida DEC-OAI-J (variabilidad) | 🟠 P1 |
| S11 | Coincidencia sistema/humano | Línea base: si es >95%, el problema es menor de lo supuesto | 🟡 P2 |

**Nota sobre S9:** un hard stop aparentemente atravesado tiene dos lecturas
opuestas —clasificación equivocada, o riesgo real materializado— y **solo un
humano competente puede distinguirlas**. OAI nunca concluye por su cuenta en
este escenario; lo marca para revisión.

---

## 4. Hipótesis que debe producir

Observation Mode no produce veredictos: produce **hipótesis con evidencia y
frecuencia**.

Ejemplos del formato esperado:

- "El sistema habría bloqueado; el coordinador asignó. Frecuencia: N casos en la
  ventana. Brecha dominante: W-4."
- "La evidencia faltante se completó antes del payroll en X% de los casos."
- "La excepción sobre <brecha> se repitió 3 veces con el mismo cliente."
- "La política actual parece demasiado restrictiva para <rol> en <cliente>."
- "Una decisión humana contradijo un hard stop configurado — requiere revisión
  humana urgente."
- "La compañía A tolera <brecha>; la compañía B no. La política debe ser
  configurable por compañía."

**Toda hipótesis debe declarar:** enunciado, frecuencia, contexto, evidencia de
soporte y qué decisión de F0 ayudaría a resolver.

---

## 5. Auditoría conceptual del modelo actual

No es un inventario técnico ni una propuesta de migración. Es una evaluación de
**qué se puede observar hoy y con qué confianza**.

| Concepto | Disponibilidad | Confianza | Nota |
|---|---|---|---|
| Documentos (existencia) | ✅ Disponible | Alta | Base sólida |
| Tipos de documento | ✅ Disponible | Alta | Categorías definidas |
| Estado de revisión | ✅ Disponible | Alta | Aprobado / pendiente |
| Expiración de documentos | 🟡 Parcial | **Media** | No todos los tipos la registran de forma consistente |
| Worker readiness | ⚠️ Disponible pero **no confiable** | **Baja** | Estado escalar por persona; ya se detectó desincronización con la realidad. **No usar como verdad** |
| Asignaciones | ✅ Disponible | Alta | Núcleo de la observación |
| Actor que asignó | 🟡 Parcial | Media | Presente en auditoría; puede faltar en flujos masivos |
| Fechas y contexto temporal | ✅ Disponible | Alta | — |
| Overrides / excepciones | ❌ **Ausente** | — | **Brecha crítica.** No existe el concepto. Solo inferible por contradicción |
| Payroll readiness | 🟡 Parcial | Media | Existe indirectamente; no está separado del readiness operativo |
| Historial de trabajo | ✅ Disponible | Alta | Base de evidencia inferida |
| Calificaciones / reputación | ✅ Disponible | Media | Cobertura desigual |
| Relación con supervisor | ❌ **Ausente** | — | **Brecha crítica.** La evidencia relacional del caso real es hoy invisible |
| Cliente | ✅ Disponible | Alta | — |
| Ubicación | ✅ Disponible | Alta | — |
| Rol / tipo de trabajo | 🟡 Parcial | Media | Existe; granularidad variable |
| Clasificación de hard stops | ❌ **Ausente** | — | **Bloqueante.** Requiere producción humana (DEC-OAI-D) |

### 5.1 Clasificación

- **Evidencia disponible y confiable:** documentos, asignaciones, fechas,
  cliente, ubicación, historial de trabajo.
- **Evidencia parcial:** expiración, actor que asignó, payroll readiness, rol.
- **Evidencia ausente (brechas críticas):** overrides, relación con supervisor,
  clasificación de hard stops.
- **Campos no confiables:** `worker readiness` escalar — usable como *señal del
  sistema actual*, jamás como verdad organizacional.

### 5.2 Inferencias prohibidas

Explícitamente vedadas durante Observation:

1. **Inferir intención.** Que un coordinador asignara pese a una brecha no prueba
   que aceptara el riesgo conscientemente. Pudo no verlo.
2. **Inferir autoridad.** Que alguien decidiera no significa que tuviera
   facultad para hacerlo.
3. **Inferir requisitos legales** desde ubicación, nombre de cliente o
   histórico.
4. **Inferir suficiencia** desde un caso aislado. Se requiere frecuencia.
5. **Inferir causalidad** entre una brecha y un incidente sin evidencia directa.
6. **Inferir promesa verbal.** Si no está registrada, no ocurrió a efectos de
   datos — su ausencia es en sí un hallazgo.

### 5.3 Consecuencia de las brechas críticas

Las tres brechas críticas (overrides, relación con supervisor, hard stops) son
precisamente **los conceptos que OAI introduce**. Su ausencia es esperada y
confirma el diagnóstico del discovery. Observation Mode debe operar sin ellas,
infiriendo el override **por contradicción** (el sistema habría bloqueado y sin
embargo hubo asignación) y registrando su ausencia como hallazgo.

---

## 6. Registro formal de las siete preguntas abiertas

### Q1 · ¿De qué se deriva la autoridad para aceptar riesgo? ¿Es delegable?

- **Por qué importa:** sin ella, cualquier modelo de excepción será evadido.
- **Decisión que bloquea:** DEC-OAI-C (completa).
- **Evidencia requerida:** quién concede excepciones hoy, para qué brechas, con
  qué frecuencia y con qué resultado.
- **Experimento:** S1 + S4 — registrar el actor de cada override inferido y su
  rol formal.
- **Responsable sugerido:** Owner + liderazgo operativo.
- **Criterio de resolución:** ≥80% de los overrides observados atribuibles a un
  patrón de rol/severidad enunciable.

### Q2 · ¿Qué tan estable es el umbral de suficiencia entre clientes y jurisdicciones?

- **Por qué importa:** determina si la política es global o en cascada.
- **Decisión que bloquea:** DEC-OAI-J.
- **Evidencia requerida:** mismos casos de brecha resueltos de forma distinta
  según cliente, ubicación o compañía.
- **Experimento:** S10 — comparación cruzada de la misma brecha entre contextos.
- **Responsable sugerido:** gestión de cuentas + operaciones.
- **Criterio de resolución:** identificar al menos qué nivel de la cascada
  concentra la variabilidad.

### Q3 · ¿Cuánta evidencia histórica sustituye legítimamente a la documental?

- **Por qué importa:** define el peso admisible de la evidencia inferida.
- **Decisión que bloquea:** DEC-OAI-I (calibración, no estructura).
- **Evidencia requerida:** correlación entre historial previo y tolerancia
  observada a la brecha.
- **Experimento:** S1 segmentado por antigüedad y volumen de turnos previos.
- **Responsable sugerido:** operaciones + gobierno.
- **Criterio de resolución:** señal clara de que el historial cambia la decisión
  humana, o refutación.
- **Nota:** la respuesta puede ser legítimamente "nunca la sustituye, solo la
  modula". Ese resultado también resuelve la pregunta.

### Q4 · ¿La evidencia relacional es una fuente propia o aceptación de riesgo con otro nombre?

- **Por qué importa:** decide si el supervisor **aporta evidencia** o **asume
  riesgo**. Son cosas distintas con responsabilidades distintas.
- **Decisión que bloquea:** DEC-OAI-C e DEC-OAI-I conjuntamente.
- **Evidencia requerida:** casos donde un tercero responde por el trabajador, y
  qué ocurrió después.
- **Experimento:** S4 — registro cualitativo de excepciones verbales.
- **Responsable sugerido:** operaciones.
- **Criterio de resolución:** distinguir si el supervisor aporta información
  nueva o simplemente acepta la consecuencia.

### Q5 · ¿Cuál es el volumen real de falsos bloqueos?

- **Por qué importa:** **sin este número no hay dimensionamiento del problema
  ni justificación para construir OAI.**
- **Decisión que bloquea:** el go/no-go de F2 completo.
- **Evidencia requerida:** conteo de S1 sobre el total de asignaciones.
- **Experimento:** S1 + S11 (línea base de coincidencia).
- **Responsable sugerido:** staff de plataforma.
- **Criterio de resolución:** tasa medida sobre una ventana estadísticamente
  significativa.
- **Umbral orientativo:** por debajo del 2% de asignaciones, OAI no se justifica
  como capacidad; sería suficiente corregir la separación de tiempos (OA-P8).

### Q6 · ¿Existen compromisos que la operación ya gestiona informalmente?

- **Por qué importa:** si ya existen, OAI los formaliza; si no, los introduce —
  y eso es un cambio cultural, no técnico.
- **Decisión que bloquea:** DEC-OAI-E (política de asignación condicional).
- **Evidencia requerida:** casos donde alguien hizo seguimiento a una brecha
  fuera del sistema.
- **Experimento:** S3 + S6 — seguir la brecha hasta su cierre o incumplimiento.
- **Responsable sugerido:** operaciones.
- **Criterio de resolución:** existencia demostrada de seguimiento informal, y
  su tasa de éxito.

### Q7 · ¿Cuál es la consecuencia real, hoy, de un W-4 no entregado al cierre?

- **Por qué importa:** es el caso canónico. Si la consecuencia real es
  inexistente, el bloqueo actual es puro coste sin beneficio.
- **Decisión que bloquea:** DEC-OAI-H y el diseño de `consequence_if_unmet`.
- **Evidencia requerida:** qué ocurrió en periodos previos con esa brecha.
- **Experimento:** S5 + S6 sobre al menos un ciclo completo de payroll.
- **Responsable sugerido:** finanzas + payroll.
- **Criterio de resolución:** consecuencia real documentada y declarada como
  política.

---

## 7. Relación con la teoría general

| Concepto | Aporte de OAI |
|---|---|
| **Causalidad organizacional** | Escribe la cadena hoy invisible: brecha → decisión → autoridad → compromiso → resultado. Y captura la causa de las **no-acciones**: el turno que no se cubrió por un bloqueo injustificado |
| **Suficiencia operacional** | Convierte un principio abstracto en un umbral declarado, versionado y medible |
| **Gestión de riesgo** | Traslada el riesgo de invisible a explícito, nombrado, con plazo y consecuencia |
| **Evidencia** | Amplía qué cuenta como evidencia (documental, histórica, relacional, declarativa, externa) sin degradar su exigencia |
| **Autoridad** | Hace de la autoridad un objeto de primera clase: quién puede asumir qué riesgo, y qué tan bien lo hace |
| **Compromiso** | Introduce el objeto bilateral que reparte responsabilidad, que hoy no existe en ningún sistema |
| **Consecuencia** | Cierra el bucle: declarada antes, aplicada al vencer, registrada siempre |
| **Aprendizaje organizacional** | El incumplimiento y la excepción repetida se convierten en calibración de política, no en anécdota |
| **Software como representación de la organización** | El sistema deja de modelar un formulario y pasa a modelar cómo la organización realmente decide |
| **Juicio humano amplificado** | El sistema no decide: elimina el trabajo previo a la decisión y la hace barata, informada, rápida y trazable |

### 7.1 Principios a incorporar a los atlas

**Organizational Knowledge Atlas**
- La evidencia tiene grados de calidad, y el grado es parte de toda decisión.
- El incumplimiento es conocimiento, no fallo administrativo.
- La excepción repetida es una hipótesis sobre la política, nunca una
  autorización tácita.
- El falso bloqueo es un daño medible, con el mismo rigor que el riesgo asumido.

**Capability Atlas (CAP-001)**
- Registrar `D17 — Operational Authorization` como dominio **Core**.
- Degradar explícitamente `D14 — Documents & Compliance` a **proveedor de
  evidencia**, no a autoridad de readiness.
- Resolver la ambigüedad declarada en CAP-001 §5 sobre la fuente canónica de
  readiness: es OAI, y es contextual.
- Registrar OAI como segunda capacidad-motor tras CI, con frontera
  decide/comunica documentada.

**Constitución de Stafly**
- *La organización administra capacidad de operar, no documentos.*
- *El sistema calcula el riesgo; la organización lo acepta.*
- *Ningún bloqueo sin causa, costo y camino.*
- *Toda excepción se convierte en compromiso.*
- *Existe un piso innegociable que ninguna autoridad atraviesa.*

---

## 8. Estructura de la ventana de observación

| Aspecto | Definición |
|---|---|
| **Duración mínima** | Un ciclo completo de payroll — imprescindible para observar la clase diferida (Q7) |
| **Alcance inicial** | Compañía demo o sandbox; **ninguna compañía productiva** sin evaluación posterior |
| **Dominio** | Scheduling / asignación únicamente |
| **Visibilidad** | Solo staff de plataforma en allowlist explícita |
| **Datos** | Sin PII; identificadores y clasificaciones, no nombres ni contenidos de documentos |
| **Retención** | Detalle acotado; agregados con retención mayor. Espejo del criterio de CI F1.2 |
| **Responsable** | Persona nombrada, con fecha de inicio y de fin declaradas |

---

## 9. Criterio de éxito de F1

F1 es exitoso si al cerrarse se puede responder:

1. ¿Cuál es la tasa real de falso bloqueo? (Q5)
2. ¿Quién decide de facto? (Q1)
3. ¿La suficiencia varía entre contextos, y en qué nivel de la cascada? (Q2)
4. ¿Se cierran las brechas post-asignación, y en qué plazo? (Q6)
5. ¿Cuál es la consecuencia real del caso canónico W-4? (Q7)
6. ¿Se atravesó algún hard stop, y por qué? (S9)

F1 **no** es exitoso si produce software funcional pero ninguna de estas
respuestas.

---

## 10. Riesgos del propio Observation Mode

| Riesgo | Mitigación |
|---|---|
| Contaminación del observado | Invisibilidad total para coordinadores y trabajadores |
| Falsos positivos por `readiness` no confiable | No usarlo como verdad; recomputar la señal del sistema de forma determinista |
| Sesgo de la ventana | Cubrir al menos un ciclo de payroll y varias compañías |
| Tasa alta de `unknown` | Es un criterio de invalidez: por encima de un umbral, la ventana no concluye |
| Deriva hacia producto | F1 no entrega funcionalidad de usuario. Su entregable es un informe |
| Observar la política equivocada | La clasificación L0–L5 debe firmarla un humano **antes** de abrir la ventana |
