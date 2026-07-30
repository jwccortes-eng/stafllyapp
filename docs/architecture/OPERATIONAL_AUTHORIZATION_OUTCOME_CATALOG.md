# OAI — CATÁLOGO OFICIAL DE RESULTADOS DE AUTORIZACIÓN

**Versión:** 1.0
**Fecha:** 2026-07-30
**Estado:** ✅ Fundacional (F0).
**Regla:** Este catálogo es cerrado. Ningún componente puede inventar resultados.

---

## 0. Principios del catálogo

1. **Prohibido el binario.** `blocked / unblocked` no es un resultado válido.
2. **Todo resultado es contextual** (OA-P3). Nunca aplica "a la persona".
3. **Todo resultado es explicable** (OA-P16): qué, por qué, para qué contexto,
   cuánto riesgo, qué sigue.
4. **Sin ambigüedad ni redundancia.** Dos resultados distintos deben implicar
   acciones organizacionales distintas.
5. **Todo resultado tiene un tiempo de validez.** Ninguno es permanente
   (OA-P22).

### 0.1 Por qué estos nueve y no otros

Cada resultado se justifica por producir una **acción organizacional distinta**:

| Resultado | Acción única que habilita |
|---|---|
| `authorized` | Asignar sin más trámite |
| `authorized_with_conditions` | Asignar **y** abrir un compromiso |
| `decision_required` | Enrutar a una autoridad humana |
| `insufficient_evidence` | Solicitar evidencia (no hay a quién enrutar aún) |
| `not_authorized` | Explicar y remediar; sin ruta de excepción |
| `legally_prohibited` | Detener sin negociación posible |
| `expired_authorization` | Reevaluar; nunca reutilizar |
| `revoked` | Deshacer prospectivamente lo concedido |
| `unknown` | Reparar el sistema, no a la persona |

**Distinciones no obvias, declaradas deliberadamente:**

- `not_authorized` **vs** `legally_prohibited`: el primero admite cambio de
  política o de contexto; el segundo no admite nada (L0/L1). Fusionarlos haría
  imposible detectar un hard stop atravesado.
- `insufficient_evidence` **vs** `decision_required`: en el primero **falta
  información**; en el segundo la información está completa y **falta un humano
  que asuma el riesgo**. Confundirlos envía casos a la autoridad equivocada.
- `unknown` **vs** `not_authorized`: `unknown` es un fallo del sistema, no un
  juicio sobre la persona. Tratarlo como negativo produciría falsos bloqueos —
  exactamente el daño que OAI existe para eliminar (OA-P18).

---

## 1. Los nueve resultados

### 1.1 Tabla maestra

| Resultado | ¿Permite asignar? | ¿Requiere autoridad humana? | ¿Genera compromiso? | ¿Requiere deadline? | ¿Exige acknowledgement? | ¿CI comunica? |
|---|---|---|---|---|---|---|
| `authorized` | ✅ Sí | ❌ No | ❌ No | ❌ No | ❌ No | Solo si cambia desde otro estado |
| `authorized_with_conditions` | ✅ Sí | ⚠️ Según severidad | ✅ **Obligatorio** | ✅ Sí | ✅ Sí (persona + autoridad) | ✅ Sí |
| `decision_required` | ⏸ Suspendido | ✅ **Sí** | ➡️ Al resolverse | ✅ Sí (para decidir) | ✅ Sí (decisor) | ✅ Sí (enrutar) |
| `insufficient_evidence` | ❌ No | ❌ No | ❌ No | ⚠️ Recomendado | ❌ No | ✅ Sí (a quien puede aportar) |
| `not_authorized` | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Sí |
| `legally_prohibited` | ❌ **Nunca** | ❌ No (no negociable) | ❌ No | ❌ No | ❌ No | ✅ Sí (registro) |
| `expired_authorization` | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Sí |
| `revoked` | ❌ No (prospectivo) | ⚠️ Si es manual | ❌ No (puede cerrar uno) | ❌ No | ✅ Sí (afectados) | ✅ **Sí, siempre** |
| `unknown` | ⏸ Suspendido | ❌ No | ❌ No | ❌ No | ❌ No | ⚠️ Solo a operaciones |

