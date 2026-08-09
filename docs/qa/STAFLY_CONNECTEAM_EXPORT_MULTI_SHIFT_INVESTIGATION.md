# P0 — CONNECTEAM EXPORT · SOLO SE IMPORTA 1 SERVICIO CUANDO SE SELECCIONAN 3

Fecha: 2026-07 · Alcance: exportador CSV Stafly → Connecteam (frontend, read-only).
No se tocó payroll, `time_entries`, asignaciones, permisos, mapping Job/Sub item,
Users ni Number of users.

---

## 1. ¿Cuántas filas genera el CSV?

**Tres. Una por servicio.** El pipeline no pierde la colección.

- `ExportConnecteamBulkDialog` construye `rows = shifts.map(...)` (una fila por servicio).
- `handleDownload` filtra solo los `blocked` y llama a `serializeConnecteamCsv(rows)`.
- `serializeConnecteamCsv` emite encabezado + `rows.length` líneas.

Reproducción automática (`src/test/connecteam-multi-export.test.ts`):
3 servicios ⇒ `countCsvDataRows(csv) === 3`, encabezado excluido.

## 2. ¿Dónde se pierden el segundo y el tercer servicio?

**En el importador de Connecteam, no en el serializer.** Datos reales de los tres
servicios del video (Quality Staff):

| Ref | Título | Fecha | Start | End | Duración |
|---|---|---|---|---|---|
| QK-001578 | Luminance | 18/08/2026 | 00:08 | 00:09 | 1 min |
| QK-001579 | Imperial | 18/08/2026 | 00:08 | 00:08 | **0 min** |
| QK-001580 | Imperial | 28/08/2026 | 00:08 | 00:08 | **0 min** |

Dos de las tres filas tienen `End == Start`. Connecteam descarta en silencio las
filas de duración cero — no muestra error, simplemente no crea el turno. Por eso
el Overview mostraba exactamente **un** turno: el único con duración real.

Riesgo secundario detectado: dos servicios con el mismo título ("Imperial") en la
misma fecha y con el mismo Job producen filas indistinguibles; Connecteam las
fusiona en un solo turno.

## 3. ¿Bug del exportador o del importador?

El descarte lo hace el importador, pero **la responsabilidad es del exportador**:
Stafly declaraba "exportable" una fila que Connecteam nunca podría aceptar, y
generaba filas no distinguibles entre sí. Ambas cosas se corrigen en Stafly.

## 4. Evidencia

- Consulta a `scheduled_shifts` (solo lectura) con los tres servicios reales del video.
- `src/test/connecteam-multi-export.test.ts` reproduce el CSV y el conteo de filas.
- `serializeConnecteamCsv` auditado: no deduplica, no agrupa, no filtra.
- `ExportConnecteamBulkDialog` auditado: no hay `find`/`[0]`/`slice(0,1)` en el camino.

## 5. Fix aplicado

`src/lib/integrations/connecteam-export.ts`
- **Bloqueo `zero_duration`**: si `Start == End`, el servicio queda bloqueado con
  motivo explícito ("Connecteam descarta estas filas: corrige la hora de fin").
  Se bloquea antes de generar el archivo, no después del import fallido.
- **Shift title con referencia humana** (Fase E): `QK-001578 · Luminance`.
  Nunca el UUID. `Note` sigue llevando `Ref: QK-001578` (prioriza `shift_ref`,
  cae a `shift_code` histórico).
- **`connecteamRowSignature` / `findDuplicateRowSignatures`**: detectan filas que
  Connecteam vería como el mismo turno.
- **`countCsvDataRows`**: conteo canónico de filas de datos (excluye encabezado).

`src/components/shifts/integrations/ExportConnecteamBulkDialog.tsx`
- Aviso visible cuando hay colisiones de filas.
- Toast de descarga con el número real de filas del CSV, para contrastarlo con el
  Overview de Connecteam.

## 6. QA con 3 servicios

`bunx vitest run src/test/connecteam-multi-export.test.ts` — 5 casos:
1. 3 servicios ⇒ 3 filas de datos.
2. Mismo título y fecha ⇒ títulos distintos, sin colisión.
3. Filas realmente idénticas ⇒ colisión detectada.
4. `Shift title` con referencia humana, sin UUID; `Note` con `Ref:`.
5. Duración cero ⇒ `blocked` con código `zero_duration`.

Suites relacionadas sin regresión: `connecteam-export` (35), `connecteam-compat` (26),
`connecteam-mapping` (9), `service-operational-readiness` (6). Total 81 en verde.

## 7. Confirmación

El CSV contiene exactamente una fila por cada servicio exportado. Los servicios que
Connecteam descartaría (duración cero) ya no salen del sistema marcados como
exportables, y cada fila lleva su referencia operativa (`QK-00XXXX`) en el título y
en la nota para que un turno importado sea siempre rastreable hasta su servicio.
