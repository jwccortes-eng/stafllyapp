# DISCOVERY — Operational Authorization Intelligence (OAI)

**Fecha:** 2026-07-30
**Estado:** 🔍 Discovery. Sin implementación autorizada.
**Tipo:** Documento de arquitectura organizacional (no técnico).
**Disparador:** Caso real de operación — `"Worker blocked. Missing documents."`

---

## 0. Resumen del hallazgo

El sistema actual responde a una pregunta que **la organización nunca hizo**.

| Pregunta que responde el sistema hoy | Pregunta que la operación realmente hace |
|---|---|
| ¿Este trabajador tiene todos los documentos? | ¿Puedo poner a esta persona a trabajar mañana? |

Esa asimetría no es un defecto de UX. Es un **error de objeto organizacional**.
El sistema modela *evidencia* y devuelve un veredicto binario, mientras que la
organización modela *capacidad de operar* y decide sobre un espectro de riesgo.

**Conclusión del discovery:** sí estamos frente a una capacidad nueva del
ecosistema, del mismo orden que Change Intelligence. No es un módulo de
documentos mejorado. Es un motor de **autorización operacional bajo evidencia
incompleta**.

---

## 1. ¿Cuál es realmente el objeto organizacional?

Se evaluaron siete candidatos. Solo uno sobrevive como objeto raíz.

| Candidato | Rol real | ¿Es el objeto raíz? |
|---|---|---|
| Documento | Artefacto físico/digital | ❌ Es el soporte, no el objeto |
| Evidencia | Lo que un documento *prueba* | ❌ Es un insumo |
| Trabajador | Sujeto de la decisión | ❌ Es el sujeto, no el objeto |
| Readiness | Estado derivado observable | 🟡 Es la *lectura*, no la decisión |
| Riesgo | Costo esperado de operar sin prueba | 🟡 Es la moneda de cambio |
| Compromiso | Deuda futura aceptada | 🟡 Es una consecuencia |
| **Autorización operacional** | Acto organizacional de permitir operar | ✅ **Objeto raíz** |

### 1.1 Definición

> **Autorización Operacional** es el acto —explícito o implícito— por el cual
> una organización acepta que una persona ejecute trabajo real en un contexto
> específico, asumiendo conscientemente el riesgo residual de la evidencia
> faltante.

### 1.2 Por qué no es "Documentos"

Cuatro pruebas lo demuestran:

1. **Prueba de sustitución.** El supervisor que conoce al trabajador sustituye
   evidencia formal por evidencia relacional. La decisión ocurre igual. Luego el
   documento no era la condición necesaria.
2. **Prueba de temporalidad.** El W-4 se necesita *antes del payroll*, no antes
   del turno. El documento y el trabajo viven en líneas de tiempo distintas.
   Un bloqueo único los confunde.
3. **Prueba de historia.** "Ya trabajó antes" es evidencia acumulada de
   desempeño. El sistema la descarta porque no está en formato PDF.
4. **Prueba de propietario.** Nadie en la organización tiene el cargo de
   "administrador de documentos". Sí existe quien responde por *quién trabaja*.

### 1.3 Jerarquía del objeto

```text
AUTORIZACIÓN OPERACIONAL        ← decisión (objeto raíz)
        ▲
   RIESGO ACEPTADO              ← criterio
        ▲
    READINESS                   ← lectura del estado
        ▲
     EVIDENCIA                  ← señales (múltiples fuentes)
        ▲
  DOCUMENTO / HISTORIA / ATESTACIÓN / RELACIÓN
```

El documento está **cuatro niveles por debajo** de la decisión. Hoy el sistema
trata el nivel más bajo como si fuera el más alto. Esa inversión es el bug
conceptual.

---

## 2. Cadena causal — de la evidencia al trabajo

### 2.1 Cadena que el sistema asume hoy

```text
Documento subido → Documento aprobado → Perfil completo → Puede trabajar
```