---

### 1.2 Definiciones y evidencia mínima explicativa

#### `authorized`
**Significado.** La evidencia disponible es suficiente para este contexto y no
existe brecha material.
**Evidencia mínima para explicar:** requisitos aplicables al contexto,
evidencia que satisface cada uno y su grado de calidad, vigencia de la
autorización.
**Nota:** "suficiente" ≠ "completo" (OA-P6). Puede haber brechas L3/L4 no
materiales para este contexto; deben listarse igualmente como informativas.

#### `authorized_with_conditions`
**Significado.** Existe una brecha real, el riesgo residual es tolerable bajo
política, y la organización autoriza a cambio de un compromiso con plazo.
**Evidencia mínima:** brecha específica, su nivel (L2–L4), riesgo residual y
tipo, política que permite la tolerancia, compromiso creado (obligación, plazo,
responsable, autoridad, consecuencia).
**Restricción dura:** jamás sobre L0/L1 (OA-P10/P11).
**Autoridad:** no la requiere si la política la preaprueba para esa severidad;
la requiere en caso contrario — y entonces el resultado previo fue
`decision_required`.

#### `decision_required`
**Significado.** La información está completa. La brecha es material. Falta un
humano con autoridad que **acepte el riesgo**.
**Evidencia mínima:** brecha, riesgo, autoridad competente identificada,
opciones disponibles (autorizar con condición / denegar), impacto operativo de
no decidir y fecha límite para decidir.
**Es un estado transitorio.** Un `decision_required` sin plazo de decisión es un
bloqueo disfrazado y viola OA-P17.

#### `insufficient_evidence`
**Significado.** No se puede evaluar: falta información, no falta decisión.
**Evidencia mínima:** qué se necesita, quién puede aportarlo, por qué es
necesario para este contexto y cuál es la ruta de aportación.
**Diferencia crítica con `not_authorized`:** aquí el sistema no ha juzgado a la
persona; aún no ha podido evaluar.

#### `not_authorized`
**Significado.** Evaluado, con brecha que la política declara no tolerable para
este contexto. No existe ruta de excepción bajo la política vigente.
**Evidencia mínima:** requisito incumplido, nivel, política y versión que lo
declara no tolerable, ruta de remediación y — obligatorio — si otro contexto
sí sería autorizable.
**Obligación de OA-P17:** debe ofrecer camino. Un `not_authorized` sin ruta de
remediación es un defecto.

#### `legally_prohibited`
**Significado.** Hard stop L0/L1 vigente. No es negociable por nadie.
**Evidencia mínima:** regla, su origen, versión, jurisdicción y autoridad que la
aprobó.
**Prohibiciones absolutas:** no ofrece alternativas, no propone compromiso, no
enruta a autoridad, no admite override en ninguna ruta.
**Nota:** no constituye asesoría legal; refleja una política configurada.

#### `expired_authorization`
**Significado.** Existió una autorización válida; su vigencia terminó o el
contexto cambió.
**Evidencia mínima:** autorización original, motivo del vencimiento (tiempo o
cambio de contexto), y qué se necesita para reevaluar.
**Razón de ser:** hace imposible la reutilización silenciosa (OA-P22). Sin este
estado, una autorización vieja se confundiría con `authorized`.

#### `revoked`
**Significado.** Una autorización vigente fue retirada activamente.
**Evidencia mínima:** autorización original, disparador (vencimiento de
evidencia, incumplimiento de compromiso, cambio de política, decisión humana,
hard stop sobrevenido), quién o qué la revocó, y su alcance temporal.
**Efecto por defecto:** prospectivo. El trabajo ya ejecutado no se desautoriza
retroactivamente (DEC-OAI-F).
**CI siempre comunica.** Es el resultado de mayor impacto operativo.
**Diferencia con `expired_authorization`:** vencer es pasivo; revocar es un acto.

