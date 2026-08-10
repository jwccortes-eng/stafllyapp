# STAFLY — Ecosystem Health Report V1

Fecha: 2026-08-10 · Empresa de referencia: **Quality Staff by Keury**
Naturaleza: **auditoría de solo lectura**. Cero migraciones, cero escrituras, cero cambios de código.

---

## Sección 1 — Estado general (0–100)

| Dominio | Score | Lectura |
|---|---:|---|
| Servicios | 82 | Motor canónico único (`series-engine`, `buildCanonicalServiceInsert`) + VWC. Falta cierre operativo consistente en servicios pasados. |
| Bulk Creation | 78 | Funciona y es idempotente (`reconciliation_hash`); workspace full-screen. Aún depende de resolución manual de entidades y no tiene reintento parcial elegante. |
| Calendario | 74 | Mes a ancho completo, identidad visual por servicio y chips de estado. Semana/día siguen densos y el rendimiento con 1.648 servicios no está medido. |
| Recurrencias | 80 | Un solo motor de series con preview; casos multi-fecha (Imperial) resueltos. Edición de una serie ya creada sigue siendo por servicio. |
| Staffing | 76 | Definición canónica de asignable ya aplicada en todas las superficies. La población real quedó en **152 de 1.418**: correcto, pero expone la deuda de identidad. |
| Workers | 48 | 1.112 históricos, 70 pending approval, 40 placeholders/system, 63 grupos de nombre duplicado, 30 grupos de email duplicado. Datos usables pero sucios. |
| Clientes | 45 | 37 registros, 33 sin contacto, duplicados evidentes por variante de nombre. Es el dominio menos gobernado. |
| Locations/Venues | 42 | Convivencia `locations` (44) y `locations_v2` (16) + 874 servicios sin `location_id`. Modelo no consolidado. |
| Smart Intake | 79 | Multimodal, diccionario por tenant, expansión de fechas y drafts con entidades pendientes. La calidad final depende del ruido de clientes/venues. |
| Connecteam Export | 77 | Mapping por destino explicable, horas provisionales y badges de estado. Sigue siendo un puente, no una integración bidireccional. |
| Command Center | 70 | Today Hub y Validation Center sobre OCS. Faltan señales de cierre y de calidad de datos en el mismo lugar. |
| Payroll | 84 | Snapshots append-only, tarifa resuelta por RPC, inmutabilidad tras consolidación, 105 periodos. Es el dominio más protegido. |
| Documents | 60 | 43 documentos, 14 pendientes de revisión, `employee_onboarding_documents` vacío y `onboarding_required_documents` sin configurar. Flujo existe, adopción no. |
| UX Desktop | 78 | Shell premium, cabecera canónica, gutters y espaciado consistentes. Quedan pantallas legacy sin migrar a OCS. |
| UX Mobile | 72 | Quick create, cards sin scroll horizontal y hubs móviles. Densidad y navegación profunda siguen desiguales. |

---

## Sección 2 — Datos (Quality Staff, solo lectura)

| Métrica | Valor |
|---|---:|
| Servicios (total) | **1.648** |
| Drafts | **84** |
| Servicios futuros | 72 |
| Asignaciones históricas | 6.378 |
| Clientes | **37** |
| Locations (`locations` / `locations_v2`) | **44 / 16** |
| Workers (no borrados) | **1.418** |
| Workers activos | 241 |
| Workers **asignables** (contrato canónico) | **152** |
| Pending approval | **70** |
| Historical | **1.112** |
| System / placeholder | **40** |
| Posibles duplicados Workers | 63 grupos por nombre · 30 grupos por email · 0 por teléfono |
| Posibles duplicados Clientes | ≥2 exactos + ~5 pares por variante de nombre |
| Workers con portal (`user_id`) | 199 |
| Workers sin email o sin teléfono | 84 |
| Payroll bloqueado por identidad | 0 |
| Servicios sin cliente / sin location | 14 / **874** |
| Documentos / pendientes de revisión | 43 / 14 |

---

## Sección 3 — Riesgos

### P0
- **Datos — identidad de Workers:** 63 grupos de nombre y 30 de email duplicados. Riesgo de pagar dos veces a la misma persona o partir su historial.
- **Datos — Clientes:** duplicados activos (`Emmincence` / `EMMINENCE HALL`, `THE MILENIUM SIMCHA` / `The Millennium Simcha Hall`, `NEW CONSTUMER` x2, `21 * PASSOVER` x2). Rompe facturación y reporting por cliente.
- **Arquitectura — Locations:** dos modelos vivos y 874 servicios sin location. Impide trazabilidad de venue y cálculo por sede.

