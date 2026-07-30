# Change Intelligence — Charter

**Estado:** Vigente (invariante)
**Fecha:** 2026-07-30
**Ámbito:** Todo el ecosistema Stafly / Parceros
**Naturaleza:** Este documento define los principios **permanentes** de Change Intelligence. No describe implementación. Cualquier funcionalidad, sprint o decisión técnica que contradiga un principio de este Charter se considera inválida hasta que el Charter sea modificado explícitamente por decisión humana registrada.

---

## Misión

> Ninguna decisión organizacional termina cuando se guarda.
> Termina cuando todos los afectados conocen el cambio y la organización vuelve a estar sincronizada.

Change Intelligence existe para mantener sincronizada a la organización con el **mínimo número posible de interrupciones**. No es un sistema de notificaciones. Es el mecanismo por el cual una decisión se convierte en realidad compartida.

---

## Principios invariantes

### P1 — Ninguna persona será notificada si su realidad operacional no cambió
La pertenencia a una compañía, a un equipo o a una lista nunca es motivo suficiente para interrumpir a alguien. La única razón legítima es que **lo que esa persona debe hacer, cuándo, dónde o con quién** haya cambiado.

**Consecuencia:** el silencio es un resultado correcto del sistema, no una falla.

### P2 — No notificamos eventos; comunicamos cambios relevantes
Un `UPDATE` no es una noticia. "Tu turno fue actualizado" no es comunicación: es la confesión de que el sistema no entendió qué pasó. La unidad de comunicación es el **cambio semántico**, expresado como `antes → después`.

### P3 — Toda comunicación debe explicar claramente qué cambió
Cada mensaje responde cuatro preguntas, siempre:
1. ¿Qué cambió?
2. ¿Por qué me importa?
3. ¿Qué debo hacer?
4. ¿Antes de cuándo?

Si el sistema no puede responder las cuatro, **no envía**: degrada el cambio a historial.

### P4 — El mismo cambio debe consolidarse en una única comunicación cuando sea posible
Seis campos modificados no son seis mensajes. Son un resumen. Una persona nunca recibe más de una comunicación por entidad dentro de su ventana de consolidación.

### P5 — La auditoría es independiente de la comunicación
Todo cambio se registra siempre, incluso cuando no se comunica a nadie. Auditar no implica notificar; notificar nunca sustituye a auditar. Son dos sistemas con dos propósitos distintos y ninguno depende del otro.

### P6 — Leer no implica comprender; confirmar no implica aceptar
Existen tres estados distintos y **ninguno se infiere de otro**:
- **Informado** — el sistema entregó el mensaje.
- **Leído** — la persona lo abrió.
- **Confirmado** — la persona declaró explícitamente que lo vio.

Una confirmación es acuse de conocimiento, **no** consentimiento, aceptación contractual ni renuncia a objetar. El sistema nunca presentará una confirmación como acuerdo.

### P7 — El canal debe ser proporcional a la criticidad del cambio
La invasividad se gana. Un cambio informativo vive en el historial. Un cambio crítico justifica interrumpir la vida de alguien. Escalar de canal es una decisión del motor basada en impacto calculado, nunca una preferencia del emisor.

### P8 — El objetivo es la sincronización con la mínima interrupción
La métrica de éxito no es cuántos mensajes se enviaron, sino **cuánto tiempo la organización permaneció desincronizada** y **cuántas interrupciones costó volver a sincronizarla**. Menos mensajes con más sentido siempre es mejor que más mensajes.

---

## Principios derivados (operativos, igualmente vinculantes)

### P9 — Las notas internas nunca llegan al trabajador
Los campos administrativos e internos están excluidos por diseño de toda proyección visible al trabajador. No es una regla de filtrado: es una regla de estructura.

### P10 — Un reemplazo de persona afecta a un conjunto cerrado
Solo: el trabajador que sale, el trabajador que entra, el supervisor responsable del turno si existe, y los managers con responsabilidad directa sobre ese turno. **Nunca a todos los managers de la compañía.** Nunca al resto del equipo.

### P11 — No se pide confirmación para cambios triviales
La confirmación es un recurso escaso. Pedirla en exceso la vacía de significado y convierte el botón en un reflejo. Solo los cambios que pueden hacer que alguien llegue al lugar equivocado, en el momento equivocado, o que no llegue, la justifican.

### P12 — El sistema calcula el impacto antes de comunicar, siempre
Ninguna comunicación se emite sin haber pasado por detección, clasificación y resolución de audiencia. No existe un camino de emisión directa que salte el motor.

### P13 — Change Intelligence nunca ejecuta mutaciones de negocio
CI lee, interpreta, comunica y registra. No modifica turnos, asignaciones, nóminas ni ningún estado operativo. Es un observador con voz, no un actor.

### P14 — Ante la duda de clasificación, se protege la seguridad operacional
Si el motor no puede determinar el nivel de impacto de un cambio en dirección, fecha, hora o asignación, lo trata como crítico. La ambigüedad nunca se resuelve hacia el silencio en esas categorías.

### P15 — La confianza en el canal es un activo frágil
Un mensaje irrelevante no cuesta una notificación: cuesta la atención que la persona prestará al siguiente mensaje, que sí puede ser crítico. Todo diseño de CI se evalúa contra este costo.

---

## Lo que Change Intelligence **no** es

- No es un feed de actividad.
- No es un canal de anuncios ni de marketing interno.
- No es un sustituto de la conversación humana.
- No es un mecanismo de presión ni de vigilancia sobre el trabajador.
- No es una herramienta de cumplimiento contractual (la confirmación no es firma — ver P6).

---

## Gobernanza del Charter

- Este documento es **invariante por defecto**. Modificarlo requiere una decisión humana explícita registrada en el Decision Register.
- Todo nuevo tipo de cambio debe registrarse en `CHANGE_INTELLIGENCE_CHANGE_CATALOG.md` y ser evaluado contra P1–P15 antes de su aprobación.
- Toda fase de implementación (F1…F7) debe declarar explícitamente qué principios pone a prueba y cómo los verifica.
- Cuando un principio y una conveniencia técnica entren en conflicto, gana el principio o se cambia el Charter. No hay tercera opción.

---

*Documentos relacionados:*
- `CHANGE_INTELLIGENCE_V1.md` — modelo conceptual y arquitectura
- `CHANGE_INTELLIGENCE_DECISIONS_F0.md` — decisiones DEC-CI-01…05
- `CHANGE_INTELLIGENCE_CHANGE_CATALOG.md` — catálogo oficial de tipos de cambio
