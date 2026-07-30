# CONTRATO DEL COMPROMISO OPERACIONAL

**Versión:** 1.0
**Fecha:** 2026-07-30
**Estado:** ✅ Fundacional (F0). Contrato conceptual — **sin diseño de tablas**.

---

## 1. Definición

> Un **Compromiso Operacional** es una autorización condicionada y con fecha, por
> la cual la organización permite trabajar hoy a cambio de cerrar una brecha de
> evidencia antes de un momento definido, con responsables nombrados y una
> consecuencia declarada de antemano.

Es el objeto que nace cada vez que se emite `authorized_with_conditions`.
Es el **activo central de OAI**: convierte decisiones informales invisibles en
memoria organizacional auditable.

---

## 2. Por qué es bilateral (y no una obligación)

Una obligación tiene un solo deudor. Un compromiso reparte responsabilidad — que
es exactamente lo que ocurre en la realidad y lo que el sistema actual borra.

| Parte | Qué compromete | Qué arriesga |
|---|---|---|
| **La persona** | Entregar la evidencia faltante antes del plazo | Su acceso a trabajo futuro y su confiabilidad registrada |
| **La organización** | Permitir trabajar mientras tanto, y no cambiar las reglas a mitad | Riesgo legal, contractual, financiero o reputacional |
| **La autoridad** | Responder por haber aceptado ese riesgo | Su calibración como decisor queda registrada |

**Consecuencia de diseño:** un compromiso con un solo nombre es inválido. Se
requieren como mínimo dos partes identificadas: quién promete y quién acepta el
riesgo.

### 2.1 Los tres roles

- **Quién promete** — `responsible_party`. Normalmente el trabajador; a veces un
  tercero (el supervisor que dice "yo consigo el documento").
- **Quién acepta el riesgo** — `accountable_authority`. Siempre una persona
  nombrada con autoridad proporcional a la severidad (OA-P14). Nunca un rol
  genérico, nunca "el sistema".
- **Quién hace seguimiento** — el sistema vigila; una persona escala. La
  vigilancia es mecánica (D10 del discovery), el escalamiento es humano-asistido.

---

## 3. Contrato conceptual

| Campo | Tipo conceptual | Obligatorio | Descripción |
|---|---|---|---|
| `commitment_id` | Identidad | ✅ | Identificador estable e inmutable |
| `origin_decision_id` | Referencia | ✅ | Decisión de autorización que lo originó. Sin origen no hay compromiso |
| `subject` | Persona | ✅ | Sobre quién recae la autorización condicionada |
| `obligation` | Enunciado | ✅ | Qué debe ocurrir, en lenguaje operativo verificable |
| `evidence_required` | Especificación | ✅ | Qué evidencia cierra la brecha y con qué **grado mínimo** de calidad |
| `responsible_party` | Persona | ✅ | Quién promete cumplir |
| `accountable_authority` | Persona | ✅ | Quién aceptó el riesgo. Nunca un rol genérico |
| `scope` | Contexto | ✅ | Alcance exacto: turno, rango de fechas, cliente, ubicación, rol |
| `severity` | Escala | ✅ | Gravedad del riesgo asumido; determina autoridad y escalamiento |
| `created_at` | Momento | ✅ | Cuándo nació |
| `due_at` | Momento | ✅ | Vencimiento, **anclado a un hito real** |
| `status` | Estado | ✅ | Ver ciclo de vida (§4) |
| `consequence_if_unmet` | Enunciado | ✅ | Qué ocurre al vencer sin cierre. Declarado **antes**, no después |
| `escalation_policy` | Política | ✅ | Cuándo y a quién escala antes y después del vencimiento |
| `revocation_effect` | Enunciado | ✅ | Qué autorizaciones caen si se incumple, y desde cuándo |
| `resolution_evidence` | Referencia | ⚠️ Al cerrar | La evidencia concreta que cerró la brecha |
| `closure_reason` | Enunciado | ⚠️ Al cerrar | Por qué se cerró: cumplido, revocado, ya no aplica, superado por política |

### 3.1 Reglas de validez

Un compromiso es **inválido** si:

1. No tiene `due_at`. *Un compromiso sin plazo es una excusa.*
2. No tiene `accountable_authority` nombrada. *Un compromiso sin autoridad es un
   riesgo huérfano.*
3. No tiene `consequence_if_unmet`. *Un compromiso sin consecuencia es ficción.*
4. No tiene `scope` contextual completo. *Un compromiso sin alcance es una
   autorización global encubierta (viola OA-P3).*
5. Su brecha es un hard stop L0/L1. *Prohibido por Charter (OA-P10/P11).*

---

## 4. Ciclo de vida

```text
PROPUESTO ──▶ ACEPTADO ──▶ VIGENTE ─┬──▶ CUMPLIDO
                                    │
                                    ├──▶ VENCIDO ──▶ ESCALADO ─┬──▶ RENOVADO ──▶ VIGENTE
                                    │                          └──▶ INCUMPLIDO
                                    │
                                    ├──▶ REVOCADO      (cambia contexto o riesgo)
                                    │
                                    └──▶ OBSOLETO      (la política cambió; ya no aplica)
```

| Estado | Significado |
|---|---|
| `PROPUESTO` | OAI propuso condición, plazo y consecuencia. Aún nadie aceptó |
| `ACEPTADO` | La autoridad asumió el riesgo y la persona conoce la obligación |
| `VIGENTE` | Corriendo. La autorización condicional está activa |
| `CUMPLIDO` | Evidencia recibida con el grado requerido y verificada |
| `VENCIDO` | Pasó `due_at` sin cierre. Dispara `consequence_if_unmet` |
| `ESCALADO` | Elevado según `escalation_policy` |
| `RENOVADO` | Nueva autoridad extendió el plazo. **Acto nuevo, nunca automático** |
| `INCUMPLIDO` | Terminal negativo. Alimenta conocimiento organizacional |
| `REVOCADO` | Cesó porque cambió el contexto o el riesgo |
| `OBSOLETO` | La política cambió y la brecha dejó de existir |

