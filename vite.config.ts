import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

// Read version straight from package.json so the running bundle is traceable.
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf-8"),
);
const APP_VERSION: string = pkg.version || "0.0.0";
const APP_BUILD_TIME: string = new Date().toISOString();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  define: {
    // Surfaced in the UI by <BuildVersionBadge /> and used by pwa-runtime.ts
    // to debug stale-cache issues (e.g. Aline / iPhone, Apr 2026).
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILD_TIME__: JSON.stringify(APP_BUILD_TIME),
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      // We register the SW manually from src/lib/pwa-runtime.ts so we can
      // gate it on production + non-iframe + non-preview hosts and surface a
      // "new version available" toast.
      injectRegister: false,
      // Never register the SW during local/preview dev — avoids stale-cache + iframe issues.
      devOptions: { enabled: false },
      includeAssets: ["favicon.png", "favicon.ico"],
      workbox: {
        // Take control of open clients immediately so a freshly-installed SW
        // never serves the old bundle alongside the new one.
        skipWaiting: true,
        clientsClaim: true,
        // Always clean up obsolete precache entries on activate.
        cleanupOutdatedCaches: true,
        // Public entry points must NEVER be served by the SW — fresh recipients
        // (no prior visit) must hit the server directly so they get the latest
        // bundle, not a cached one from a previous device install.
        navigateFallbackDenylist: [/^\/~oauth/, /^\/s\//, /^\/apply\//, /^\/invite/, /^\/activate\//, /^\/join\//],
        globPatterns: ["**/*.{js,css,html,ico,png,jpg,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Cache Supabase REST API calls (stale-while-revalidate)
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "supabase-api-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cache Supabase Storage (images, docs)
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "supabase-storage-cache",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cache Google Fonts
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "STAFLY",
        short_name: "STAFLY",
        description: "Turnos, asistencia y nómina semanal — Scheduling, time tracking & weekly payroll",
        theme_color: "#1a7de8",
        background_color: "#f5f6fa",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
}));
