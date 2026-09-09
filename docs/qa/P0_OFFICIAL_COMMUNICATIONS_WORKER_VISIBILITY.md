# P0 — Comunicados oficiales · visibilidad en el portal del trabajador

Fecha: 2026-09-09 · Auditoría **read-only**. Cero escrituras, cero emails, cero publicación.

## 1. Comunicado observado

| Campo | Valor |
|---|---|
| announcement_id | `b506eaa5-a037-4569-80a6-b5774d6d9a72` |
| company_id | `00000000-…-0001` (Quality Staff by Keury) |
| versión vigente | `9b198d0e-aea1-4c7e-9b6f-aa399c5587a5` — v1, **published**, 2026-09-09 05:38:11Z |
| tipo | `critical_acknowledgment` (crítico, requiere acuse) |
| audiencia | `all_company` — **203 destinatarios congelados** (152 con acceso al portal) |
| acuses | 0 |
| estados | 203 en `available`, 0 `viewed`, 0 `acknowledged` |
| v2 | existe en `draft`, sin destinatarios (correcto) |

## 2. Cuenta usada en la prueba

Único inicio de sesión de trabajador en las últimas 48 h: `emp_3476399595@employee.internal`, **05:37:17Z**.

Esa cuenta tiene **dos fichas de persona**:

| employee_id | empresa | ¿destinatario? | módulo `my_announcements` |
|---|---|---|---|
| `482e78ca-…5ce` | Quality Staff | **SÍ** | sin fila → habilitado por defecto |
| `340db246-…6b4` | otra empresa (`37f92f75-…`) | NO | — |

**¿Era destinataria? → YES** (en el contexto de Quality Staff).

## 3. Por qué no se vio el comunicado

Tres causas, ninguna es de datos ni de permisos:

1. **Cronología.** La sesión se abrió a las **05:37:17** y la versión se publicó a las **05:38:11** — 54 segundos después. El feed carga una sola vez; el tiempo real solo escucha `announcements` y `announcement_reactions`, y `loadOfficial()` (que lee `announcement_recipients`) **no se vuelve a ejecutar nunca**. Sin recargar la página no puede aparecer.
2. **Contexto de empresa.** La misma cuenta pertenece a dos empresas. `useEffectiveEmployee` devuelve la ficha de la empresa seleccionada; si el contexto activo era la otra empresa, el feed lee otra empresa y el comunicado no existe ahí. Comportamiento correcto de aislamiento, pero invisible para la persona.
3. **Descubrimiento.** En móvil el feed vive **solo dentro del menú "Más"** (`/portal/announcements`). No hay tarjeta en Inicio, ni pendiente, ni distintivo en la barra inferior, ni notificación. Un comunicado crítico que exige acuse queda escondido a dos toques sin ninguna señal.

Cadena de datos y permisos **verificada y correcta**: `auth.users → employees.user_id → announcement_recipients.employee_id`; las políticas de `announcements` (`can_read_announcement`), `announcement_versions`, `announcement_recipients` y `announcement_acknowledgments` limitan todo a `my_employee_ids()` y a versiones `published`/`superseded`. Un no destinatario no puede leerlo ni por consulta directa.

## 4. Consulta real del feed

`src/pages/portal/MyAnnouncements.tsx`
- `loadAnnouncements()` → `announcements` filtrado por `company_id` + `published_at not null` + `deleted_at is null`.
- `loadOfficial()` → `announcement_recipients` con `announcement_versions(*)` por `employee_id`; descarta `draft`; se queda con el `version_number` mayor.
- Marca `mark_announcement_viewed` al tener el contenido delante; el acuse es la RPC `acknowledge_announcement`.

Consecuencia estructural: **el comunicado oficial solo se ve si su fila base en `announcements` está publicada**. Si un día una versión se publica sin espejar la fila base, el destinatario no vería nada aunque sea audiencia. Hoy el espejo sí ocurre.

## 5. Estados

`available ≠ viewed ≠ acknowledged` se respeta; no existe "delivered". Abrir el feed marca `viewed`, nunca `acknowledged`.

## 6. Dónde debería aparecer

Superficie de atención, sin crear otro sistema: el comunicado sigue viviendo en `announcements` / `announcement_versions`. Se añadiría en Inicio del portal, junto a `NextBestActionCard`, una tarjeta "Comunicado pendiente" (empresa · título · "Requiere confirmación" · botón "Revisar comunicado" → `/portal/announcements`), más un punto en la pestaña "Más". Nada de datos nuevos: misma consulta de `announcement_recipients`.

## 7. QA end-to-end

**No ejecutado.** Requiere crear y publicar un comunicado en QA Testing y abrir sesión real como tres personas QA (A, B, C). Son escrituras y sesiones; queda a la espera de autorización explícita.

## 8. Riesgos

1. Sin recarga manual, un comunicado publicado no aparece en una sesión ya abierta.
2. Descubrimiento nulo: crítico + acuse escondido en "Más".
3. Multi-empresa: la persona puede estar mirando la empresa equivocada sin saberlo.
4. Dependencia del espejo en `announcements` para la visibilidad.

## Veredicto

🟡 UX DISCOVERY ISSUE — DATA FLOW CORRECT