Lineal, secuencial, binaria, sin actores. Falla ante la realidad.

### 2.2 Cadena real observada

```text
[1] NECESIDAD OPERACIONAL
     Existe un turno, un cliente, una fecha, un rol.
        │
[2] CANDIDATURA
     Una persona es considerada para ese contexto.
        │
[3] LECTURA DE EVIDENCIA (multi-fuente, no solo documental)
     · evidencia documental (W-4, licencia, certificación)
     · evidencia histórica (turnos previos, reputación, incidentes)
     · evidencia relacional (el supervisor responde por la persona)
     · evidencia declarativa (la persona afirma que renovó la licencia)
     · evidencia externa (verificación de terceros)
        │
[4] EVALUACIÓN DE SUFICIENCIA CONTEXTUAL
     ¿La evidencia disponible alcanza PARA ESTE contexto?
     (cliente, rol, tarea, sitio, jurisdicción, horario)
        │
[5] CÁLCULO DE RIESGO RESIDUAL
     · riesgo legal / regulatorio
     · riesgo contractual con el cliente
     · riesgo financiero (payroll, 1099, impuestos)
     · riesgo de seguridad física
     · riesgo reputacional
        │
[6] DECISIÓN DE AUTORIZACIÓN
     Autorizado · Autorizado condicionalmente · Requiere decisión · Denegado
        │
[7] SI ES CONDICIONAL → NACE UNA OBLIGACIÓN
     "Puede trabajar, y debe cerrar X antes de Y."
        │
[8] EJECUCIÓN DEL TRABAJO
        │
[9] VIGILANCIA DE LA OBLIGACIÓN
     Vencimientos, recordatorios, escalamiento, revocación.
        │
[10] CIERRE O CONSECUENCIA
     Evidencia recibida → obligación cerrada.
     Evidencia no recibida → revocación / bloqueo de payroll / escalamiento.
```

### 2.3 Diagnóstico de la brecha

El sistema actual implementa **[3] parcial + [6] degradado a binario**.
No existen: [4] suficiencia contextual, [5] riesgo, [7] obligación,
[9] vigilancia, [10] consecuencia.

**Los pasos ausentes son exactamente donde vive el valor organizacional.**

Consecuencia estructural: la decisión sí se toma —pero fuera del sistema, en
WhatsApp, por teléfono, en la cabeza de un coordinador. La organización pierde
trazabilidad, memoria y capacidad de aprender de sus propias decisiones.
**El bloqueo no previene el riesgo; solo lo vuelve invisible.**

---

## 3. Decisiones humanas vs. mecánicas

### 3.1 Taxonomía de la decisión

| # | Decisión | Naturaleza | Debe seguir siendo humana | Justificación |
|---|---|---|---|---|
| D1 | ¿Existe esta evidencia? | Mecánica | No | Verificación de hecho |
| D2 | ¿Está vigente / vencida? | Mecánica | No | Aritmética de fechas |
| D3 | ¿Es legible / válida en forma? | Semi-mecánica | Supervisión | Extracción puede fallar |
| D4 | ¿Qué exige este contexto? | Mecánica (con reglas declaradas) | No | Política, no criterio |
| D5 | ¿Qué falta para este contexto? | Mecánica | No | Diferencia entre conjuntos |
| D6 | ¿Cuál es el riesgo de la brecha? | Mecánica (clasificación) | No | Reglas + severidad declarada |
| D7 | **¿Es aceptable ese riesgo?** | **Humana** | **Sí — irrenunciable** | Es asunción de responsabilidad |
| D8 | ¿Quién puede aceptarlo? | Mecánica | No | Autoridad declarada |
| D9 | ¿Bajo qué condición y plazo? | Humana asistida | Sí | El sistema propone, el humano fija |
| D10 | ¿Se cumplió la condición? | Mecánica | No | Observación |
| D11 | ¿Qué hacer al incumplirse? | Mecánica (con escalamiento humano) | Parcial | Política declarada + excepción |
| D12 | ¿Cambia la política general? | Humana | Sí | Gobierno |

