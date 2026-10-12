/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_BUILD__: string;

interface ImportMetaEnv {
  /** Optional absolute backend origin (e.g. https://api.example.com). */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
