# OX-4 — Operational Card System (OCS)

Sistema oficial de cards del ecosistema Stafly + Parceros. Toda superficie
nueva debe construirse con estos componentes. No se permiten cards ad-hoc.

Import único:

```ts
import { WorkerCard, OcsShiftCard, TeamCard, ValidationCard, KpiCard, InsightCard, OperationalCard } from "@/components/ocs";
```

Catálogo visual (QA): `/app/dev/ocs`.

## Estructura canónica

Todas las cards heredan de `OperationalCard` y respetan este orden:

```text
Estado
  ↓
Identidad
  ↓
Contexto
  ↓
Información principal
  ↓
Información secundaria
  ↓
CTA principal
  ↓
Acciones secundarias
```

Alterar el orden requiere justificación operativa explícita en el PR.

## Variantes

Un solo componente por tipo. Nunca duplicar.

| Prop | Valores | Uso |
| --- | --- | --- |
| `variant` | `compact` · `standard` · `expanded` | Cantidad de información visible. `compact` oculta la info secundaria. |
| `mode` | `interactive` · `readonly` | `readonly` desactiva navegación de la card (los CTAs siguen disponibles si se pasan). |
| `density` | `auto` · `mobile` · `desktop` | `auto` resuelve por viewport. Mobile apila los CTAs a ancho completo. |

## Contratos por card

| Card | Pregunta que responde | Contrato |
| --- | --- | --- |
| `WorkerCard` | ¿Es la persona correcta para esta operación? | Estado + señal de idoneidad (rating, experiencia, distancia, skills) y `blocker` cuando no debe asignarse. |
| `OcsShiftCard` | ¿Qué necesita este turno? | Cobertura visible y `need` en lenguaje operativo. |
| `TeamCard` | ¿Está listo el equipo? | Siempre cobertura + acción para cerrar la brecha. |
| `ValidationCard` | ¿Qué decisión debo tomar? | `decision` y `consequence` son obligatorias. Nunca solo información. |
| `KpiCard` | ¿Qué significa este indicador? | `meaning` obligatorio. Estados de carga, error con reintento y vacío explicado — nunca ceros silenciosos. |
| `InsightCard` | ¿Qué recomienda el sistema? | `recommendation` + `because`. No expone datos crudos. |

## Base de diseño

- Color: exclusivamente tokens semánticos OX-2 (`status-success`, `status-warning`, `status-danger`, `status-neutral`, `status-progress`). Prohibido cualquier color literal.
- Estado: siempre vía `StatusBadge` y `status-registry`. El rail lateral usa la familia del estado.
- Feedback: los `onClick` deben usar `notify` (OX-1). Prohibidos los catch mudos.
- Tipografía y spacing: escala `MT` de OX-3. Ningún texto operativo por debajo de 14px.
- Targets: `TAP` (44x44) en todo control interactivo.

## Accesibilidad

- Estado con texto + icono, nunca solo color.
- `aria-label` descriptivo en cada card.
- Cobertura expuesta como `role="progressbar"` con valores.
- Foco visible (`FOCUS_RING`) y operación completa por teclado: las cards tappables son `<button>`.
- Las acciones internas detienen la propagación para no disparar la navegación de la card.

## Mobile / Desktop

- Mobile: una mano, CTA a ancho completo y visible, sin hover, sin tablas.
- Desktop: la misma card; solo aumenta densidad (padding y disposición horizontal de acciones). La identidad visual no cambia.

## Guía para futuras implementaciones

1. Elegir la card por la pregunta que responde, no por su aspecto.
2. Si ninguna encaja, componer con `OperationalCard` y sus slots — no crear un componente nuevo de superficie.
3. Toda información numérica debe venir acompañada de significado.
4. Toda card que exija decisión debe llevar la acción dentro de la propia card.
5. Los legacy (`shifts/ShiftCard`, `admin/mobile/MobileEntityCard`, `stafly-ui/StaflyCard`) se migran de forma incremental; no se permiten nuevos usos en superficies nuevas.
