# OAI F0 — DECISIONES ARQUITECTÓNICAS

**Versión:** 1.0
**Fecha:** 2026-07-30
**Estado:** 🟡 Propuestas. Requieren aprobación explícita.
**Alcance:** Decisiones difíciles de revertir. No incluye decisiones de implementación.

Convención de reversibilidad:
**R1** trivial · **R2** costosa pero acotada · **R3** requiere remodelado ·
**R4** prácticamente irreversible (contamina datos históricos y decisiones pasadas).

---

## Índice de decisiones

| ID | Decisión | Reversibilidad | ¿Bloquea Observation Mode? |
|---|---|---|---|
| DEC-OAI-A | Alcance de la autorización | **R4** | ✅ Sí |
| DEC-OAI-B | Naturaleza del motor (reglas / IA / híbrido) | R3 | ✅ Sí (parcial) |
| DEC-OAI-C | Autoridad para excepciones | R3 | ⚠️ Solo para observar |
| DEC-OAI-D | Representación del piso legal | **R4** | ✅ Sí |
| DEC-OAI-E | Asignar antes de completar evidencia | R2 | ❌ No |
| DEC-OAI-F | Modelo de revocación | R3 | ❌ No |
| DEC-OAI-G | Excepción vs. precedente | R2 | ❌ No |
| DEC-OAI-H | Frontera con Payroll y Compliance | R3 | ❌ No |
| DEC-OAI-I | Taxonomía de calidad de evidencia | **R4** | ✅ Sí |
| DEC-OAI-J | Variabilidad por compañía/cliente/ubicación/rol | **R4** | ✅ Sí |

---

## DEC-OAI-A · ¿La autorización es global para la persona o contextual por operación?

**Opciones**

| # | Opción | Ventajas | Riesgos |
|---|---|---|---|
| A1 | Global por persona (estado único) | Simple, barato, ya existe (`profile_status`) | Reproduce el bug raíz; imposible modelar "ready para cocina, no para conducir"; viola OA-P3/P4 |
| A2 | Contextual por evaluación | Refleja la realidad; permite suficiencia diferenciada | Más caro; requiere contexto completo en cada consulta; sin estado "consultable" barato |
| A3 | Híbrido: base de persona + evaluación contextual | Consultas rápidas para listados; precisión donde importa | Riesgo de que la base se use como veredicto por atajo |

**Reversibilidad:** R4. El alcance del veredicto contamina cada decisión
registrada. Migrar de global a contextual invalida el histórico.

**Recomendación: A3 con salvaguarda dura.**
La capa base (persona) es **exclusivamente informativa y no autorizante**: puede
alimentar listados y priorización, pero jamás producir un veredicto del catálogo.
Solo una evaluación con contexto completo produce autorización. Sin la
salvaguarda explícita, A3 degenera en A1.

**¿Bloquea Observation Mode?** Sí. Observation debe registrar contexto completo
desde el primer día; sin él, los datos observados no sirven para calibrar.

**Evidencia necesaria:** distribución real de casos donde la misma persona
recibiría veredictos distintos según contexto. Si es marginal (<5%), A1 sería
defendible; el discovery sugiere que no lo es.

---

## DEC-OAI-B · ¿Determinista por reglas, asistido por IA o híbrido?

**Opciones**

| # | Opción | Ventajas | Riesgos |
|---|---|---|---|
| B1 | Determinista puro | Explicable, auditable, reproducible, defendible ante auditoría | Rígido; no captura matiz; requiere política bien declarada |
| B2 | IA decide | Captura matiz | Viola OA-P15 y OA-P16; indefendible legalmente; no reproducible |
| B3 | Reglas deciden · IA asiste en extracción y redacción | Núcleo auditable; IA en tareas donde el error es recuperable | Riesgo de deriva de alcance de la IA |

**Reversibilidad:** R3. Cambiar el motor obliga a reevaluar decisiones históricas.

**Recomendación: B3, con frontera nombrada.**
La IA queda confinada a: extracción de datos de documentos, normalización de
texto libre, redacción de explicaciones y detección de patrones para *sugerir*
revisión de política. **Nunca** produce ni modifica un veredicto, una severidad
ni un plazo.

