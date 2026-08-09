# Ecosystem Intake Engine — Fase 1: Entity Resolution + Assisted Creation

Fecha: 2026-08-09 · Alcance: Smart Service Intake (todas las fuentes)

## Objetivo

Cerrar el ciclo **DETECTAR → BUSCAR → RECOMENDAR → CONFIRMAR → VINCULAR O CREAR**
para Clientes, Lugares, Contactos y Direcciones dentro de la bandeja de revisión,
sin abandonar el servicio que se está revisando.

## Qué se construyó

### 1. Capa de decisión (pura, sin I/O)
`src/lib/intake/entity-linking.ts`

- `rankCatalogMatches` — busca en el catálogo del tenant y ordena hasta 3 recomendaciones.
- `buildEntityResolution` — devuelve una decisión explicable con estado:
  `empty` · `linked` · `suggested` · `ambiguous` · `unknown`.
- `decisionFromRef` — respeta el aprendizaje previo del Diccionario por empresa:
  un término ya aprendido se muestra como vinculado, no como sugerencia nueva.
- `pendingResolutions` — qué falta resolver antes de poder crear el servicio.

Cada decisión trae una frase de negocio lista para la UI, por ejemplo:
"Creemos que “Millenium Hall” es el lugar Millennium Hall. Confírmalo para vincularlo."

### 2. Creación asistida (único carril de escritura)
`src/lib/intake/assisted-creation.ts`

- `linkOrCreateClient`, `linkOrCreateVenue`, `linkOrCreateClientContact`.
- Toda función exige `confirmedByHuman: true`. Sin confirmación → `blocked`.
- Antes de crear siempre intenta vincular: idempotencia por nombre normalizado
  dentro de la misma empresa (no duplica catálogo).
- `company_id` viene siempre del contexto autenticado.
- No toca servicios, asignaciones, payroll ni time_entries.

### 3. Resolución inline
`src/components/intake/EntityResolutionSheet.tsx`

Hoja inferior operable con una mano: explicación, búsqueda, recomendaciones con
porcentaje y motivo, vinculación en un toque y, como última opción, creación con
confirmación explícita. Al confirmar, ofrece recordar la corrección para la
empresa reutilizando `RememberCorrectionPrompt` (Fase 5 del diccionario).

### 4. Integración en la bandeja
`ServiceIntakeReviewInbox` recibe `companyId` e `intakeSource` y muestra
"Resolver cliente" / "Resolver lugar" en los candidatos sin entidad vinculada.
Los tres paneles (texto, imagen/PDF, audio) pasan el contexto. No se creó una
segunda bandeja ni un segundo pipeline.

## Invariantes verificadas

- La IA propone, la persona confirma. Cero creación silenciosa.
- Ambigüedad o baja confianza → vuelve a revisión humana.
- Cero cross-tenant: catálogos y escrituras siempre filtrados por empresa.
- El aprendizaje sólo ocurre tras confirmación humana explícita.
- La revisión no se pierde: todo ocurre dentro de la misma pantalla.

## Pruebas

`src/test/ecosystem-intake-phase1.test.ts` — 8 casos: match exacto, typo,
ambigüedad, desconocido, texto vacío, regla aprendida, orden de recomendaciones
y bloqueo previo a la creación del servicio. Todos en verde.