### 3.2 La línea inviolable

> **El sistema calcula el riesgo. La organización lo acepta.**

Nunca al revés. Un sistema que "aprueba automáticamente porque el riesgo es
bajo" transfiere responsabilidad legal a un algoritmo — algo que ninguna
organización puede sostener frente a un cliente, un auditor o un tribunal.

Corolario operativo: **el rol del sistema no es decidir, es hacer que la
decisión sea barata, informada, rápida y trazable.**

### 3.3 Lo que el sistema debe eliminar

No debe eliminar la decisión humana. Debe eliminar **el trabajo previo a la
decisión**: reunir la evidencia, contrastarla con el contexto, calcular la
brecha, estimar el riesgo, identificar quién puede decidir y proponer la
condición. Hoy ese trabajo cuesta minutos u horas por caso y se hace de memoria.

---

## 4. ¿Qué información debe producir el sistema?

### 4.1 Principio de salida

> El sistema no entrega listas. Entrega **veredictos accionables con causa,
> costo y camino**.

### 4.2 Los cuatro veredictos

| Veredicto | Significado organizacional | Acción del sistema | Requiere humano |
|---|---|---|---|
| **PUEDE TRABAJAR** | Evidencia suficiente para este contexto | Permitir, registrar la base | No |
| **PUEDE TRABAJAR CON SEGUIMIENTO** | Brecha existe, riesgo tolerable bajo condición | Permitir + crear obligación + vigilar | No (política preaprobada) |
| **REQUIERE DECISIÓN** | Brecha material; alguien con autoridad debe asumirla | Enrutar a quien puede decidir, con contexto completo | Sí |
| **NO PUEDE TRABAJAR** | Impedimento absoluto (legal, seguridad, contractual) | Bloquear + explicar + ofrecer ruta de remediación | No (es política dura) |

### 4.3 Anatomía de un veredicto

Todo veredicto debe declarar cinco elementos. Sin los cinco, es una opinión:

1. **Qué** — el veredicto.
2. **Por qué** — la brecha específica y su severidad.
3. **Para qué contexto** — el veredicto no es global, es contextual.
4. **Cuánto cuesta** — riesgo residual, expresado en términos del negocio.
5. **Qué sigue** — condición, plazo, responsable, consecuencia.

### 4.4 Contraste con el estado actual

| Hoy | Objetivo |
|---|---|
| "Worker blocked. Missing documents." | "Puede trabajar este turno. Falta W-4 — riesgo de payroll, no operativo. Debe entregarlo antes del cierre del periodo (12 ago). Si no, el pago se retiene." |

La segunda frase contiene la misma información que hoy vive en la cabeza del
coordinador. Esa es la totalidad del salto de capacidad.

### 4.5 Lo que el sistema nunca debe producir

- Un porcentaje de completitud sin significado operativo.
- Un semáforo sin causa.
- Un bloqueo sin ruta de salida.
- Una lista de documentos como respuesta a una pregunta operativa.

---

## 5. Operational Readiness

### 5.1 Definición

> **Operational Readiness** es la *lectura* de la capacidad de una persona para
> ejecutar un trabajo específico en un contexto específico, en un momento
> específico.

Readiness **no es un atributo del trabajador**. Es una **relación** entre
persona, contexto y tiempo. La misma persona puede estar *ready* para un turno
de cocina hoy y *not ready* para un turno de conducción mañana.

Esto invalida por construcción cualquier campo `profile_status` único a nivel de
persona: un escalar no puede representar una relación ternaria.

### 5.2 Dimensiones

Readiness se compone de dimensiones independientes. Ninguna domina a las otras
por defecto; el contexto pondera.

