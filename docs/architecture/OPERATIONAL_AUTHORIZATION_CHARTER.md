# OPERATIONAL AUTHORIZATION INTELLIGENCE — CHARTER

**Versión:** 1.0
**Fecha:** 2026-07-30
**Estado:** ✅ Fundacional (F0). Principios permanentes.
**Base:** `OPERATIONAL_AUTHORIZATION_DISCOVERY.md` (aprobado).
**Precedente estructural:** `CHANGE_INTELLIGENCE_CHARTER.md`.

> Este documento define lo que OAI **es para siempre**. Los principios aquí
> declarados son invariantes: no se relajan por conveniencia de implementación,
> presión de calendario ni petición de un cliente. Cambiarlos requiere una
> decisión de gobierno explícita y versionada.

---

## 1. Qué es OAI

> **Operational Authorization Intelligence** es el motor organizacional
> responsable de determinar si una persona puede ejecutar un trabajo específico
> en un contexto específico, hacer explícito el riesgo residual de la evidencia
> faltante, enrutar la decisión a la autoridad correcta y vigilar los
> compromisos que compensan esa brecha.

OAI responde una sola pregunta, y la responde bien:

> **¿Puede esta persona operar aquí, ahora, con qué riesgo y bajo qué compromiso?**

OAI es una **capacidad**, no un módulo. Es transversal a Identity, Evidence,
Scheduling, Payroll y Reputation, y no pertenece a ninguno de ellos.

---

## 2. Qué NO es OAI

| OAI **no** es | Por qué importa |
|---|---|
| Un gestor de documentos | Document Management es el sustrato, cuatro niveles por debajo (Discovery §7.3) |
| Un sistema de compliance legal | No interpreta leyes; consume políticas aprobadas por humanos |
| Un sistema de notificaciones | No posee canales. Emite eventos; CI comunica |
| Un scorer de trabajadores | No produce un número opaco que decida por nadie |
| Un aprobador automático de riesgo | La aceptación de riesgo material es siempre un acto humano nombrado |
| Un motor de scheduling | No asigna turnos. Informa a quien asigna |
| Un sistema de payroll | No calcula ni retiene pagos. Puede condicionar su habilitación vía evento |
| Un reemplazo del juicio humano | Es juicio humano **amplificado**, no sustituido |
| Un asesor jurídico | Ninguna salida de OAI constituye asesoría legal |

---

## 3. Principios permanentes (invariantes)

### Bloque A — Naturaleza de la autorización

**OA-P1 · El objeto es la autorización, no el documento.**
OAI modela el acto organizacional de permitir operar. Los documentos son
evidencia subordinada. Ningún diseño puede invertir esta jerarquía.

**OA-P2 · Ningún documento autoriza por sí solo.**
Un documento presente no produce autorización; una autorización se produce al
evaluar evidencia contra contexto y riesgo. Un documento ausente tampoco
produce prohibición (ver OA-P9).

**OA-P3 · Toda autorización es contextual.**
No existe "la persona está autorizada". Existe "la persona está autorizada
para *este* contexto". El contexto es irreductible y mínimo obligatorio:

```text
CONTEXTO = persona × operación × rol × lugar × fecha/horario × tipo de trabajo
           (+ cliente, + jurisdicción cuando aplican)
```

Una autorización sin contexto completo es inválida por construcción.

**OA-P4 · Readiness es relacional, nunca un atributo de la persona.**
Cualquier representación escalar de readiness a nivel de persona es una
simplificación prohibida: colapsa una relación ternaria en un campo.

### Bloque B — Evidencia y suficiencia

**OA-P5 · La evidencia es multi-fuente.**
Documental, histórica, relacional, declarativa y externa son formas legítimas
de evidencia, con pesos distintos y trazabilidad distinta. Ninguna es la única.

**OA-P6 · La evidencia puede ser suficiente sin estar completa.**
El estándar organizacional es *suficiencia para un riesgo aceptable en un
contexto*, no completitud. La perfección documental no es el estándar de
ninguna operación real.

**OA-P7 · La suficiencia la declara la organización, no el software.**
Umbrales, plazos y consecuencias son configuración declarada, versionada y
auditable por compañía, cliente, ubicación, rol y jurisdicción. El software
provee el mecanismo; nunca el umbral.

