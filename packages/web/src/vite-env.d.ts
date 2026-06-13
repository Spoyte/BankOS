/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_ENGINE_URL?: string;
  readonly VITE_POLICY_URL?: string;
  readonly VITE_DYNAMIC_ENVIRONMENT_ID?: string;
  readonly VITE_ENABLE_LIFI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