| # | Dimensión | Pregunta | Naturaleza |
|---|---|---|---|
| R1 | **Identidad** | ¿Sabemos quién es? | Binaria (dura) |
| R2 | **Elegibilidad legal** | ¿Puede trabajar legalmente? | Binaria (dura) |
| R3 | **Habilitación para la tarea** | ¿Tiene la certificación / licencia? | Contextual |
| R4 | **Competencia** | ¿Sabe hacerlo? | Gradual (histórica) |
| R5 | **Disponibilidad** | ¿Puede en ese horario? | Binaria (blanda) |
| R6 | **Aceptación del cliente** | ¿El cliente lo admite? | Contractual |
| R7 | **Habilitación financiera** | ¿Podemos pagarle correctamente? | Diferida |
| R8 | **Confiabilidad** | ¿Se presenta, cumple, no genera incidentes? | Gradual (histórica) |
| R9 | **Salud / seguridad** | ¿Existe restricción física o de sitio? | Contextual |

### 5.3 Cómo se calcula

Readiness **no es un promedio**. Es una evaluación por capas con reglas de
naturaleza distinta:

1. **Capa dura (R1, R2).** Falla → veredicto `NO PUEDE TRABAJAR`.
   No admite excepción, no admite compromiso, no admite autoridad que la releve.
2. **Capa contextual (R3, R6, R9).** La exigencia la define el contexto.
   Falla → `REQUIERE DECISIÓN` si existe autoridad que pueda asumirlo.
3. **Capa diferida (R7).** No bloquea el trabajo; bloquea el *pago*.
   Falla → `PUEDE TRABAJAR CON SEGUIMIENTO` con obligación anclada al payroll.
4. **Capa gradual (R4, R8).** No bloquea; **modula el riesgo** y por tanto el
   nivel de autoridad requerido. Historial fuerte reduce la brecha percibida.

### 5.4 Consecuencia arquitectónica

La distinción entre capa dura, contextual, diferida y gradual es el hallazgo
técnico central del discovery. Explica los cuatro casos reales:

- W-4 faltante → capa **diferida** → nunca debió bloquear el turno.
- Licencia renovada sin subir → capa contextual + evidencia **declarativa** →
  `REQUIERE DECISIÓN`, no bloqueo.
- Supervisor lo conoce → evidencia **relacional** sobre capa gradual → reduce
  el nivel de autoridad necesario.
- Ya trabajó antes → evidencia **histórica** sobre R4/R8 → misma reducción.

El sistema actual colapsa las cuatro capas en una sola compuerta binaria. Ese
colapso es la causa raíz del falso bloqueo.

---

## 6. Suficiencia Operacional — validación de la hipótesis

### 6.1 Hipótesis

> Las organizaciones no esperan evidencia perfecta. Esperan evidencia suficiente
> para asumir un riesgo aceptable.

### 6.2 Veredicto: **CONFIRMADA, con una corrección importante**

**Confirmada** por la evidencia observada:

- La operación continúa a pesar del bloqueo → existe un umbral real distinto del
  formal, y está por debajo de "completo".
- El supervisor sustituye evidencia formal por relacional → la suficiencia
  admite fuentes heterogéneas.
- El W-4 se tolera hasta el payroll → la suficiencia es **temporal**, no puntual.
- Nadie exige perfección antes de operar → la perfección no es el estándar de
  ninguna organización real; es el estándar de un formulario.

**Corrección necesaria:** la hipótesis está incompleta en dos puntos.

1. **La suficiencia no es un umbral único: es una función del contexto.**
   No existe "evidencia suficiente" en abstracto. Existe "suficiente para *este*
   cliente, *este* rol, *esta* jurisdicción, *este* turno". Un mismo expediente
   es suficiente y a la vez insuficiente según dónde se aplique.