**Regla de oro:** todo veredicto debe ser reproducible sin IA. Si al desactivar
la IA el veredicto cambia, el diseño viola OA-P15.

**¿Bloquea Observation Mode?** Parcialmente: Observation debe ser 100%
determinista para que la comparación con la decisión humana tenga valor.

**Evidencia necesaria:** ninguna adicional. Es una decisión de principio,
derivada de OA-P15/P16.

---

## DEC-OAI-C · ¿Quién posee autoridad para conceder excepciones?

**Opciones**

| # | Opción | Ventajas | Riesgos |
|---|---|---|---|
| C1 | Por rol fijo (admin/owner) | Simple | No refleja la realidad: el coordinador ya decide de facto |
| C2 | Por severidad del riesgo (autoridad proporcional) | Alineado con OA-P14; escala | Requiere una escala de severidad acordada |
| C3 | Por dominio (cliente/ubicación asignados) | Refleja responsabilidad operativa | No cubre riesgo transversal (legal, financiero) |
| C4 | Matriz severidad × dominio | Preciso | Complejo de configurar y de explicar |

**Reversibilidad:** R3. Cambiar quién pudo decidir invalida la validez de
decisiones pasadas.

**Recomendación: C2 como eje principal, con C3 como restricción de alcance.**
La severidad define **el nivel** de autoridad; el dominio define **quién dentro
de ese nivel**. Se difiere la matriz completa (C4) hasta tener datos de
Observation.

**¿Bloquea Observation Mode?** No para decidir, **sí para observar**: Observation
debe registrar *quién decidió de facto* aunque no exista aún un modelo de
autoridad. Ese registro **es** la evidencia para decidir C.

**Evidencia necesaria:** inventario de quién concede excepciones hoy, con qué
frecuencia, para qué tipo de brecha y con qué resultado.

---

## DEC-OAI-D · ¿Cómo se representa el piso legal innegociable?

**Opciones**

| # | Opción | Ventajas | Riesgos |
|---|---|---|---|
| D1 | Flag booleano en el requisito | Simple | Sin trazabilidad de origen ni versión; viola OA-P12 |
| D2 | Categoría de regla con origen, versión, vigencia y jurisdicción | Trazable, auditable, versionable | Más configuración |
| D3 | Motor legal separado | Máximo aislamiento | Sobreingeniería en F0; OAI no debe interpretar leyes |

**Reversibilidad:** R4. Un hard stop mal representado produce decisiones
históricas indefendibles ante auditoría.

**Recomendación: D2**, con la taxonomía de seis niveles como estructura
obligatoria (ver §Taxonomía). Cada regla declara: origen, autoridad que la
aprobó, versión, vigencia, jurisdicción y nivel.

**¿Bloquea Observation Mode?** Sí. Sin representar hard stops no se pueden
observar los escenarios "hard stop respetado" y "hard stop potencialmente
ignorado" — que son los de mayor valor de riesgo.

**Evidencia necesaria:** listado de requisitos actuales clasificados por nivel,
producido y firmado por un humano con autoridad. No inferible.

### Taxonomía conceptual del piso (no jurídica)

| Nivel | Nombre | Definición | ¿Negociable? | ¿Quién lo declara? |
|---|---|---|---|---|
| L0 | **Legal hard stop** | La ley prohíbe que esta persona ejecute este trabajo | ❌ Nunca | Política legal aprobada, con jurisdicción y versión |
| L1 | **Company policy hard stop** | La compañía prohíbe absolutamente | ❌ No por operación | Owner / gobierno de la compañía |
| L2 | **Client requirement** | El cliente lo exige contractualmente | 🟡 Solo con acuerdo del cliente | Contrato / gestor de cuenta |
| L3 | **Operational preference** | La operación lo prefiere | ✅ Sí | Coordinación operativa |
| L4 | **Missing but deferrable evidence** | Falta, pero su plazo real es posterior al turno | ✅ Sí, con compromiso | Política de suficiencia |
| L5 | **Contextual risk signal** | Señal que modula el riesgo sin exigir nada | ✅ Informativa | Derivada de evidencia histórica |

