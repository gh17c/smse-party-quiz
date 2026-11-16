export const AUTH_CONFIG = {
  supabaseUrl: '',
  anonKey: '',
  requireLogin: false,
};

export const isAuthConfigured = Boolean(AUTH_CONFIG.supabaseUrl && AUTH_CONFIG.anonKey);
