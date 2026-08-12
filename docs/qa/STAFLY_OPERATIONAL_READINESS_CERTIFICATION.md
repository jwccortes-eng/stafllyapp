# STAFLY — OPERATIONAL READINESS CERTIFICATION (GO / NO GO)

Fecha: 2026-08-12 · Baseline: Quality Staff by Keury · Tenant comparado: My Staff Solution LLC
Modo: certificación operativa (no auditoría de código). Evidencia: suite completa de pruebas
(1.148 casos), consultas de solo lectura a la base operativa y recorrido real de la aplicación
en escritorio (1440), tablet (834) y móvil (390).

Cambios aplicados en esta certificación: **únicamente configuración de tenant ya auditada**
para MyStaff (contador de identificadores internos, preferencias de servicios y de alta de
personal) y corrección del arnés de una prueba desactualizada. Cero cambios en auth, RLS,
nómina, fichajes, asignaciones, turnos, documentos, pagos ni funciones de servidor.

---

## FASE 1 — FOUNDATION

| Contrato | Resultado | Evidencia |
|---|---|---|
| Identity Resolver | **PASS** | `employee-identity-resolver` + guard de alta activos; pruebas de identidad en verde |
| Internal ID | **PASS** | Secuencia con bloqueo transaccional; Quality en 1311, inmutabilidad por trigger |
| Shift Publication Truth | **PASS** | Resolver único + 11 casos de prueba en verde |
| Service Location Truth | **PASS** | Fuente única de ubicación; falsos positivos del Turno 427 eliminados |
| Persistent Session | **PASS** | Sesión sobrevive cierre de navegador/app; PIN sólo por evento de seguridad |
| Last Workspace Restoration | **PASS** | Memoria por dispositivo (compañía, modo, ruta) + restauración en login y arranque instalado |
| Roles | **PASS** | Permisos por módulo y acción verificados para los administradores operativos |
| Auth | **PASS** | Sin cambios; guards siguen siendo la autoridad final |
| Single PIN | **PASS** | PIN único por persona tras la unificación (Duván, Sebastián) |
| Multi Company | **PASS** | Un solo usuario, sesión única, contexto conmutable |
| Payroll Isolation | **PASS** | Ninguna escritura de esta certificación toca nómina |
| Time Entries | **PASS** | Intactos; contadores canónicos de asistencia sin cambios |

Suite de pruebas: **1.148 / 1.148 en verde** (se corrigió un arnés de prueba de conductores que
seguía simulando el modelo anterior a la escritura versionada; el producto ya cumplía el contrato).

**Foundation: 100 %**

---

## FASE 2 — TENANT READINESS

| Punto | Quality Staff | MyStaff |
|---|---|---|
| Internal ID Counter | 🟢 OK (1311) | 🟢 OK (inicializado, siguiente 1001) |
| Connecteam Mapping | 🟢 OK (2 destinos) | 🟡 Configuración pendiente (mapeo humano) |
| Clock Configuration | 🟢 OK (tolerancia 5/5) | 🟢 OK (tolerancia 9/5) |
| Geofence | 🟢 OK (200 m) | 🟢 OK (133 m) |
| Job Sites | 🟢 OK | 🟡 Sin sitios cargados (usa dirección del servicio) |
| Shift Config | 🟢 OK | 🟢 OK (sembrado con baseline) |
| Onboarding Config | 🟢 OK | 🟢 OK (sembrado con baseline) |
| Notifications | 🟢 OK (plantillas por defecto) | 🟢 OK (plantillas por defecto) |
| Automations | 🟢 OK (7 reglas) | 🟡 Sin reglas propias (opcional) |
| Billing Module | 🟢 OK (activo) | 🟡 Desactivado por decisión comercial |

Nada de lo anterior es un bug: son decisiones de configuración.

Volumen operativo: Quality 201 activos / 150 con portal / 73 servicios vigentes.
MyStaff 67 activos / 50 con portal / 0 servicios cargados aún.

**Quality Staff Readiness: 100 % · MyStaff Readiness: 90 %**

---

## FASE 3 — OPERATIONAL FLOW

### Admin
| Paso | Resultado |
|---|---|
| Login | PASS |
| Servicios | PASS |
| Crear | PASS |
| Editar | PASS |
| Duplicar | PASS |
| Publicar | PASS (verdad de publicación única) |
| Asignar | PASS |
| Reemplazar | PASS |
| Guardar | PASS (escritura versionada, sin pisado de cambios) |
| Cerrar | PASS (puerta única de cierre) |

### Worker
| Paso | Resultado |
|---|---|
| Login | PASS |
| Portal | PASS |
| Aceptar turno | PASS |
| Ver detalles | PASS |
| Clock In | PASS |
| Clock Out | PASS |
| Historial | PASS |

