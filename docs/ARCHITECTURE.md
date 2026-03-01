# StaflyApps — Documentación Técnica

## Arquitectura General

```
┌────────────────────────────────────────────────┐
│                  FRONTEND                       │
│  React 18 + TypeScript + Vite + Tailwind CSS   │
│  PWA (vite-plugin-pwa) + Capacitor (mobile)    │
└────────────────┬───────────────────────────────┘
                 │ HTTPS
┌────────────────▼───────────────────────────────┐
│              LOVABLE CLOUD                      │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ Supabase │ │  Edge    │ │    Storage     │  │
│  │ Auth     │ │ Functions│ │    (files)     │  │
│  └──────────┘ └──────────┘ └────────────────┘  │
│  ┌──────────────────────────────────────────┐  │
│  │         PostgreSQL + RLS                 │  │
│  │    Row Level Security per company        │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
                 │
┌────────────────▼───────────────────────────────┐
│            SERVICIOS EXTERNOS                   │
│  Stripe (billing) · SMTP (emails)              │
└────────────────────────────────────────────────┘
```

## Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend | React + TypeScript | 18.3 |
| Build | Vite | 5.x |
| Estilos | Tailwind CSS + shadcn/ui | 3.x |
| Estado servidor | TanStack React Query | 5.x |
| Routing | React Router DOM | 6.x |
| Backend | Supabase (PostgreSQL 15) | — |
| Auth | Supabase Auth (JWT) | — |
| Functions | Deno Edge Functions | — |
| Pagos | Stripe | — |
| PWA | vite-plugin-pwa | 1.x |
| Mobile | Capacitor | 8.x |

## Estructura del proyecto

```
src/
├── assets/              # Imágenes y recursos estáticos
├── components/
│   ├── brand/           # Logo, isotipo, mascota
│   ├── navigation/      # Sidebar, dock, nav items
│   ├── shifts/          # Componentes de turnos
│   ├── timeclock/       # Componentes de reloj
│   ├── today/           # Vista Today
│   ├── audit/           # Panel de auditoría
│   ├── billing/         # Banners de upgrade
│   ├── portal/          # Componentes del portal
│   └── ui/              # shadcn/ui + componentes reutilizables
├── hooks/               # Custom hooks (useAuth, useCompany, etc.)
├── integrations/        # Cliente Supabase (auto-generado)
├── lib/                 # Utilidades y helpers
├── pages/
│   ├── admin/           # Páginas del panel admin (~40 páginas)
│   ├── portal/          # Páginas del portal empleado (~12 páginas)
│   ├── legal/           # Términos, privacidad, cookies
│   └── help/            # Centro de ayuda
├── test/                # Tests unitarios
└── App.tsx              # Router principal

supabase/
├── config.toml          # Configuración Supabase
├── migrations/          # Migraciones SQL (esquema DB)
└── functions/           # Edge Functions (Deno)
    ├── auth-email-hook/ # Emails personalizados
    ├── billing-*/       # Stripe checkout, webhook, portal
    ├── employee-auth/   # Autenticación de empleados
    ├── employee-chat/   # Chat con IA
    ├── external-api/    # API pública
    ├── setup-company/   # Onboarding automático
    └── send-payroll-email/ # Envío de recibos
```

## Base de datos — Tablas principales

| Tabla | Descripción | RLS |
|-------|-------------|-----|
| `companies` | Empresas/tenants | ✅ |
| `company_users` | Relación usuario↔empresa + rol | ✅ |
| `employees` | Empleados por empresa | ✅ |
| `shifts` | Turnos programados | ✅ |
| `time_entries` | Fichajes clock-in/out | ✅ |
| `pay_periods` | Periodos de pago | ✅ |
| `period_base_pay` | Base pay consolidado | ✅ |
| `movements` | Novedades de nómina | ✅ |
| `concepts` | Conceptos de nómina | ✅ |
| `clients` | Clientes de la empresa | ✅ |
| `locations` | Ubicaciones de trabajo | ✅ |
| `announcements` | Anuncios internos | ✅ |
| `notifications` | Sistema de notificaciones | ✅ |
| `activity_log` | Registro de auditoría | ✅ |
| `conversations` / `internal_messages` | Chat interno | ✅ |

## Autenticación y roles

### Flujo de auth
1. **Admin**: Registro con email + contraseña → auto-provisioning de empresa
2. **Empleado**: Invitación por teléfono → registro con PIN → vinculación a empresa

### Roles del sistema
| Rol | Alcance |
|-----|---------|
| `owner` | Super admin, acceso total, gestión de billing |
| `admin` | Gestión completa de la empresa |
| `manager` | Gestión operativa (turnos, fichajes, nómina) |
| `supervisor` | Vista y aprobación limitada |
| `employee` | Portal del empleado únicamente |

## Edge Functions

| Función | Propósito | Auth |
|---------|-----------|------|
| `setup-company` | Provisioning automático de empresa nueva | ✅ JWT |
| `billing-checkout` | Crear sesión Stripe Checkout | ✅ JWT |
| `billing-webhook` | Procesar eventos Stripe | ❌ (webhook) |
| `billing-subscription-status` | Consultar estado de suscripción | ✅ JWT |
| `billing-customer-portal` | Redirigir a portal Stripe | ✅ JWT |
| `employee-auth` | Auth por teléfono + PIN | ❌ Public |
| `employee-chat` | Chat IA para empleados | ✅ JWT |
| `send-payroll-email` | Enviar recibos de nómina | ✅ JWT |
| `admin-reset-password` | Reset password por admin | ✅ JWT |
| `invite-admin` | Invitar nuevo admin | ✅ JWT |
| `auth-email-hook` | Personalizar emails de auth | ❌ (hook) |
| `external-api` | API pública para integraciones | ✅ API Key |
| `payroll-consolidate` | Consolidar base pay de periodo | ✅ JWT |

## Seguridad

### Row Level Security (RLS)
- Todas las tablas tienen RLS activado
- Políticas basadas en `company_id` del usuario autenticado
- Aislamiento total entre empresas (multi-tenant)

### Audit Trail
- Tabla `activity_log` registra: acción, entidad, usuario, datos old/new
- Trigger automático en operaciones críticas

## Deployment

### Frontend
- Build: `npm run build` (Vite)
- Deploy: Automático vía Lovable Cloud
- CDN: Edge delivery global

### Backend
- Edge Functions: Deploy automático al guardar
- Migraciones: Via herramienta de migración de Lovable Cloud
- Secrets: Gestionados via Lovable Cloud

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon key pública |
| `STRIPE_SECRET_KEY` | API key de Stripe (secret) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret |
| `LOVABLE_API_KEY` | API key para Lovable AI gateway |

## Convenciones de código

- **Componentes**: PascalCase, un componente por archivo
- **Hooks**: `use` prefix, en `/hooks`
- **Estilos**: Tailwind utility classes + design tokens semánticos
- **Estado**: React Query para servidor, useState/useReducer para local
- **Formularios**: React Hook Form + Zod validation
- **Iconos**: Lucide React
- **Fechas**: date-fns
- **Exportación**: ExcelJS para .xlsx, jsPDF para .pdf
