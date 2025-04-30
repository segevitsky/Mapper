// env-config.ts

export const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };
  
  export const authConfig = {
    tokenExpiryTime: parseInt(import.meta.env.VITE_AUTH_TOKEN_EXPIRY || '86400000'),
    autoAuth: import.meta.env.VITE_AUTH_AUTO_LOGIN === 'true'
  };
  
  export const storageConfig = {
    teamPath: import.meta.env.VITE_TEAM_STORAGE_PATH || 'teams',
    indicatorsPath: import.meta.env.VITE_INDICATORS_STORAGE_PATH || 'indicators'
  };