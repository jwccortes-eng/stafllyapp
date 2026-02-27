

# Plan: Mostrar saludo con nombre, empresa, periodo y estado en todos los tableros

## Estado: ✅ COMPLETADO

## Resumen
Agregar un encabezado consistente en los 4 tableros principales (Admin Dashboard, Owner Dashboard, MyPayments, Accumulated) que muestre:
- Saludo con nombre y apellido del usuario
- Nombre de la empresa
- Periodo en curso (fechas)
- Estado del periodo (Abierto / Cerrado / Publicado)

## Cambios realizados

### 1. ✅ Hook useAuth - Exponer nombre del usuario
`fullName` ya expuesto desde `profiles.full_name`.

### 2. ✅ Admin Dashboard (`src/pages/admin/Dashboard.tsx`)
Hero greeting muestra saludo + nombre completo + empresa + periodo con estado.

### 3. ✅ Owner Dashboard (`src/pages/admin/OwnerDashboard.tsx`)
Hero greeting muestra saludo + nombre completo + filtro de empresa + resumen consolidado.

### 4. ✅ Portal - Mis Pagos (`src/pages/portal/MyPayments.tsx`)
Saludo con nombre del empleado, empresa, periodo en curso y estado.

### 5. ✅ Portal - Acumulado (`src/pages/portal/Accumulated.tsx`)
Saludo con nombre del empleado, empresa, periodo en curso y estado.