**OA-P8 · Separación de tiempos.**
Los requisitos operacionales, financieros y regulatorios viven en líneas de
tiempo distintas y **no pueden colapsarse en una sola compuerta**. Un requisito
de payroll no bloquea un turno; bloquea un pago.

**OA-P9 · La ausencia de evidencia no equivale automáticamente a prohibición.**
Ausencia produce una **brecha con severidad**, no un veredicto. Solo la política
declarada convierte una brecha en prohibición.

### Bloque C — Piso legal y límites

**OA-P10 · Existe un piso innegociable.**
Identidad y elegibilidad legal para trabajar son innegociables. Ninguna
autoridad, ninguna urgencia operativa y ninguna recomendación del sistema puede
atravesarlas. La suficiencia opera **por encima** del piso, jamás a través de él.

**OA-P11 · Ninguna recomendación puede superar un hard stop vigente.**
Si un hard stop aplica, OAI no ofrece alternativas, no propone compromisos y no
enruta a autoridad. Solo explica y ofrece ruta de remediación.

**OA-P12 · OAI no interpreta leyes.**
La configuración legal proviene de políticas aprobadas por humanos
identificables, con origen, versión y vigencia trazables. Las diferencias
jurisdiccionales requieren configuración explícita; jamás inferencia.

### Bloque D — Decisión y autoridad

**OA-P13 · El sistema calcula el riesgo; la organización lo acepta.**
La aceptación de riesgo material es un acto humano con nombre propio. Un sistema
que acepta riesgo por su cuenta transfiere responsabilidad legal a un algoritmo.

**OA-P14 · Toda excepción requiere autoridad explícita y proporcional.**
No existe la excepción anónima ni la excepción por omisión. Quién puede asumir
un riesgo depende de la severidad de ese riesgo y queda registrado.

**OA-P15 · La autorización nunca depende de una puntuación opaca.**
Prohibido cualquier veredicto derivado de un score no explicable. Si un factor
influye en la decisión, debe poder enunciarse en lenguaje operativo.

**OA-P16 · Toda autorización debe ser explicable.**
Todo veredicto declara cinco elementos —qué, por qué, para qué contexto, cuánto
riesgo, qué sigue—. Sin los cinco, es una opinión, no un veredicto.

**OA-P17 · Ningún bloqueo sin causa, costo y camino.**
Un resultado negativo que no explique qué falta, qué riesgo implica y cómo
resolverse es un defecto, no una medida de seguridad.

**OA-P18 · El falso bloqueo es un daño medible.**
Impedir trabajar a quien podía hacerlo tiene costo real (turno descubierto,
cliente afectado, ingreso perdido por el trabajador) y se mide con el mismo
rigor que el riesgo asumido.

### Bloque E — Compromiso y consecuencia

**OA-P19 · Toda excepción se convierte en compromiso.**
No existe la excepción informal. Autorizar con brecha crea un Compromiso
Operacional con plazo, responsable, autoridad y consecuencia declarados.

**OA-P20 · Toda autorización condicional genera seguimiento.**
Sin vigilancia activa no hay autorización condicional: hay renuncia silenciosa.

**OA-P21 · Todo compromiso vence.**
No existe el compromiso perpetuo ni el invisible. El vencimiento sin cierre
siempre produce la consecuencia declarada de antemano.

**OA-P22 · Una autorización vencida o fuera de contexto no se reutiliza en silencio.**
Reusar una autorización fuera de su contexto o de su vigencia es una decisión
nueva, y debe tratarse como tal.

**OA-P23 · El incumplimiento es conocimiento.**
Los compromisos incumplidos alimentan confiabilidad de la persona, calibración
de la autoridad que decidió y revisión del umbral de suficiencia.

### Bloque F — Registro y frontera

**OA-P24 · Toda decisión registra origen, evidencia, autoridad, condición y consecuencia.**
Una decisión sin estos cinco campos no es auditable y por tanto no ocurrió a
efectos organizacionales.

**OA-P25 · OAI decide; no entrega mensajes.**
OAI no posee canales, plantillas, audiencias ni colas. Emite eventos de dominio
estandarizados. Toda comunicación es responsabilidad exclusiva de CI.

**OA-P26 · CI no decide autorización.**
CI puede comunicar que una autorización cambió. Jamás puede producirla,
modificarla, condicionarla ni cerrarla.