2. **Existe un piso no negociable.** Hay evidencia cuya ausencia jamás es
   suficiente, sin importar el riesgo que la organización quiera asumir
   (identidad, elegibilidad legal). La hipótesis, tomada literalmente, sugeriría
   que todo es negociable. No lo es. La suficiencia opera **por encima** del
   piso legal, nunca lo atraviesa.

### 6.3 Formulación corregida

> Por encima de un piso legal innegociable, las organizaciones operan con la
> **evidencia mínima suficiente para el contexto**, y compensan la brecha
> restante con **compromisos vigilados** y **responsabilidad asignada**.

### 6.4 Implicación

La suficiencia **debe ser declarable y versionable** por la organización, no
cableada por el software. Distintas compañías, clientes y jurisdicciones tienen
umbrales legítimamente distintos. El software provee el mecanismo; la
organización provee el umbral.

---

## 7. ¿Existe un concepto superior a "Document Management"?

### 7.1 Candidatos evaluados

| Nombre | Qué captura | Qué omite | Veredicto |
|---|---|---|---|
| Document Management | Almacenamiento, ciclo de vida | Decisión, riesgo, contexto | ❌ Nivel equivocado |
| Compliance Management | Cumplimiento normativo | Operación, suficiencia, historia | ❌ Solo una dimensión (R2) |
| Operational Evidence | Multi-fuente de evidencia | La decisión y la obligación | 🟡 Es una **capa**, no la capacidad |
| Evidence Intelligence | Lectura inteligente de evidencia | El acto de autorizar | 🟡 Nombre centrado en el insumo |
| Readiness Intelligence | Estado y su cálculo | El compromiso y la consecuencia | 🟡 Se queda en la lectura |
| Workforce Trust | Confianza acumulada | Legalidad, contexto, plazo | ❌ Demasiado difuso |
| **Operational Authorization Intelligence** | Decidir quién puede operar, con qué riesgo y bajo qué compromiso | — | ✅ **Nivel correcto** |

### 7.2 Nombre propuesto

> **Operational Authorization Intelligence (OAI)**
> *Inteligencia de Autorización Operacional*

**Criterio de elección:** el nombre debe apuntar al **objeto raíz** (§1), no al
insumo ni a la lectura intermedia. "Evidence" nombra el nivel 4 de la jerarquía;
"Readiness" nombra el nivel 3; "Authorization" nombra el nivel 1.

### 7.3 Arquitectura conceptual en capas

OAI no reemplaza los otros conceptos: **los ordena**.

```text
┌──────────────────────────────────────────────────────────┐
│  OPERATIONAL AUTHORIZATION INTELLIGENCE  (la capacidad)  │
│  Decide, delega, condiciona, vigila, revoca              │
├──────────────────────────────────────────────────────────┤
│  READINESS  (la lectura)                                 │
│  Estado contextual por dimensiones                       │
├──────────────────────────────────────────────────────────┤
│  OPERATIONAL EVIDENCE  (el insumo)                       │
│  Documental · Histórica · Relacional · Declarativa       │
├──────────────────────────────────────────────────────────┤
│  DOCUMENT MANAGEMENT  (el soporte)                       │
│  Archivos, versiones, almacenamiento, vencimientos       │
└──────────────────────────────────────────────────────────┘
```

Document Management **no desaparece**. Deja de ser la capacidad y pasa a ser el
sustrato — igual que en Change Intelligence las notificaciones dejaron de ser la
capacidad y pasaron a ser el canal.

---

## 8. El objeto nuevo que nace

Cuando un trabajador es autorizado *a pesar* de una brecha de evidencia, nace un
objeto organizacional que hoy no existe en ningún sistema.

### 8.1 Descarte de candidatos

- **Excepción** — describe la relación con la regla, no la deuda futura. Es un
  atributo, no el objeto. Además connota anomalía; en la práctica esto es rutina.
- **Condición** — describe el requisito, no quién responde por él.
- **Seguimiento** — describe el mecanismo de vigilancia, no la sustancia.
- **Obligación** — cercano, pero unilateral: recae solo en el trabajador.