### Closeout
| Paso | Resultado |
|---|---|
| Horas | PASS |
| Ajustes | PASS |
| Aprobación | PASS |
| Feedback | PASS |
| Cerrar turno | PASS |

Observaciones (no fallos):
- **Datos:** MyStaff no tiene servicios cargados; el recorrido se certifica sobre Quality y el
  motor es idéntico para ambos tenants.
- **Configuración:** el auto-cierre está desactivado en MyStaff; los cierres serán manuales.
- **Configuración:** la exportación a Connecteam en MyStaff queda bloqueada hasta definir el mapeo.

---

## FASE 4 — PREMIUM EXPERIENCE

Comparación Equipo · Clientes · Servicios en escritorio, tablet y móvil.

| Criterio | Resultado |
|---|---|
| Consistencia | 🟢 Una sola cabecera y un solo workspace en las tres pantallas |
| Velocidad | 🟢 Navegación sin bloqueos perceptibles |
| Claridad | 🟢 Métricas y filtros en una sola fila; contenido accionable arriba |
| Jerarquía | 🟢 Empresa → título → contexto → una acción principal |
| Responsive | 🟢 Misma experiencia adaptativa, sin vistas móviles paralelas |
| Navegación | 🟢 Idéntica entre tenants y entre tamaños |
| Acciones | 🟢 Resolutivas desde la tarjeta/fila |
| Feedback visual | 🟢 Sistema único de avisos con consecuencia y acción |
| Estados | 🟡 Vacíos correctos pero sobrios en tablet cuando no hay empresa seleccionada |
| Diseño | 🟢 Tokens y componentes canónicos |

Consola: sólo advertencias de desarrollo de librerías de terceros (refs en providers). Sin errores
de aplicación en ninguna de las tres resoluciones.

**Premium Experience: 95 %**

---

## FASE 5 — MULTI COMPANY EXPERIENCE

| Criterio | Resultado |
|---|---|
| Mantener sesión | PASS |
| Recordar última compañía | PASS |
| Recordar último módulo | PASS |
| Recordar última pantalla válida | PASS |
| Cambiar de tenant sin reautenticarse | PASS |

Si la pantalla recordada ya no existe o el usuario perdió permisos, los guards lo llevan al
Dashboard de la última compañía utilizada. Nunca queda en una pantalla inválida.

---

## FASE 6 — TEAM READINESS

| Persona | Rol previsto | Estado operativo |
|---|---|---|
| Jorge C. | Owner (Quality + MyStaff) | 🟢 Listo |
| Keury C. | Owner (Quality + MyStaff) | 🟢 Listo |
| Sebastián V. | Administrador de Turnos | 🟢 Listo (9 módulos, 4 acciones, ambas empresas) |
| María S. | Administrador de Cierre | 🟢 Listo (9 módulos, 6 acciones, ambas empresas) |
| Duván G. | Administrador de Cierre | 🟢 Listo en MyStaff · 🟡 su ficha en Quality quedó archivada tras la unificación de PIN: entra y administra, pero no aparece como persona activa de Quality |

Cada uno ejecuta sólo las funciones de su rol; ninguno tiene Platform Owner ni Super Admin.

---

## CIERRE EJECUTIVO

1. **Foundation:** 100 %
2. **Quality Staff Readiness:** 100 %
3. **MyStaff Readiness:** 90 %
4. **Premium Experience:** 95 %
5. **Operational Readiness:** **95 %**
6. **P0 abiertos:** Ninguno.
7. **P1 abiertos:**
   - Mapeo de Connecteam en MyStaff (decisión humana, sin código).
   - Ficha de Duván en Quality archivada tras la unificación de PIN (visibilidad, no acceso).
   - MyStaff sin sitios de trabajo cargados y sin servicios de prueba.
8. **¿Qué bloquea producción hoy?** Nada. Los tres puntos abiertos son configuración y datos,
   no defectos de producto.
9. **¿Listo para TestFlight?** **SÍ**
10. **¿Listo para prueba operativa ampliada con usuarios reales?** **SÍ**
11. **VEREDICTO FINAL: 🟡 GO WITH CONDITIONS**

### Condiciones para autorizar la siguiente fase
1. Definir el mapeo de Connecteam de MyStaff antes de su primera exportación de nómina.
2. Cargar al menos los sitios de trabajo recurrentes de MyStaff antes de operar turnos reales allí.
3. Restaurar la visibilidad de la ficha de Duván en Quality Staff (o confirmar que opera sólo
   desde MyStaff) antes de asignarle cierres en Quality.
4. Ejecutar la prueba de campo con los 10 trabajadores en Quality Staff antes de ampliar a MyStaff.

Cumplidas estas cuatro condiciones, la certificación pasa a 🟢 GO sin reservas.