**Reglas invariantes de la taxonomía**
1. OAI no interpreta leyes; consume L0 como configuración aprobada.
2. Ninguna recomendación, autoridad ni compromiso puede atravesar un L0/L1
   vigente.
3. Origen y versión de cada regla son obligatorios y trazables.
4. Las diferencias jurisdiccionales requieren configuración explícita; jamás
   inferencia por dirección, nombre o histórico.
5. Nada en esta taxonomía constituye asesoría legal.

---

## DEC-OAI-E · ¿Una autorización condicional permite asignar primero y completar evidencia después?

**Opciones**

| # | Opción | Ventajas | Riesgos |
|---|---|---|---|
| E1 | No — evidencia siempre antes | "Seguro" en apariencia | Es el estado actual; produce falsos bloqueos y decisiones fuera del sistema |
| E2 | Sí, sin condición | Máxima agilidad | Riesgo huérfano; reproduce la informalidad actual pero dentro del sistema |
| E3 | Sí, siempre con Compromiso Operacional | Agilidad + trazabilidad + consecuencia | Requiere vigilancia real de compromisos |

**Reversibilidad:** R2. Es una decisión de política, no de modelo.

**Recomendación: E3, sin excepciones.** Es la aplicación directa de OA-P19/P20.
E2 queda prohibida por Charter: autorizar con brecha y sin compromiso es
exactamente el problema que OAI existe para resolver.

**Restricción dura:** E3 nunca aplica sobre L0/L1.

**¿Bloquea Observation Mode?** No. Observation solo registra que ocurrió.

**Evidencia necesaria:** tasa real de cierre de brechas post-asignación. Si hoy
la mayoría se cierra a tiempo, E3 es de bajo riesgo; si no, la consecuencia debe
endurecerse.

---

## DEC-OAI-F · ¿Cómo se revoca una autorización?

**Opciones**

| # | Opción | Ventajas | Riesgos |
|---|---|---|---|
| F1 | Manual únicamente | Control humano total | No escala; vencimientos pasan desapercibidos |
| F2 | Automática por vencimiento de evidencia o compromiso | Consistente | Revocaciones sorpresa a mitad de operación |
| F3 | Automática + humana, con efecto **prospectivo** por defecto | Consistente y operable | Requiere definir qué ocurre con trabajo ya ejecutado |

**Reversibilidad:** R3.

**Recomendación: F3 con efecto prospectivo.**
Una revocación afecta asignaciones **futuras** por defecto. El trabajo ya
ejecutado nunca se "desautoriza" retroactivamente — se registra como ejecutado
bajo una autorización que después se revocó. Revocar con efecto inmediato sobre
un turno en curso requiere acto humano explícito.

Disparadores de revocación: vencimiento de evidencia, incumplimiento de
compromiso, cambio de contexto (rol/cliente/ubicación), cambio de política,
decisión humana, hard stop sobrevenido.

**Efecto obligatorio:** toda revocación emite evento para CI (OA-P25) y anula
la reutilización silenciosa (OA-P22).

**¿Bloquea Observation Mode?** No, pero Observation debe detectar revocaciones
de facto (asignaciones canceladas por criterio humano).

---

## DEC-OAI-G · ¿Cómo se evita que una excepción se convierta en precedente automático?

**Riesgo central:** la excepción repetida se normaliza en silencio y la política
real deja de ser la política declarada — sin que nadie lo decida.

**Opciones**

| # | Opción | Ventajas | Riesgos |
|---|---|---|---|
| G1 | Cada excepción es independiente y de un solo uso | Sin deriva | Fricción repetida; el coordinador la evade |
| G2 | Excepción con alcance y vigencia declarados | Equilibrio | Requiere declarar alcance cada vez |
| G3 | Excepción que se auto-renueva | Cómoda | Prohibida: viola OA-P21/P22 |

**Reversibilidad:** R2.