**Prohibición absoluta:** no existe la auto-renovación (OA-P21). `RENOVADO`
siempre requiere una autoridad nombrada que asuma el riesgo extendido.

---

## 5. Preguntas de diseño resueltas

### 5.1 ¿Qué sucede si vence?

El vencimiento no es un evento silencioso. Ejecuta, en orden:

1. Aplica `consequence_if_unmet` (declarada de antemano, nunca improvisada).
2. Aplica `revocation_effect` sobre autorizaciones futuras — **prospectivo**,
   nunca retroactivo sobre trabajo ya ejecutado.
3. Escala según `escalation_policy`.
4. Emite evento de dominio; CI decide a quién comunicar.
5. Registra el incumplimiento como conocimiento (OA-P23).

**Lo que jamás ocurre al vencer:** desautorizar retroactivamente trabajo ya
hecho, ni retener un pago sin que la política lo haya declarado como
consecuencia explícita antes de la creación del compromiso.

### 5.2 ¿Afecta futuras asignaciones?

Sí, por tres vías, todas explícitas:

1. **Directa** — `revocation_effect` retira autorizaciones dentro de su `scope`.
2. **Indirecta** — el incumplimiento reduce la confiabilidad de la persona (R8),
   lo que eleva el riesgo percibido en evaluaciones futuras.
3. **Sobre la autoridad** — la tasa de incumplimiento calibra qué tan bien esa
   autoridad evalúa riesgo.

**Límite ético obligatorio:** un incumplimiento **modula riesgo**; nunca
constituye por sí solo un `not_authorized` permanente. Un compromiso incumplido
no puede convertirse en una lista negra silenciosa.

### 5.3 ¿Cómo se cierra?

Solo por cuatro vías, todas con `closure_reason` explícito:

| Vía | Requiere |
|---|---|
| **Cumplimiento** | `resolution_evidence` con el grado mínimo especificado, verificada |
| **Revocación** | Cambio de contexto o riesgo + acto registrado |
| **Obsolescencia** | Cambio de política versionado que elimina la brecha |
| **Incumplimiento** | Vencimiento + escalamiento agotado |

Un compromiso **nunca desaparece**. Se cierra con motivo y permanece como
memoria.

### 5.4 ¿Cuándo debe escalar?

- **Preventivamente**, antes del vencimiento, en proporción a `severity`.
- **Al vencer**, siempre.
- **Al acumularse**: cuando una misma persona o una misma autoridad acumula
  compromisos vencidos por encima de un umbral.
- **Al detectarse patrón**: cuando la misma brecha se excepciona repetidamente
  → escala a **gobierno de política**, no a operación (DEC-OAI-G).

El escalamiento **no es una notificación**. Es un cambio de responsable. La
notificación resultante es competencia de CI.

### 5.5 ¿Cuándo una promesa verbal es evidencia suficiente?

Una promesa verbal es **evidencia declarativa** (DEC-OAI-I). Reglas:

1. **Nunca** satisface un hard stop L0/L1.
2. **Puede** sostener una autorización condicional sobre brechas L2–L4.
3. **Siempre** genera compromiso — es su razón de existir. Aceptar una promesa
   sin compromiso es exactamente la informalidad que OAI elimina.
4. **Debe atribuirse** a quien la hizo. Una promesa anónima no es evidencia.
5. **Su peso depende del historial** de quien promete: la evidencia inferida
   (R8) modula cuánto vale la declarativa.

**El caso del supervisor que responde por el trabajador** es precisamente esto:
evidencia declarativa de un tercero responsable. Hoy el sistema la descarta. En
OAI se registra, se pesa y genera un compromiso con nombre y plazo.

### 5.6 ¿Cómo evitar compromisos eternos o invisibles?

**Contra los eternos:**

- `due_at` obligatorio, anclado a un hito real (turno, cierre de payroll,
  auditoría), nunca a un plazo genérico.
- Sin auto-renovación. `RENOVADO` exige autoridad nombrada.
- Límite al número de renovaciones antes de escalamiento forzoso a gobierno.
- Vencimiento con consecuencia automática: el tiempo siempre produce un efecto.

**Contra los invisibles:**

- Todo compromiso vigente es visible en el contexto donde importa: el perfil de
  la persona, la operación afectada y el tablero de la autoridad que lo aceptó.
- Agregados obligatorios: cuánto riesgo abierto carga la organización ahora
  mismo, por compañía, cliente y autoridad.
- Un compromiso que nadie puede ver es equivalente a no haberlo creado — y por
  tanto es un defecto del sistema, no del proceso.

---

## 6. Lo que el compromiso hace posible

Preguntas hoy **no respondibles** que el compromiso vuelve triviales:

1. ¿Cuánto riesgo de evidencia estamos cargando ahora mismo?
2. ¿Quién lo autorizó y con qué facultad?
3. ¿Qué porcentaje de nuestros compromisos se cumple, y en qué plazo?
4. ¿Nuestro umbral de suficiencia es correcto, o nos está costando dinero?
5. ¿Qué brechas se excepcionan tanto que la política debería cambiar?
6. ¿Qué autoridades evalúan bien el riesgo y cuáles no?

Estas seis preguntas son el retorno organizacional de OAI. No la automatización.
