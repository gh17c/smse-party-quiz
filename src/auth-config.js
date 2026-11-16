export const AUTH_CONFIG = {
  supabaseUrl: 'https://zdmrtbdxbblftpvaqcpy.supabase.co',
  anonKey: 'sb_publishable_MEFvXOvCPKSDi71ZS1lFkA_wNeIuqAL',
  requireLogin: true,
};

export const isAuthConfigured = Boolean(AUTH_CONFIG.supabaseUrl && AUTH_CONFIG.anonKey);