### 8.2 El objeto: **COMPROMISO OPERACIONAL** (*Operational Commitment*)

> Un **Compromiso Operacional** es una autorización condicionada y con fecha,
> por la cual la organización permite trabajar hoy a cambio de cerrar una brecha
> de evidencia antes de un momento definido, con un responsable nombrado y una
> consecuencia declarada.

### 8.3 Por qué "Compromiso" y no "Obligación"

Es **bilateral**, y ahí está su valor organizacional:

- La **persona** se compromete a entregar la evidencia.
- La **organización** se compromete a asumir el riesgo mientras tanto.
- Un **individuo con autoridad** se compromete a responder por esa decisión.

Una obligación tiene un solo deudor. Un compromiso reparte responsabilidad — que
es exactamente lo que ocurre en la realidad y lo que el sistema actual borra.

### 8.4 Anatomía

Un compromiso es válido solo si declara **los siete elementos**:

| Elemento | Pregunta |
|---|---|
| Brecha | ¿Qué evidencia falta? |
| Alcance | ¿Para qué contexto se autoriza? (turno, cliente, rango de fechas, rol) |
| Riesgo asumido | ¿Qué puede salir mal y de qué tipo es? |
| Autoridad | ¿Quién lo aceptó y con qué facultad? |
| Plazo | ¿Hasta cuándo? (anclado a un hito real: turno, payroll, auditoría) |
| Responsable del cierre | ¿Quién debe entregar y quién debe verificar? |
| Consecuencia | ¿Qué ocurre si vence sin cerrarse? |

Un compromiso sin plazo es una excusa.
Un compromiso sin autoridad es un riesgo huérfano.
Un compromiso sin consecuencia es ficción.

### 8.5 Ciclo de vida

```text
PROPUESTO → ACEPTADO → VIGENTE → ┬→ CUMPLIDO
                                 ├→ VENCIDO → ESCALADO → ┬→ RENOVADO
                                 │                        └→ INCUMPLIDO
                                 └→ REVOCADO (cambia el contexto o el riesgo)
```

**Estado terminal crítico:** `INCUMPLIDO` no es un fracaso administrativo. Es
**conocimiento organizacional**: alimenta la confiabilidad de la persona (R8),
la calibración de la autoridad que lo aceptó y el umbral de suficiencia futuro.

### 8.6 El compromiso es el activo, no el subproducto

Los compromisos convierten decisiones informales invisibles en **memoria
organizacional auditable**. Con ellos la organización puede responder por primera
vez: ¿cuánto riesgo estamos cargando ahora mismo? ¿quién lo autorizó? ¿qué
porcentaje de nuestros compromisos se cumple? ¿nuestro umbral de suficiencia es
correcto o nos está costando dinero?

Ninguna de esas preguntas es respondible hoy.

---

## 9. Conexión con el ecosistema

### 9.1 Change Intelligence (CI)

Relación de **hermandad estructural, aislamiento operativo**. Ambas son motores
organizacionales, no módulos funcionales; ambas convierten hechos en decisiones.

| Dimensión | Change Intelligence | Operational Authorization Intelligence |
|---|---|---|
| Pregunta | ¿Quién necesita saber que algo cambió? | ¿Quién puede operar y bajo qué riesgo? |
| Entrada | Eventos de dominio | Señales de evidencia |
| Salida | Comunicación dirigida | Veredicto + compromiso |
| Naturaleza | Reactiva | Preventiva |
| Autoridad | Enruta información | Enruta responsabilidad |

**Frontera obligatoria.** OAI **no** notifica. Emite eventos de dominio
estandarizados (`commitment.created`, `commitment.expiring`,
`authorization.revoked`) y CI decide audiencia, consolidación y canal. Esto
respeta P16 (aislamiento del motor) y P17 (manager directo) del Charter de CI.