**OA-P27 · Aislamiento del motor.**
El núcleo de OAI no conoce Scheduling, Payroll, Documentos ni Reclutamiento.
Opera sobre contratos estandarizados de evidencia, contexto y política. La
traducción vive en adaptadores, nunca en el motor. (Espejo de P16 en CI.)

---

## 4. Límites de la capacidad

### 4.1 Lo que OAI puede hacer

- Leer evidencia de múltiples fuentes mediante adaptadores.
- Evaluar suficiencia contra un contexto y una política declarada.
- Clasificar brechas por severidad y línea de tiempo.
- Producir un veredicto explicable del catálogo oficial.
- Identificar y enrutar a la autoridad competente.
- Proponer condición, plazo y consecuencia para un compromiso.
- Vigilar compromisos y emitir eventos de vencimiento, cierre y revocación.
- Producir conocimiento agregado sobre umbrales, autoridad y falsos bloqueos.

### 4.2 Lo que OAI nunca hará

- Asignar un turno. Solo informa a quien asigna.
- Aprobar o rechazar un documento. Eso pertenece a Evidence.
- Aceptar riesgo material sin un humano nombrado.
- Enviar una notificación por cualquier canal.
- Retener, calcular o ejecutar un pago.
- Inferir requisitos legales o jurisdiccionales.
- Escribir en tablas operacionales de otros dominios.
- Derivar un veredicto de un modelo cuya salida no sea explicable.

### 4.3 Prohibiciones estructurales

Estas prohibiciones deben ser imposibles por arquitectura, no por disciplina:

1. Sin rutas de entrega dentro de OAI.
2. Sin escritura directa en dominios de negocio.
3. Sin bypass del piso legal en ninguna ruta de código.
4. Sin veredicto sin explicación adjunta.
5. Sin compromiso sin plazo.

---

## 5. Relación con el ecosistema

| Subsistema | Relación | Frontera |
|---|---|---|
| **Identity** | Proveedor del piso duro (¿sabemos quién es?) | OAI consume; nunca resuelve identidad |
| **Evidence / Documents** | Proveedor de evidencia documental y vencimientos | OAI no aprueba ni almacena documentos |
| **Scheduling / Dispatch** | Consumidor principal del veredicto | OAI informa; Scheduling asigna |
| **Payroll** | Consumidor de la capa diferida | OAI señala habilitación financiera; no ejecuta pagos |
| **Reputation / History** | Proveedor de evidencia histórica y confiabilidad | OAI lee; no califica |
| **Change Intelligence** | Consumidor de eventos de OAI | OAI decide · CI comunica. Frontera dura |
| **Organizational Knowledge** | Consumidor de agregados de OAI | OAI produce calibración, no política |
| **Capability Atlas** | Registro de la capacidad | Propuesta: `D17 — Operational Authorization` (Core) |

### 5.1 Frontera OAI ↔ CI (crítica)

```text
OAI  ──emite DomainChangeEvent──▶  CI  ──decide audiencia/canal──▶  personas
     (authorization.granted,
      authorization.revoked,
      commitment.created,
      commitment.expiring,
      commitment.breached)
```

OAI es el primer consumidor no-Scheduling del contrato `DomainChangeEvent`, y
por tanto su primera validación real de generalidad.

---

## 6. Alineación con la Constitución de Stafly

- **La operación es la verdad.** OAI modela lo que la organización hace, no lo
  que un formulario dice que debería hacer.
- **El sistema no decide por la organización.** El riesgo lo acepta un humano.
- **Todo acto relevante deja rastro.** Los compromisos vuelven auditable lo que
  hoy ocurre fuera del sistema.
- **Evidencia sobre suposición.** Se amplía qué cuenta como evidencia sin
  degradar su exigencia.

**Tensión declarada y aceptada:** OAI permite operar con evidencia incompleta.
Esto no relaja el cumplimiento — lo formaliza. Hoy ya se opera así, pero sin
registro, sin plazo, sin responsable y sin consecuencia.

---

## 7. Gobierno del Charter

- Los principios OA-P1 a OA-P27 son invariantes de F0.
- Modificar o retirar un principio exige una decisión registrada en
  `OPERATIONAL_AUTHORIZATION_DECISIONS_F0.md` con justificación y fecha.
- Añadir principios es admisible en fases posteriores; **debilitarlos no**.
- Todo diseño posterior debe poder mapearse a estos principios. Si no puede, el
  diseño está mal o el principio debe cambiarse explícitamente — nunca ignorarse.
