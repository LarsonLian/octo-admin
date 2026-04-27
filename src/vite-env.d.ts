/// <reference types="vite/client" />

declare const __BUILD_TIME__: number

interface ImportMetaEnv {
  readonly VITE_API_BASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