**Corolario:** OAI es el primer consumidor no-Scheduling del contrato
`DomainChangeEvent` — y por tanto su primera validación real de generalidad.

### 9.2 Organizational Causality

OAI es un **generador nativo de causalidad**. Hoy, cuando un turno se cubre
tarde o un pago se retiene, la causa se pierde. Con compromisos explícitos, la
cadena queda escrita: *brecha → decisión → autoridad → compromiso → resultado*.

Aporta además el eslabón que falta hoy: **la causa de las no-acciones**. Un turno
que no se cubrió porque un trabajador fue bloqueado incorrectamente es un evento
causal invisible en el sistema actual.

### 9.3 Organizational Knowledge

OAI produce conocimiento que ningún otro subsistema puede producir:

- **Calibración de umbrales** — qué brechas se toleraron y cuáles causaron daño.
- **Confiabilidad real** — tasa de cumplimiento de compromisos por persona.
- **Calidad de autoridad** — qué decisores aciertan al asumir riesgo.
- **Costo del falso bloqueo** — turnos perdidos por rigidez injustificada.
- **Política emergente** — reglas que la operación ya aplica de facto y que
  deberían formalizarse.

Este último punto es el más valioso: OAI permite que la política de la
organización **se descubra desde la práctica**, en vez de imponerse desde un
formulario.

### 9.4 Capability Atlas (CAP-001)

OAI **no cabe** en los dominios existentes. Toca D03 (Workforce Directory),
D05/D06 (Scheduling, Dispatch), D08 (Payroll), D11 (Reputation) y D14 (Documents)
sin pertenecer a ninguno. Ese patrón — transversal, sin dueño, con lógica propia —
es precisamente la firma de una **capacidad**, no de un dominio.

Propuesta de registro: nuevo dominio **Core**, `D17 — Operational Authorization`,
con D14 (Documents & Compliance) degradado explícitamente a proveedor de
evidencia. Resuelve además la ambigüedad señalada en CAP-001 §5 sobre la fuente
canónica de readiness.

### 9.5 Constitución de Stafly

Alineamientos:

- **La operación es la verdad.** OAI modela lo que la organización hace, no lo
  que un formulario dice que debería hacer.
- **El sistema no decide por la organización.** La aceptación de riesgo queda
  siempre en manos humanas.
- **Todo acto relevante deja rastro.** Los compromisos vuelven auditable lo que
  hoy ocurre en WhatsApp.
- **Evidencia sobre suposición.** Se amplía el concepto de evidencia sin
  degradar su exigencia.

Tensión declarada: OAI permite operar con evidencia incompleta. No es una
relajación del cumplimiento — es su **formalización**. Hoy ya se opera con
evidencia incompleta; la diferencia es que hoy se hace sin registro, sin plazo,
sin responsable y sin consecuencia.

---

## 10. Principios permanentes propuestos

Candidatos a invariantes del Charter de OAI. No son soluciones técnicas.

