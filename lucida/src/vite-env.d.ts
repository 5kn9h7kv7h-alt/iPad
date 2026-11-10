/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_LUCIDA_BACKEND?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_LUCIDA_AI_ENDPOINT?: string;
  readonly VITE_LUCIDA_ANALYZE_ENDPOINT?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
