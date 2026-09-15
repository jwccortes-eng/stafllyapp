# Ajustes — identidad canónica y experiencia operativa

## Objetivo
Actualizar `/app/movements` para que use el lenguaje visual operativo actual y la misma identidad de trabajador que Equipo, conservando íntegramente consultas, importación, importes, aprobaciones y permisos.

## Cambios
1. **Identidad única**
   - Ampliar la lectura existente de trabajadores/movimientos únicamente con `avatar_url` y los campos mínimos necesarios para presentar la identidad canónica.
   - Sustituir `EmployeeAvatar` —cuyo fallback genera ilustraciones— por el patrón actual `EntityCard`/`buildWorkerEntityView`, adaptado como identidad compacta dentro de tabla y tarjetas.
   - Foto real cuando exista; iniciales canónicas cuando no exista. Sin crear ni modificar datos de trabajador.

2. **Contexto del período y resumen**
   - Migrar la cabecera a `OperationalScreenHeader`, mostrando claramente las fechas del período activo.
   - Reutilizar el selector de período y presentar un resumen compacto derivado solo de los movimientos ya cargados: cantidad, extras aprobados, deducciones aprobadas y neto de movimientos.
   - No introducir un total de nómina ni persistir agregados.

3. **Filtros operativos**
   - Mantener búsqueda por persona/concepto y añadir filtros canónicos para Todos, Extras, Deducciones, Pendientes y Aprobados.
   - Derivar cada filtro de `concepts.category` y `approval_status` existentes, sin estados nuevos.

4. **Escritorio y móvil**
   - Escritorio conserva una tabla densa y escaneable con Persona, Concepto, Tipo, Estado, Cant., Valor, Total, Origen y Acciones.
   - Móvil muestra tarjetas —no una tabla comprimida— con identidad, concepto, tipo/estado, total, cálculo cantidad × valor, origen y acceso al detalle.
   - Las mismas acciones de aprobar, denegar, editar y eliminar conservarán sus condiciones actuales.

5. **Trazabilidad**
   - Conservar toda la información del tooltip actual y ofrecerla mediante detalle accesible tanto en escritorio como en móvil.
   - Mantener notas, fuente/origen, motivo de denegación y desglose de cantidad por valor.

6. **Validación y reporte**
   - Verificar escritorio y móvil en la vista real: foto, fallback, filtros, detalle, acciones, ausencia de ilustraciones y desbordamiento.
   - Ejecutar pruebas relevantes y comparar los totales derivados antes/después sin realizar escrituras de nómina.
   - Documentar el resultado y los usos legacy encontrados fuera de esta pantalla en `docs/qa/P1_PAYROLL_ADJUSTMENTS_UX_CANONICAL_IDENTITY.md`.

## Detalles técnicos
- Se limitarán los cambios a presentación y campos de lectura en `src/pages/admin/Movements.tsx`, con un componente visual pequeño solo si evita duplicación dentro de la misma pantalla.
- Se reutilizarán exclusivamente componentes y tokens canónicos existentes de Stafly.
- No habrá migraciones, cambios de backend, mutaciones de datos, nuevas fórmulas ni cambios en los handlers de movimientos.