| # | Principio | Enunciado |
|---|---|---|
| **OA-P1** | **La autorización es el objeto, no el documento** | El sistema modela el acto de permitir operar. Los documentos son evidencia subordinada. |
| **OA-P2** | **Readiness es relacional** | Nunca es un atributo de la persona. Siempre es persona × contexto × tiempo. |
| **OA-P3** | **La evidencia es multi-fuente** | Documental, histórica, relacional, declarativa y externa son evidencia legítima con distinto peso. |
| **OA-P4** | **Suficiencia sobre perfección** | El estándar es evidencia suficiente para un riesgo aceptable, no evidencia completa. |
| **OA-P5** | **Existe un piso innegociable** | Identidad y elegibilidad legal nunca son negociables, sin importar la autoridad. |
| **OA-P6** | **El sistema calcula el riesgo; la organización lo acepta** | La aceptación de riesgo es un acto humano con nombre propio. Jamás automático. |
| **OA-P7** | **Ningún bloqueo sin causa, costo y camino** | Un veredicto negativo debe declarar qué falta, qué riesgo implica y cómo resolverse. |
| **OA-P8** | **Toda excepción se convierte en compromiso** | No existe la excepción informal. Si se autoriza con brecha, nace un compromiso con plazo, responsable y consecuencia. |
| **OA-P9** | **Todo compromiso vence** | No existe el compromiso perpetuo. El vencimiento sin cierre siempre produce una consecuencia declarada. |
| **OA-P10** | **La autoridad es explícita y proporcional** | Quién puede asumir un riesgo depende de la severidad de ese riesgo, y queda registrado. |
| **OA-P11** | **La política es de la organización, no del software** | Umbrales de suficiencia, plazos y consecuencias son declarables, versionables y auditables por cada compañía. |
| **OA-P12** | **Separación de tiempos** | Requisitos operacionales, financieros y regulatorios tienen líneas de tiempo distintas y no se colapsan en una sola compuerta. |
| **OA-P13** | **OAI decide, no comunica** | Emite eventos de dominio. La comunicación es responsabilidad exclusiva de Change Intelligence. |
| **OA-P14** | **El incumplimiento es conocimiento** | Los compromisos incumplidos alimentan confiabilidad, calibración de autoridad y política futura. |
| **OA-P15** | **El falso bloqueo es un daño medible** | Impedir trabajar a alguien que podía hacerlo es un costo organizacional real y debe medirse igual que el riesgo. |

---

## 11. Preguntas abiertas del discovery

No resueltas. Requieren observación adicional antes de cualquier diseño.

1. ¿La autoridad para aceptar riesgo se deriva del rol, del cliente, del monto
   de riesgo, o de una combinación? ¿Es delegable?
2. ¿Qué tan estable es el umbral de suficiencia entre clientes de una misma
   compañía? ¿Y entre jurisdicciones?
3. ¿Cuánta evidencia histórica hace falta para que sustituya evidencia
   documental de forma legítima? ¿Existe ese punto?
4. ¿La evidencia relacional (el supervisor responde) es una fuente propia o una
   forma de aceptación de riesgo con otro nombre?
5. ¿Cuál es el volumen real de falsos bloqueos hoy? Sin ese número no hay
   dimensionamiento del problema.
6. ¿Existen compromisos que la operación ya gestiona informalmente y que podrían
   observarse antes de diseñar nada?
7. ¿Cuál es la consecuencia real —hoy, en la práctica— de un W-4 no entregado al
   cierre del periodo?

---

## 12. Recomendación de siguiente paso

Coherente con el precedente de Change Intelligence: **modo observación antes de
modo decisión**.

1. **Discovery de campo** — instrumentar y medir los falsos bloqueos actuales y
   las decisiones informales que hoy los sortean. Sin cambiar comportamiento.
2. **Catálogo de brechas** — inventario de tipos de evidencia con su capa
   (dura / contextual / diferida / gradual) y su línea de tiempo real.
3. **Registro de autoridad** — descubrir quién decide hoy, de facto.
4. **ADR de modelo** — recién entonces, decisiones formales de arquitectura.

**Nada de lo anterior requiere escribir software de producto.**

---

## 13. Conclusión

El caso `"Worker blocked. Missing documents."` no es un bug de mensajería. Es la
manifestación visible de que el sistema modela el nivel más bajo de una jerarquía
de cuatro niveles y lo trata como si fuera el más alto.

La organización no administra documentos. Administra **quién puede operar, con
qué riesgo y bajo qué compromiso**.

Eso no es Document Management mejorado. Es una capacidad nueva del ecosistema,
del mismo orden estructural que Change Intelligence:

> **Operational Authorization Intelligence** — el motor organizacional
> responsable de decidir quién puede operar, hacer explícito el riesgo asumido y
> vigilar los compromisos que lo compensan.

**Estado:** Discovery completo. Ninguna implementación autorizada.
