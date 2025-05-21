/// <reference types="vite/client" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
    // Add these new environment variables
    readonly VITE_FIREBASE_API_KEY: string;
    readonly VITE_FIREBASE_AUTH_DOMAIN: string;
    readonly VITE_FIREBASE_PROJECT_ID: string;
    readonly VITE_FIREBASE_STORAGE_BUCKET: string;
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
    readonly VITE_FIREBASE_APP_ID: string;
    readonly VITE_AUTH_TOKEN_EXPIRY: string;
    readonly VITE_AUTH_AUTO_LOGIN: string;
    readonly VITE_TEAM_STORAGE_PATH: string;
    readonly VITE_INDICATORS_STORAGE_PATH: string;
    
    // Keep any existing environment variables you may already have
  }
  
  // This interface may already exist in your file - if so, don't duplicate it
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }