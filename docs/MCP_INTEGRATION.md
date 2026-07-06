# Stafly MCP — Agent Integrations (Fase 1)

## Qué es MCP en Stafly

Stafly expone un servidor **MCP (Model Context Protocol)** que permite que
agentes externos (ChatGPT, Claude, Cursor, etc.) se conecten a tu cuenta de
Stafly y usen un catálogo de herramientas **solo lectura** para consultar
información básica del worker autenticado.

- **Endpoint:** `https://<project-ref>.supabase.co/functions/v1/mcp`
- **Auth:** OAuth 2.1 (Supabase Auth) con Dynamic Client Registration.
- **Consent:** `https://staflyapps.com/.lovable/oauth/consent` (español).
- **Fuente:** `src/lib/mcp/` (auto-bundled a `supabase/functions/mcp/`).

## Tools actuales (v0.2.0)

| Tool | Read-only | Qué hace |
|---|---|---|
| `echo` | ✅ | Devuelve el texto que le mandas. Health-check. |
| `whoami` | ✅ | Devuelve `user_id`, `email`, `client_id`. |
| `list_my_shifts` | ✅ | Devuelve tus próximos turnos (1-30 días). |

Todas las invocaciones:
- Se **rate-limitan por usuario y tool** (60 rpm global, 20 rpm para `list_my_shifts`).
- Se **auditan** en `mcp_invocations` (metadata mínima; sin argumentos, sin respuestas, sin tokens).

## Qué datos expone

- Tu identidad básica: `user_id`, `email`, `oauth_client_id`.
- Turnos donde **tú** estás asignado, únicamente si tu registro de employee está `is_active=true`:
  - `assignment_id`, `assignment_status`
  - `shift_id`, `start_at`, `end_at`, `title`
  - `meeting_point` (texto libre)
  - `publication_status`
  - `company_id`, `company_name` (para desambiguar multi-tenant)

## Qué datos **NO** expone

- Payroll, hourly rates, montos, deducciones.
- Time entries, closeouts, GPS.
- Otros workers, sus horarios, teléfonos, correos.
- Documentos (W-9, IDs, contratos, compliance).
- Chat, anuncios, notificaciones.
- Datos administrativos, notas internas.
- Datos cross-tenant (RLS lo bloquea).

## Qué **NO** puede hacer

- Ningún write: no crea, edita, aprueba ni borra turnos, horas, payroll, empleados, documentos, mensajes ni nada.
- No usa `service_role` — todas las queries corren con tu bearer token bajo RLS.

## Cómo conectar

### ChatGPT (Custom GPT / Connectors)
1. Settings → Connectors → **Add** → MCP server.
2. URL: `https://jplhtputzixwqarqlrth.supabase.co/functions/v1/mcp`
3. Auth: OAuth (autodetectado por discovery).
4. ChatGPT abrirá la pantalla de consent en Stafly. Aprueba.
5. Prueba: `usa la herramienta whoami de Stafly`.

### Claude Desktop
1. Settings → Developer → **Add MCP Server** → Remote.
2. URL: `https://jplhtputzixwqarqlrth.supabase.co/functions/v1/mcp`
3. Auth: OAuth.
4. Aprueba en la pantalla de consent.
5. Prueba: `list_my_shifts days_ahead=7`.

### Cursor
1. Settings → MCP → **Add server** → Remote HTTP.
2. Pega la URL de arriba, elige OAuth.
3. Aprueba en Stafly.

## Cómo probar cada tool

- `echo`: manda `{ "text": "hola" }` → devuelve `hola`.
- `whoami`: sin input → devuelve JSON con tu identidad.
- `list_my_shifts`: opcional `{ "days_ahead": 14, "limit": 20 }` → devuelve tus próximos turnos.

## Cómo revocar acceso

- **Fase 1 (ahora):** `/portal/integrations` muestra los clientes que han
  conectado tu cuenta. La revocación in-app aparece como "Disponible pronto".
  Para revocar inmediatamente, escribe a **info@staflyapps.com** con el
  `client_id` que aparece en tu pantalla de Integraciones.
- **Fase 2 (próximamente):** botón directo de "Revocar" en `/portal/integrations`.

Cerrar sesión en Stafly **no** revoca los tokens OAuth ya emitidos.

## Troubleshooting

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `401 Unauthorized` en el cliente MCP | Token expirado | Reconecta el server desde el cliente MCP — el refresh es automático la próxima vez. |
| `list_my_shifts` devuelve `[]` | No tienes turnos futuros en la ventana pedida, o tu employee record está `is_active=false`, o no tienes employee record ligado a tu `user_id`. | Confirma con tu admin que estés activo y con turnos asignados. |
| `whoami` OK pero `list_my_shifts` vacío | Cuenta sin employee (ej. admin puro sin worker record) | Comportamiento esperado. |
| Usuario en múltiples compañías | Los turnos vienen con `company_name` para diferenciar. | Filtra por `company_name` en el prompt del agente. |
| Usuario invited sin `user_id` linkeado | Aún no ha completado el login. | Debe iniciar sesión al menos una vez en Stafly. |
| `Rate limit exceeded` | Más de 60 llamadas/min por user, o más de 20/min a `list_my_shifts`. | Espera ~60s. |
| Consent page no carga | `authorization_id` faltante o expirado | Reinicia el flujo de conexión desde el cliente MCP. |

## Referencias técnicas

- Server entry: `src/lib/mcp/index.ts`
- Tools: `src/lib/mcp/tools/{echo,whoami,list-my-shifts}.ts`
- Audit + rate limit helper: `src/lib/mcp/lib/audit.ts`
- Audit log DB: `public.mcp_invocations` (RLS: usuario ve solo su historial; owners globales ven todo).
- Consent UI: `src/pages/OAuthConsent.tsx`
- Integrations UI: `src/pages/portal/Integrations.tsx`
- Manifest: `.lovable/mcp/manifest.json` (regenerado con `app_mcp_server--extract_mcp_manifest`).
- Redeploy tras cambios: `supabase--deploy_edge_functions` con `function_names: ["mcp"]`.
