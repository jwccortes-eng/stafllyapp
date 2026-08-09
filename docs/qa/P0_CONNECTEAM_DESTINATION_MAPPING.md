# P0 — CONNECTEAM DESTINATION MAPPING (Millennium vs Imperial)

Fecha: 2026-08-09 · Alcance: UI + configuración canónica. Sin cambios en el CSV, el motor de
exportación, payroll, `time_entries`, `shift_assignments` ni el esquema de `scheduled_shifts`.

## 1. Comparación con datos reales

Configuración de la empresa (`company_settings.key = 'connecteam_mapping'`, Quality Staff by Keury):

| entrada | job | sub item |
| --- | --- | --- |
| `client:30cc3b7f…d1c8` (IMPERIAL HALL) | `IMPERIAL HALL` | — |
| `title:luminance` | `LUMINANCE HALL` | — |

Servicios comparados:

| | Imperial | Millennium (QK bloqueado, 30 ago 17:00–23:30) |
| --- | --- | --- |
| company_id | `0000…0001` | `0000…0001` (mismo tenant) |
| client_id | `30cc3b7f…d1c8` | `3e6f9c2f…d50a` (The Millennium Simcha Hall) |
| location_id | — | `null` en unos, `cc8e8986…d4d9` en otros |
| mapping declarado | **sí**, por cliente | **no existe ninguna entrada** |
| Job / Sub item resueltos | `IMPERIAL HALL` / vacío | vacío / vacío |
| fallback | no aplica (modo estricto) | bloqueado: con mapping declarado en la empresa, el fallback por nombre crudo se desactiva |

**Causa raíz:** no hay bug de motor. Millennium simplemente **no tiene destino Connecteam declarado**.
Como la empresa ya declaró al menos un mapping, `resolveConnecteamJobAndSubItem` entra en modo estricto
y deja de inventar el Job con el nombre crudo — correcto, porque Connecteam lo mostraría como "Select".

Defectos reales encontrados alrededor de eso (sí corregidos):

1. En la exportación semanal, `missing_job_mapping` no estaba en el mapa de causas → los servicios
   caían en "Falta información básica", que es falso y no accionable.
2. La exportación semanal no ofrecía ninguna forma de configurar el destino: el CTA solo existía en la
   exportación individual.
3. "Resolver ahora" proponía por defecto el **lugar** (sujeto más específico). Al guardar ahí, los
   servicios del mismo cliente sin venue seguían bloqueados y volvía a pedirse turno por turno.

## 2. Cambios

- `src/lib/integrations/connecteam-export-groups.ts`: nueva causa canónica `missing_destination`
  ("Falta destino Connecteam") con acción por lote "Configurar destino"; `missing_job_mapping` mapeado a ella.
- `src/lib/integrations/connecteam-mapping.ts`: `mostReusableSubject` (cliente → lugar → título) y
  `suggestJobFromSubject` (sugerencia, nunca aplicación automática).
- `src/components/shifts/integrations/ConnecteamMappingSheet.tsx`: preselecciona el sujeto reutilizable,
  carga el destino ya declarado al cambiar de sujeto, muestra sugerencia como enlace opcional y el
  impacto ("se reutilizará en N servicios de esta vista").
- `src/components/shifts/integrations/ExportConnecteamBulkDialog.tsx`: el grupo "Falta destino Connecteam"
  abre el mismo panel con los sujetos únicos de los servicios afectados.

Sin lógica por nombre: Millennium no aparece en el código. El operador confirma el Job/Sub item exacto.

## 3. QA (`src/test/connecteam-destination-mapping.test.ts`, 5/5 en verde)

| Caso | Resultado |
| --- | --- |
| Antes: Millennium | `missing`, Job y Sub item vacíos, bloqueo `missing_job_mapping` |
| Antes: Imperial | `exact` por `client:30cc3b7f…`, sin cambios |
| Sujeto por defecto de "Resolver ahora" | `client` |
| Después de declarar `MILLENNIUM / Waiters` en el cliente | Millennium exportable, sin bloqueos |
| Reutilización | segundo servicio Millennium (con venue distinto) resuelve por `client:3e6f9c2f…` |
| Imperial tras el cambio | intacto |
| Cross-tenant | sin entradas propias nunca hay `source.job = "mapping"` ni `mappingKey` |

## Criterio de cierre

Un servicio Millennium con fecha y horario válidos deja de estar bloqueado exclusivamente al declarar su
destino Connecteam canónico, y ese destino queda guardado a nivel cliente (company-scoped) para los
servicios siguientes.