**Recomendación: G2 + señal de patrón.**
Cada excepción declara su alcance (un turno, un rango, un cliente) y su
vigencia. Nunca se auto-renueva. Cuando una misma brecha se excepciona **N veces
en una ventana**, OAI no la automatiza: **emite una señal de revisión de
política** dirigida a gobierno. La repetición es una hipótesis sobre la política,
no una autorización tácita.

**Principio derivado:** *la repetición nunca crea derecho; crea una pregunta.*

**¿Bloquea Observation Mode?** No — al contrario, detectar repetición es uno de
los productos esperados de Observation.

---

## DEC-OAI-H · ¿Cómo interactúa OAI con Payroll y Compliance sin convertirse en sistema legal?

**Recomendación (composición de tres reglas):**

1. **OAI señala, no ejecuta.** Emite `worker.payroll_enablement_changed`. Payroll
   decide qué hace con la señal. OAI nunca retiene ni calcula un pago.
2. **OAI consume compliance, no lo produce.** Los requisitos regulatorios entran
   como política L0 aprobada, versionada y con jurisdicción. OAI no interpreta.
3. **Separación de tiempos obligatoria (OA-P8).** El requisito de payroll ancla
   su plazo al cierre del periodo, no al turno. Esto por sí solo elimina la clase
   de falso bloqueo del caso W-4.

**Riesgo si se ignora:** OAI se convierte en un sistema legal de facto, con
responsabilidad que la compañía no puede sostener y sin la competencia para
sostenerla.

**Reversibilidad:** R3. **¿Bloquea Observation Mode?** No.

---

## DEC-OAI-I · Taxonomía de calidad de evidencia

**Recomendación:** cuatro grados de calidad, ortogonales al tipo de fuente.

| Grado | Definición | Ejemplo | Uso admitido |
|---|---|---|---|
| **Verificada** | Confirmada contra fuente autorizada o revisada por humano competente | Licencia validada, documento aprobado | Puede satisfacer cualquier nivel, incluido L0 si la política lo permite |
| **Declarativa** | Afirmada por la persona o por un tercero responsable, sin confirmar | "Ya renové la licencia"; el supervisor responde por el trabajador | **Nunca** satisface L0/L1. Puede sostener autorización condicional con compromiso |
| **Inferida** | Derivada de comportamiento observado | 40 turnos previos sin incidentes | Solo modula riesgo (L5). Nunca sustituye un requisito |
| **Expirada** | Fue verificada, ya no está vigente | Certificación vencida | Se trata como ausente, conservando su historia |

**Reglas invariantes**
1. La calidad de la evidencia es **siempre** parte de la explicación del veredicto.
2. Evidencia declarativa **siempre** genera compromiso si sostiene una autorización.
3. Evidencia inferida **nunca** es condición suficiente por sí sola.
4. Evidencia expirada nunca se degrada a "inexistente": su historia informa el
   riesgo y la probabilidad de cierre.

**Reversibilidad:** R4 — el grado se graba en cada decisión histórica.
**¿Bloquea Observation Mode?** Sí: Observation debe clasificar desde el día uno.

---

## DEC-OAI-J · ¿Cómo se modelan diferencias entre compañías, clientes, ubicaciones y roles?

**Opciones**

| # | Opción | Ventajas | Riesgos |
|---|---|---|---|
| J1 | Configuración plana por compañía | Simple | No captura exigencias por cliente ni por rol |
| J2 | Herencia en cascada con override explícito | Refleja la realidad contractual | Requiere resolución de conflictos clara |
| J3 | Reglas independientes por combinación | Máxima precisión | Explosión combinatoria, inmantenible |

**Reversibilidad:** R4. La forma de la política determina cada evaluación.

**Recomendación: J2, con precedencia estricta y sin mezcla de niveles**
(espejo del criterio D3/P17 de Change Intelligence):

```text
Jurisdicción → Compañía → Cliente → Ubicación → Rol → Tipo de trabajo
```

**Reglas de resolución**
1. Un nivel más específico puede **añadir** exigencia; nunca **retirar** un hard
   stop de un nivel superior.
2. La regla efectiva declara siempre de qué nivel proviene (explicabilidad,
   OA-P16).
