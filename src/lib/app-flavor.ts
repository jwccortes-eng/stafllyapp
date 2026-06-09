/**
 * App flavor — build-time identifier of which native shell (or web build) is
 * running. Set via Vite env at build:
 *
 *   VITE_APP_FLAVOR=parceros npm run build   → Parceros native build
 *   VITE_APP_FLAVOR=stafly   npm run build   → Stafly Core native build
 *   (unset)                                  → standard web (Stafly default)
 *
 * Used ONLY to:
 *   1. Redirect `/` to `/parceros` in the Parceros native shell.
 *   2. Treat post-login as `from=parceros` so the user lands on `/parceros`.
 *
 * Does NOT touch auth backend, RLS, payroll, tenants, or any data. Pure
 * presentational routing toggle.
 */
export type AppFlavor = "parceros" | "stafly";

const RAW = (import.meta.env.VITE_APP_FLAVOR ?? "").toString().toLowerCase();

export const APP_FLAVOR: AppFlavor = RAW === "parceros" ? "parceros" : "stafly";

export const IS_PARCEROS_FLAVOR = APP_FLAVOR === "parceros";