#### `unknown`
**Significado.** El sistema no pudo producir un veredicto (datos no disponibles,
política no configurada, fallo del evaluador).
**Evidencia mínima:** qué impidió evaluar y a quién corresponde repararlo.
**Regla crítica:** `unknown` **nunca** se trata como negativo. Debe ser visible
como fallo del sistema, no como juicio sobre la persona.
**Señal de salud:** una tasa alta de `unknown` invalida cualquier conclusión de
Observation Mode.

---

## 2. Transiciones permitidas

```text
                    ┌──────────────────────────────┐
                    ▼                              │
  unknown ──▶ insufficient_evidence ──▶ decision_required
     │                 │                    │      │
     │                 ▼                    ▼      ▼
     └──────────▶ not_authorized      authorized_with_conditions
                       │                    │
                       │                    ▼ (compromiso cumplido)
                       │              ┌─▶ authorized ◀─┐
                       └──────────────┘       │        │
                                              ▼        │
                       revoked ◀───── expired_authorization
                          │                            │
                          └────────(reevaluación)──────┘

  legally_prohibited  ◀── alcanzable desde cualquier estado
                      ──▶ solo hacia reevaluación si la regla cambia o cesa
```

### 2.1 Matriz de transición

| Desde ↓ / Hacia → | auth | auth_cond | dec_req | insuf | not_auth | legal_prohib | expired | revoked | unknown |
|---|---|---|---|---|---|---|---|---|---|
| `authorized` | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `authorized_with_conditions` | ✅ (cumplido) | — | ✅ | ❌ | ✅ (incumplido) | ✅ | ✅ | ✅ | ✅ |
| `decision_required` | ✅ | ✅ | — | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `insufficient_evidence` | ✅ | ✅ | ✅ | — | ✅ | ✅ | ❌ | ❌ | ✅ |
| `not_authorized` | ✅ (nueva ev.) | ✅ | ✅ | ✅ | — | ✅ | ❌ | ❌ | ✅ |
| `legally_prohibited` | ✅ **solo si la regla cesa o cambia** | ❌ | ❌ | ✅ | ✅ | — | ❌ | ❌ | ✅ |
| `expired_authorization` | ✅ (reevaluado) | ✅ | ✅ | ✅ | ✅ | ✅ | — | ❌ | ✅ |
| `revoked` | ✅ (reevaluado) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | — | ✅ |
| `unknown` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | — |

**Reglas invariantes de transición**

1. **Nada entra a `legally_prohibited` por conveniencia** — solo por regla L0/L1
   vigente y aplicable.
2. **Nada sale de `legally_prohibited` por autoridad** — solo si la regla cesa,
   cambia de versión o deja de aplicar al contexto.
3. **`expired` y `revoked` no son alcanzables** desde estados que nunca
   concedieron autorización.
4. **Toda transición registra causa** (OA-P24). Una transición sin causa es un
   defecto.
5. **Toda transición es un evento de dominio** disponible para CI; OAI nunca
   comunica por su cuenta (OA-P25).
6. **Cambio de contexto no es transición: es una evaluación nueva.** Un veredicto
   pertenece a su contexto y no viaja con la persona.

---

## 3. Eventos de dominio emitidos (para CI)

OAI emite; CI decide audiencia, consolidación y canal.

| Evento | Se emite cuando |
|---|---|
| `authorization.evaluated` | Se produce un veredicto (relevancia la juzga CI) |
| `authorization.granted` | Transición a `authorized` o `authorized_with_conditions` |
| `authorization.decision_requested` | Transición a `decision_required` |
| `authorization.denied` | Transición a `not_authorized` o `legally_prohibited` |
| `authorization.expired` | Transición a `expired_authorization` |
| `authorization.revoked` | Transición a `revoked` |
| `authorization.hard_stop_encountered` | Se alcanzó un L0/L1 (siempre auditable) |

Ningún evento contiene PII más allá de identificadores; ninguno contiene canal,
plantilla ni destinatario. Determinar el destinatario es competencia exclusiva
de CI (P17 del Charter de CI).