3. Sin mezcla de niveles: se resuelve por precedencia, no por combinación.

**¿Bloquea Observation Mode?** Sí, en su forma mínima: Observation debe registrar
compañía, cliente, ubicación y rol para poder detectar diferencias entre ellas.

---

## Cierre F0

### Decisiones que BLOQUEAN Observation Mode

| ID | Motivo | Mínimo requerido para desbloquear |
|---|---|---|
| DEC-OAI-A | El contexto debe registrarse desde el día uno | Aprobar A3 con salvaguarda |
| DEC-OAI-B | Observation debe ser determinista | Aprobar B3 |
| DEC-OAI-D | Sin hard stops no se observan los escenarios críticos | Clasificación L0–L5 firmada por un humano con autoridad |
| DEC-OAI-I | El grado de evidencia se graba en cada observación | Aprobar los cuatro grados |
| DEC-OAI-J | Sin dimensiones no hay comparación entre compañías | Aprobar la cascada y registrar las cinco dimensiones |
| DEC-OAI-C (parcial) | Debe registrarse *quién decidió de facto* | Solo capacidad de registro, no modelo de autoridad |

### Decisiones que pueden diferirse

- **DEC-OAI-E** — política de asignación condicional: se decide con datos de
  Observation.
- **DEC-OAI-F** — modelo de revocación: no aplica en modo observación.
- **DEC-OAI-G** — umbral N de repetición: se calibra con datos reales.
- **DEC-OAI-H** — integración con Payroll: F2 o posterior.
- **DEC-OAI-C (completa)** — matriz de autoridad: requiere el inventario que
  produce Observation.

### Riesgos de automatización prematura

1. **Formalizar la política equivocada.** Codificar hoy los umbrales actuales
   perpetuaría exactamente los falsos bloqueos que motivaron el discovery.
2. **Autoridad inventada.** Definir quién puede excepcionar sin saber quién lo
   hace hoy produce un modelo que la operación evadirá.
3. **Hard stops por inferencia.** Clasificar como legal algo que solo es
   preferencia operativa crea rigidez indefendible; el error inverso crea riesgo
   real. Ambos son graves y solo un humano competente puede evitarlos.
4. **Compromisos sin vigilancia.** Habilitar autorización condicional antes de
   tener seguimiento real crea riesgo huérfano a escala — peor que el estado
   actual.
5. **IA en el veredicto.** Cualquier atajo hacia B2 destruye la defendibilidad
   de todo el sistema, retroactivamente.

### Recomendación para OAI F1

**F1 = Observation Mode puro**, con el precedente exacto de Change Intelligence:

1. Motor determinista aislado (OA-P27), sin efectos.
2. Evaluación en sombra sobre asignaciones reales, comparando veredicto simulado
   contra decisión humana real.
3. Cero bloqueo, cero escritura operacional, cero notificación, cero compromiso
   real.
4. Duración mínima sugerida: una ventana que cubra al menos un ciclo completo de
   payroll, para observar la clase diferida (W-4).
5. Producto esperado: hipótesis calibradas, no software de producto.

### Criterio explícito de GO / NO-GO para F1

**GO** si y solo si se cumplen las seis condiciones:

1. DEC-OAI-A, B, D, I, J aprobadas formalmente.
2. Clasificación L0–L5 de requisitos actuales firmada por un humano con
   autoridad nombrado.
3. Capacidad verificada de registrar contexto completo (persona, operación, rol,
   lugar, fecha, tipo de trabajo) en cada observación.
4. Garantía **estructural** —no por disciplina— de cero efectos: sin bloqueo, sin
   escritura operacional, sin notificación, sin compromiso real.
5. Acceso a la evidencia observada restringido a staff de plataforma autorizado.
6. Ventana con fecha de inicio, fecha de fin y responsable nombrado.

**NO-GO** ante cualquiera de estas señales:

- Falta la clasificación de hard stops o se pretende inferirla.
- Se propone que Observation "solo bloquee en casos obvios".
- Se propone IA en la ruta del veredicto.
- No hay responsable humano nombrado para la ventana.
- No se puede registrar contexto completo en una proporción material de los casos.
