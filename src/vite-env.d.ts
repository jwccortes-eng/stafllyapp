/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_SUPABASE_PROJECT_ID: string;
  readonly VITE_APP_BASE_URL?: string;
  readonly VITE_APP_FLAVOR?: "parceros" | "stafly";
  readonly VITE_APP_ENV?: "production" | "staging" | "demo";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