### P1
- **Operación — Documents:** requisitos de onboarding sin configurar; 14 documentos esperando revisión sin dueño claro.
- **UX — Clientes:** no existe pantalla de gobierno (ruido, merge, calidad). Todo se corrige creando más ruido.
- **Datos — 84 workers sin contacto:** bloquea notificación y portal.
- **Integraciones — Connecteam:** unidireccional; los cambios en Connecteam no vuelven a Stafly.

### P2
- **UX — densidad en vistas semana/día** y iconografía inconsistente entre módulos legacy y OCS.
- **Arquitectura — pantallas aún fuera de OCS/`OperationalScreenHeader`.**
- **Operación — 84 drafts** sin política de caducidad ni limpieza.

---

## Sección 4 — Operación real

**¿Hoy podríamos operar Quality Staff desde Stafly? → SÍ.**

El carril crítico está cerrado: crear servicios (individual, masivo, recurrente e intake), asignar equipo con población canónica, exportar a Connecteam, capturar asistencia y correr payroll con tarifas protegidas.

Requiere todavía **supervisión manual** en:
1. Elección de cliente al crear servicio (hay duplicados que el operador debe desambiguar mentalmente).
2. Venue: 874 servicios sin `location_id`; el operador confía en el texto libre.
3. Alta de workers: 70 pending approval necesitan aprobación humana antes de aparecer en staffing.
4. Identidad: al ver dos "MARIANA CRUZ" hay que decidir a mano cuál es la persona real.
5. Revisión de documentos: sin lista de requisitos configurada, la validación es criterio del admin.
6. Reconciliación de payroll: los periodos se cierran con revisión manual en Centro de Validación.

---

## Sección 5 — Clientes (auditoría, sin merge)

- Total 37 · activos 29 · archivados/otros 8.
- **33 de 37 sin email ni teléfono de contacto** → calidad de datos baja.
- Ruido de entorno mezclado con producción: `Client DEMO A/B - TEST_RUN_20260226`, `Prueba 2`, `JKitchen Staff`, `Manager/Quality S`, `QUALITY STAFF BY KEURY LLC` (la propia empresa como cliente).
- Duplicados exactos: `21 * PASSOVER`, `NEW CONSTUMER`.
- Nombres similares (candidatos, no confirmados): `Emmincence` ↔ `EMMINENCE HALL`; `THE MILENIUM SIMCHA` ↔ `The Millennium Simcha Hall`; `ELUM FRANKL HALL` ↔ `LUMINANCE HALL` (probablemente distintos, verificar).
- Nombres tipo persona sin apellido (`Mendy`, `RACHEL`, `SHOIMY`, `Booser`) → probablemente contactos, no clientes.

No se ejecutó ningún merge ni cambio.

---

## Sección 6 — Workers (auditoría, sin cambios)

- 1.418 registros; solo **152 asignables**. El 89% del padrón es histórico o no elegible.
- Identidad: 40 registros placeholder/system, todos con nombre genérico detectable; 0 con payroll bloqueado (es decir, el bloqueo no se está usando como red de seguridad).
- Duplicados potenciales: 63 grupos por nombre normalizado, 30 por email. Ninguno por teléfono (buena señal: el teléfono es el identificador más limpio).
- Passport / perfil: 84 sin email o teléfono; el grueso de los históricos no tiene fecha de alta, manager ni rol real.
- Portal: 199 con `user_id` sobre 241 activos → ~42 activos sin acceso.
- Status: `onboarding_status = 'pending'` es el valor por defecto masivo, por lo que hoy no discrimina nada.

---

## Sección 7 — Experience debt (priorizada)

**P0**
1. Gobierno de Clientes (ver duplicados, calidad y ruido en un solo sitio).
2. Resolución de identidad de Workers accionable desde staffing.

**P1**
3. Consolidación de Locations/Venues (un solo modelo, venue obligatorio en servicio).
4. Pantalla de Documents con requisitos configurados y cola de revisión con dueño.
5. Vista mensual y semana: densidad y rendimiento con volumen real.

**P2**
6. Iconografía y tono consistentes entre módulos legacy y OCS.
7. Política de caducidad de drafts.
8. Migración de pantallas restantes a `OperationalScreenHeader`.

---

## Sección 8 — Recomendación

**Siguiente sprint: CLIENT TRUTH LAYER — gobierno y desduplicación de Clientes (solo lectura + acción explícita de merge asistido).**

Motivo: es el único dominio que hoy contamina simultáneamente creación de servicios, Smart Intake, export a Connecteam y facturación, y es el más pequeño (37 registros) — máximo impacto operativo con mínimo riesgo. Workers queda inmediatamente después, porque su desduplicación toca payroll y exige el mismo patrón ya probado en Clientes.

---

No se modificó código ni datos. Se auditó el estado actual del ecosistema después de los P0 recientes y se priorizó el siguiente sprint basándose en operación real.
