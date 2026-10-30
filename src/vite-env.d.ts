/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Mapillary Client Token (aus .env bzw. GitHub-Secret beim Veröffentlichen) */
  readonly VITE_MAPILLARY_TOKEN?: string;
}
